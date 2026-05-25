import { simpleEmbed } from '../../vector/vector-store';
import { captureError } from '../../logger/logger';
import {
  checkRateLimit,
  checkTokenBudget,
  consumeTokens,
  TokenBudget,
} from '../../safety/guard';
import { createCircuitBreaker, canCall, recordSuccess, recordFailure } from '../../safety/circuit-breaker';
import { sanitizeForCloud } from '../../cloud/sanitizer';

const DEFAULT_DIM = 384;
const CLOUD_EMBED_MODEL = 'text-embedding-3-small';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

let cachedApiKey: string | undefined;
const embedBudget: TokenBudget = { monthlyLimit: 200000, used: 0, resetDay: new Date().getDate(), warningThreshold: 0.8 };
const embedBreaker = createCircuitBreaker(5, 30000);

export function setEmbeddingApiKey(key: string): void {
  cachedApiKey = key;
}

export function getEmbeddingApiKey(): string | undefined {
  return cachedApiKey;
}

export function resetEmbeddingForTest(): void {
  embedBudget.used = 0;
  embedBudget.resetDay = new Date().getDate();
  embedBreaker.state = 'closed';
  embedBreaker.failureCount = 0;
}

export async function generateEmbedding(
  text: string,
  dim: number = DEFAULT_DIM
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    return new Array(dim).fill(0);
  }

  const rateCheck = checkRateLimit('embedding_gen', {
    maxCallsPerMinute: 20,
    maxCallsPerHour: 500,
    windowMs: 60000,
  });
  if (!rateCheck.allowed) {
    return simpleEmbed(text, dim);
  }

  const estimatedTokens = Math.ceil(text.length / 3);
  const budgetCheck = checkTokenBudget(embedBudget, estimatedTokens);
  if (!budgetCheck.allowed) {
    return simpleEmbed(text, dim);
  }

  if (!canCall(embedBreaker)) {
    return simpleEmbed(text, dim);
  }

  if (!cachedApiKey) {
    return simpleEmbed(text, dim);
  }

  try {
    const sanitizedData = sanitizeForCloud({ content: text });
    const safeText = (sanitizedData.content as string) || text;

    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cachedApiKey}`,
      },
      body: JSON.stringify({
        model: CLOUD_EMBED_MODEL,
        input: safeText,
        dimensions: dim <= 1536 ? dim : 1536,
      }),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        recordFailure(embedBreaker);
      }
      return simpleEmbed(text, dim);
    }

    const json = await response.json();
    const embedding: number[] = json?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      return simpleEmbed(text, dim);
    }

    recordSuccess(embedBreaker);
    consumeTokens(embedBudget, json?.usage?.total_tokens || estimatedTokens);

    if (embedding.length === dim) {
      return embedding;
    }

    return embedding.slice(0, dim);
  } catch (e) {
    captureError('EmbeddingService.generateEmbedding', e, 'Cloud embedding failed, using local fallback');
    recordFailure(embedBreaker);
    return simpleEmbed(text, dim);
  }
}

export async function generateBatchEmbeddings(
  texts: string[],
  dim: number = DEFAULT_DIM
): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const emb = await generateEmbedding(text, dim);
    results.push(emb);
  }
  return results;
}

export function normEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return embedding;
  return embedding.map((v) => v / norm);
}
