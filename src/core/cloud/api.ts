import { sanitizeTextForCloud, detectPII } from './sanitizer';
import {
  checkTokenBudget,
  consumeTokens,
  checkRateLimit,
  TokenBudget,
} from '../safety/guard';
import { createCircuitBreaker, canCall, recordSuccess, recordFailure, resetCircuitBreaker } from '../safety/circuit-breaker';

/** AI provider default configuration */
export const AI_PROVIDER_DEFAULTS = {
  /** Default LLM model name */
  MODEL: 'gpt-4o',
  /** Default base URL for OpenAI-compatible API */
  BASE_URL: 'https://api.openai.com/v1',
  /** Default generation temperature */
  TEMPERATURE: 0.7,
  /** Default max output tokens */
  MAX_TOKENS: 500,
} as const;

/** Rate limit configuration for cloud LLM calls */
const RATE_LIMIT_CONFIG = {
  MAX_CALLS_PER_MINUTE: 10,
  MAX_CALLS_PER_HOUR: 100,
  WINDOW_MS: 60_000,
} as const;

/** Default token budget configuration */
const TOKEN_BUDGET_DEFAULTS = {
  MONTHLY_LIMIT: 50_000,
  USED: 0,
  WARNING_THRESHOLD: 0.8,
} as const;

/** Allowed cloud API hostnames (whitelist) */
const ALLOWED_CLOUD_HOSTNAMES: readonly string[] = [
  'api.openai.com',
  'token-plan-cn.xiaomimimo.com',
];

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
}

export interface CloudResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
  functionCall?: {
    name: string;
    arguments: string;
  };
}

const defaultBudget = {
  monthlyLimit: TOKEN_BUDGET_DEFAULTS.MONTHLY_LIMIT,
  used: TOKEN_BUDGET_DEFAULTS.USED,
  resetPeriod: `${new Date().getFullYear()}-${new Date().getMonth()}`,
  warningThreshold: TOKEN_BUDGET_DEFAULTS.WARNING_THRESHOLD,
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

  let chatCompletionsUrl: string;
  try {
    chatCompletionsUrl = await resolveChatCompletionsUrl(request.baseUrl);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : '云端 API 地址无效',
      degraded: true,
    };
  }

  try {
    const body: Record<string, unknown> = {
      model: request.model || AI_PROVIDER_DEFAULTS.MODEL,
      messages: sanitizedMessages,
      temperature: request.temperature ?? AI_PROVIDER_DEFAULTS.TEMPERATURE,
    };
    body[request.tokenParam || 'max_tokens'] = request.maxTokens || AI_PROVIDER_DEFAULTS.MAX_TOKENS;
    if (request.thinking) {
      body.thinking = request.thinking;
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

    const rateCheck = checkRateLimit('cloud_llm', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.reason, degraded: false };
    }

    const fetchResponse = await fetch(chatCompletionsUrl, {
      method: 'POST',
      redirect: 'error',
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
      model: data.model || request.model || AI_PROVIDER_DEFAULTS.MODEL,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
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

async function resolveChatCompletionsUrl(baseUrl?: string): Promise<string> {
  const normalized = (await validateCloudBaseUrl(baseUrl || AI_PROVIDER_DEFAULTS.BASE_URL)).replace(/\/$/, '');
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
}

async function validateCloudBaseUrl(baseUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('云端 API 地址无效');
  }

  if (url.protocol !== 'https:') {
    throw new Error('云端 API 地址必须使用 HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('云端 API 地址不能包含用户名或密码');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    isLocalIPv4(hostname)
  ) {
    throw new Error('云端 API 地址不能指向本机地址');
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    throw new Error('云端 API 地址不能指向私网地址');
  }

  if (parseIPv4Octets(hostname) || hostname.includes(':') || !isAllowedCloudHostname(hostname)) {
    throw new Error('云端 API 地址域名不在允许列表');
  }

  return url.toString();
}

function isAllowedCloudHostname(hostname: string): boolean {
  return ALLOWED_CLOUD_HOSTNAMES.includes(hostname);
}

function parseIPv4Octets(hostname: string): number[] | undefined {
  const parts = hostname.split('.');
  if (parts.length !== 4) return undefined;

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet, index) => !/^\d+$/.test(parts[index]) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets;
}

function isLocalIPv4(hostname: string): boolean {
  const octets = parseIPv4Octets(hostname);
  return !!octets && octets[0] === 127;
}

function isPrivateIPv4(hostname: string): boolean {
  const octets = parseIPv4Octets(hostname);
  if (!octets) return false;

  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const mappedIPv4 = parseIPv4MappedIPv6(normalized);
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    (mappedIPv4 !== undefined && (isLocalIPv4(mappedIPv4) || isPrivateIPv4(mappedIPv4)))
  );
}

function parseIPv4MappedIPv6(hostname: string): string | undefined {
  const parts = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (parts) {
    const high = parseInt(parts[1], 16);
    const low = parseInt(parts[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  const compressed = hostname.match(/^::ffff:([0-9a-f]{1,7})$/);
  if (!compressed) return undefined;

  const value = parseInt(compressed[1], 16);
  return `${(value >>> 24) & 255}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`;
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

export async function* callCloudLLMStream(
  request: CloudRequest,
  apiKey?: string
): AsyncGenerator<{
  type: 'token' | 'function_call' | 'done' | 'error';
  content?: string;
  functionCall?: { name: string; arguments: string };
  error?: string;
}> {
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

  let chatCompletionsUrl: string;
  try {
    chatCompletionsUrl = await resolveChatCompletionsUrl(request.baseUrl);
  } catch (e) {
    yield { type: 'error', error: e instanceof Error ? e.message : '云端 API 地址无效' };
    return;
  }

  try {
    const body: Record<string, unknown> = {
      model: request.model || AI_PROVIDER_DEFAULTS.MODEL,
      messages: sanitizedMessages,
      temperature: request.temperature ?? AI_PROVIDER_DEFAULTS.TEMPERATURE,
      stream: true,
    };
    body[request.tokenParam || 'max_tokens'] = request.maxTokens || AI_PROVIDER_DEFAULTS.MAX_TOKENS;
    if (request.thinking) {
      body.thinking = request.thinking;
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

    const rateCheck = checkRateLimit('cloud_llm', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
    if (!rateCheck.allowed) {
      yield { type: 'error', error: rateCheck.reason };
      return;
    }

    const fetchResponse = await fetch(chatCompletionsUrl, {
      method: 'POST',
      redirect: 'error',
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

    const parseStreamLine = (line: string): { type: 'token'; content: string } | undefined => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return undefined;

      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') return undefined;

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
          return { type: 'token', content: delta.content };
        }

        if (parsed.usage?.total_tokens) {
          totalTokens = parsed.usage.total_tokens;
        }
      } catch {
        // Skip malformed JSON chunks
      }
      return undefined;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) yield event;
      }
    }

    const finalLine = buffer + decoder.decode();
    const finalEvent = parseStreamLine(finalLine);
    if (finalEvent) yield finalEvent;

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
