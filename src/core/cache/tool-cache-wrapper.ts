import { createCircuitBreaker, canCall, recordSuccess, recordFailure } from '../safety/circuit-breaker';
import { MemoryCache } from './memory-cache';
import type { CacheStats } from './memory-cache';
import type { ToolEntry } from '../../agents/_shared/tool-registry';
import { captureError } from '../logger/logger';

const toolCache = new MemoryCache(200, 5 * 60 * 1000);
const circuitBreaker = createCircuitBreaker(5, 60 * 1000);

export function getToolCache(): MemoryCache {
  return toolCache;
}

export function getToolCacheStats(): CacheStats {
  return toolCache.getStats();
}

export function clearToolCache(): void {
  toolCache.clear();
}

export function isCircuitOpen(): boolean {
  return !canCall(circuitBreaker);
}

export function getCircuitState(): string {
  return circuitBreaker.state;
}

export async function wrapToolCall<T>(
  tool: ToolEntry,
  args: Record<string, unknown>,
  ttlMs?: number
): Promise<T> {
  if (!tool.definition.idempotent) {
    const result = await tool.handler(args);
    return result as T;
  }

  const cacheKey = buildCacheKey(tool.definition.name, args);

  const cached = toolCache.get<T>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  if (!canCall(circuitBreaker)) {
    const errMsg = `Circuit breaker open for tool: ${tool.definition.name}`;
    captureError('ToolCache.circuitOpen', new Error(errMsg), errMsg);
    throw new Error(errMsg);
  }

  try {
    const result = await tool.handler(args);
    if (result && result.success !== false) {
      toolCache.set(cacheKey, result as T, ttlMs);
    }
    recordSuccess(circuitBreaker);
    return result as T;
  } catch (e) {
    recordFailure(circuitBreaker);
    throw e;
  }
}

export function invalidateToolCache(toolName: string): number {
  const prefix = `tool:${toolName}:`;
  let count = 0;
  for (const key of toolCache.keys()) {
    if (key.startsWith(prefix)) {
      toolCache.delete(key);
      count++;
    }
  }
  return count;
}

function buildCacheKey(toolName: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = args[k];
      return acc;
    }, {});
  return `tool:${toolName}:${JSON.stringify(sorted)}`;
}
