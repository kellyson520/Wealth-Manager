import { sanitizeTextForCloud, detectPII } from './sanitizer';
import {
  checkTokenBudget,
  consumeTokens,
  checkRateLimit,
  TokenBudget,
} from '../safety/guard';
import { createCircuitBreaker, canCall, recordSuccess, recordFailure, resetCircuitBreaker } from '../safety/circuit-breaker';

export interface CloudRequest {
  messages: { role: string; content: string }[];
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  tokenParam?: 'max_tokens' | 'max_completion_tokens';
  thinking?: Record<string, unknown>;
  toolMode?: 'functions' | 'tools';
  functions?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
  functionCall?: 'auto' | 'none' | { name: string };
  temperature?: number;
  promptCacheKey?: string;
  promptCacheRetention?: string;
}

export interface CloudResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; cachedPromptTokens?: number };
  functionCall?: {
    name: string;
    arguments: string;
  };
}

const defaultBudget = {
  monthlyLimit: 50000,
  used: 0,
  resetDay: new Date().getDate(),
  warningThreshold: 0.8,
};

let tokenBudget: TokenBudget = { ...defaultBudget };
const breaker = createCircuitBreaker(5, 30000);

export function resetForTest(): void {
  tokenBudget = { ...defaultBudget };
  resetCircuitBreaker(breaker);
}

export function setTokenBudget(budget: Partial<TokenBudget>): void {
  tokenBudget = { ...tokenBudget, ...budget };
}

export async function callCloudLLM(
  request: CloudRequest,
  apiKey?: string
): Promise<{ success: boolean; response?: CloudResponse; error?: string; degraded: boolean }> {
  const rateCheck = checkRateLimit('cloud_llm', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return { success: false, error: rateCheck.reason, degraded: false };
  }

  const originalPromptText = request.messages.map((m) => m.content).join(' ');
  const piiCheck = detectPII(originalPromptText);
  if (piiCheck.hasPII) {
    return {
      success: false,
      error: `内容包含敏感信息: ${piiCheck.types.join(', ')}，已阻止上传`,
      degraded: true,
    };
  }

  const sanitizedMessages = request.messages.map((m) => ({
    ...m,
    content: sanitizeContent(m.content),
  }));

  const promptText = sanitizedMessages.map((m) => m.content).join(' ');
  const estimatedTokens = Math.ceil(promptText.length / 3);
  const budgetCheck = checkTokenBudget(tokenBudget, estimatedTokens);
  if (!budgetCheck.allowed) {
    return { success: false, error: budgetCheck.reason, degraded: true };
  }

  if (!canCall(breaker)) {
    return {
      success: false,
      error: '云端服务暂时不可用（熔断保护），已切换到本地处理模式',
      degraded: true,
    };
  }

  if (!apiKey) {
    return {
      success: false,
      error: '未配置云端 API 密钥，使用本地处理',
      degraded: true,
    };
  }

  try {
    const body: Record<string, unknown> = {
      model: request.model || 'gpt-4o',
      messages: sanitizedMessages,
      temperature: request.temperature ?? 0.7,
    };
    body[request.tokenParam || 'max_tokens'] = request.maxTokens || 500;
    if (request.thinking) {
      body.thinking = request.thinking;
    }
    if (request.promptCacheKey) {
      body.prompt_cache_key = request.promptCacheKey;
    }
    if (request.promptCacheRetention) {
      body.prompt_cache_retention = request.promptCacheRetention;
    }

    if (request.functions && request.functions.length > 0) {
      if (request.toolMode === 'tools') {
        body.tools = request.functions.map((fn) => ({
          type: 'function',
          function: fn,
        }));
        body.tool_choice = normalizeToolChoice(request.functionCall);
      } else {
        body.functions = request.functions;
        body.function_call = request.functionCall || 'auto';
      }
    }

    const fetchResponse = await fetch(resolveChatCompletionsUrl(request.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!fetchResponse.ok) {
      recordFailure(breaker);
      return { success: false, error: `API 返回错误 ${fetchResponse.status}`, degraded: true };
    }

    const data = await fetchResponse.json();
    const actualTokens = (data.usage?.total_tokens || estimatedTokens);
    consumeTokens(tokenBudget, actualTokens);
    recordSuccess(breaker);

    const cloudResponse: CloudResponse = {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || request.model || 'gpt-4o',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        cachedPromptTokens: extractCachedPromptTokens(data.usage),
      },
    };

    const message = data.choices?.[0]?.message;
    const fnCall = message?.function_call || normalizeToolCall(message?.tool_calls?.[0]);
    if (fnCall) {
      cloudResponse.functionCall = {
        name: fnCall.name,
        arguments: fnCall.arguments,
      };
    }

    return {
      success: true,
      response: cloudResponse,
      degraded: false,
    };
  } catch {
    recordFailure(breaker);
    return { success: false, error: '网络异常，已切换到本地处理', degraded: true };
  }
}

function sanitizeContent(content: string): string {
  return sanitizeTextForCloud(content);
}

function resolveChatCompletionsUrl(baseUrl?: string): string {
  const normalized = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
}

function normalizeToolChoice(
  functionCall?: 'auto' | 'none' | { name: string }
): 'auto' | 'none' | { type: 'function'; function: { name: string } } {
  if (!functionCall || functionCall === 'auto' || functionCall === 'none') {
    return functionCall || 'auto';
  }
  return { type: 'function', function: { name: functionCall.name } };
}

