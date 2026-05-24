import { sanitizeForCloud, detectPII } from './sanitizer';
import {
  checkTokenBudget,
  consumeTokens,
  checkRateLimit,
  TokenBudget,
} from '../safety/guard';
import { createCircuitBreaker, canCall, recordSuccess, recordFailure, resetCircuitBreaker, CircuitBreaker } from '../safety/circuit-breaker';

export interface CloudRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
}

export interface CloudResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
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

  const sanitizedMessages = request.messages.map((m) => ({
    ...m,
    content: sanitizeContent(m.content),
  }));

  const promptText = sanitizedMessages.map((m) => m.content).join(' ');
  const piiCheck = detectPII(promptText);
  if (piiCheck.hasPII) {
    return {
      success: false,
      error: `内容包含敏感信息: ${piiCheck.types.join(', ')}，已阻止上传`,
      degraded: true,
    };
  }

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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages: sanitizedMessages,
        max_tokens: request.maxTokens || 500,
      }),
    });

    if (!response.ok) {
      recordFailure(breaker);
      return { success: false, error: `API 返回错误 ${response.status}`, degraded: true };
    }

    const data = await response.json();
    const actualTokens = (data.usage?.total_tokens || estimatedTokens);
    consumeTokens(tokenBudget, actualTokens);
    recordSuccess(breaker);

    return {
      success: true,
      response: {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model || request.model || 'gpt-4o',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
        },
      },
      degraded: false,
    };
  } catch {
    recordFailure(breaker);
    return { success: false, error: '网络异常，已切换到本地处理', degraded: true };
  }
}

function sanitizeContent(content: string): string {
  const sanitized = sanitizeForCloud({ content });
  return (sanitized.content as string) || content;
}