function normalizeToolCall(toolCall: unknown): { name: string; arguments: string } | undefined {
  const call = toolCall as { function?: { name?: string; arguments?: string } } | undefined;
  if (!call?.function?.name) return undefined;
  return {
    name: call.function.name,
    arguments: call.function.arguments || '{}',
  };
}

function extractCachedPromptTokens(usage: unknown): number {
  const u = usage as {
    prompt_tokens_details?: { cached_tokens?: number };
    input_token_details?: { cached_tokens?: number; cache_read?: number };
    cache_read_input_tokens?: number;
    cached_tokens?: number;
  } | undefined;
  return (
    u?.prompt_tokens_details?.cached_tokens ||
    u?.input_token_details?.cached_tokens ||
    u?.input_token_details?.cache_read ||
    u?.cache_read_input_tokens ||
    u?.cached_tokens ||
    0
  );
}

export async function* callCloudLLMStream(
  request: CloudRequest,
  apiKey?: string
): AsyncGenerator<{
  type: 'token' | 'function_call' | 'done' | 'error';
  content?: string;
  functionCall?: { name: string; arguments: string };
  error?: string;
}> {
  const rateCheck = checkRateLimit('cloud_llm', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
  if (!rateCheck.allowed) {
    yield { type: 'error', error: rateCheck.reason };
    return;
  }

  const originalPromptText = request.messages.map((m) => m.content).join(' ');
  const piiCheck = detectPII(originalPromptText);
  if (piiCheck.hasPII) {
    yield { type: 'error', error: `内容包含敏感信息: ${piiCheck.types.join(', ')}，已阻止上传` };
    return;
  }

  const sanitizedMessages = request.messages.map((m) => ({
    ...m,
    content: sanitizeContent(m.content),
  }));

  const promptText = sanitizedMessages.map((m) => m.content).join(' ');
  const estimatedTokens = Math.ceil(promptText.length / 3);
  const budgetCheck = checkTokenBudget(tokenBudget, estimatedTokens);
  if (!budgetCheck.allowed) {
    yield { type: 'error', error: budgetCheck.reason };
    return;
  }

  if (!canCall(breaker)) {
    yield { type: 'error', error: '云端服务暂时不可用（熔断保护）' };
    return;
  }

  if (!apiKey) {
    yield { type: 'error', error: '未配置云端 API 密钥' };
    return;
  }

  try {
    const body: Record<string, unknown> = {
      model: request.model || 'gpt-4o',
      messages: sanitizedMessages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };
    body[request.tokenParam || 'max_tokens'] = request.maxTokens || 500;
    if (request.thinking) {
      body.thinking = request.thinking;
    }
    if (request.promptCacheKey) {
      body.prompt_cache_key = request.promptCacheKey;
    }
    if (request.promptCacheRetention) {
      body.prompt_cache_retention = request.promptCacheRetention;
    }

    if (request.functions && request.functions.length > 0) {
      if (request.toolMode === 'tools') {
        body.tools = request.functions.map((fn) => ({
          type: 'function',
          function: fn,
        }));
        body.tool_choice = normalizeToolChoice(request.functionCall);
      } else {
        body.functions = request.functions;
        body.function_call = request.functionCall || 'auto';
      }
    }

    const fetchResponse = await fetch(resolveChatCompletionsUrl(request.baseUrl), {
	      method: 'POST',
	      headers: {
	        'Content-Type': 'application/json',
	        Authorization: `Bearer ${apiKey}`,
	      },
	      body: JSON.stringify(body),
	    });

    if (!fetchResponse.ok) {
      recordFailure(breaker);
      yield { type: 'error', error: `API 返回错误 ${fetchResponse.status}` };
      return;
    }

    const reader = fetchResponse.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: '无法读取流式响应' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let functionCallName = '';
    let functionCallArgs = '';
    let isFunctionCall = false;
    let totalTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') {
          yield { type: 'done' };
          continue;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;

	          const streamedToolCall = delta?.tool_calls?.[0]?.function;
	          if (delta?.function_call || streamedToolCall) {
	            isFunctionCall = true;
	            if (delta.function_call?.name) {
	              functionCallName = delta.function_call.name;
	            }
	            if (delta.function_call?.arguments) {
	              functionCallArgs += delta.function_call.arguments;
	            }
	            if (streamedToolCall?.name) {
	              functionCallName = streamedToolCall.name;
	            }
	            if (streamedToolCall?.arguments) {
	              functionCallArgs += streamedToolCall.arguments;
	            }
	          } else if (delta?.content) {
            yield { type: 'token', content: delta.content };
          }

          if (parsed.usage?.total_tokens) {
            totalTokens = parsed.usage.total_tokens;
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    if (isFunctionCall) {
      yield {
        type: 'function_call',
        functionCall: { name: functionCallName, arguments: functionCallArgs },
      };
    }

    const actualTokens = totalTokens || estimatedTokens;
    consumeTokens(tokenBudget, actualTokens);
    recordSuccess(breaker);

    yield { type: 'done' };
  } catch (e) {
    recordFailure(breaker);
    yield { type: 'error', error: e instanceof Error ? e.message : '网络异常' };
  }
}
