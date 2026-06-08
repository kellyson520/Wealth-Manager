import { MemoryCache } from '../../../core/cache/memory-cache';
import {
  wrapToolCall,
  getToolCache,
  clearToolCache,
  invalidateToolCache,
  isCircuitOpen,
  getToolCacheStats,
} from '../../../core/cache/tool-cache-wrapper';
import type { CacheStats } from '../../../core/cache/memory-cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(10, 1000);
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get<string>('key1')).toBe('value1');
  });

  it('should return undefined for expired entries', async () => {
    cache.set('key1', 'value1', 50);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should check existence with has()', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.delete('missing')).toBe(false);
  });

  it('should evict oldest entry when at capacity', () => {
    const smallCache = new MemoryCache(3, 10000);
    smallCache.set('a', 1);
    smallCache.set('b', 2);
    smallCache.set('c', 3);
    smallCache.set('d', 4);

    expect(smallCache.get('a')).toBeUndefined();
    expect(smallCache.get('d')).toBe(4);
  });

  it('should reject non-positive max sizes', () => {
    expect(() => new MemoryCache(0)).toThrow('MemoryCache maxSize must be a positive integer');
    expect(() => new MemoryCache(-1)).toThrow('MemoryCache maxSize must be a positive integer');
  });

  it('should track hit/miss statistics', () => {
    cache.set('k1', 'v1');
    cache.get('k1');
    cache.get('k1');
    cache.get('missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('should track hit count per key', () => {
    cache.set('k1', 'v1');
    cache.get('k1');
    cache.get('k1');
    expect(cache.getHitCount('k1')).toBe(2);
    expect(cache.getHitCount('missing')).toBe(0);
  });

  it('should list valid keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys()).toHaveLength(2);
    expect(cache.keys()).toContain('a');
    expect(cache.keys()).toContain('b');
  });

  it('should clear all entries and reset stats', () => {
    cache.set('a', 1);
    cache.get('a');
    cache.clear();

    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should overwrite existing keys', () => {
    cache.set('k1', 'old');
    cache.set('k1', 'new');
    expect(cache.get<string>('k1')).toBe('new');
  });
});

describe('ToolCacheWrapper', () => {
  beforeEach(() => {
    clearToolCache();
  });

  it('should return stats', () => {
    const stats = getToolCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('size');
  });

  it('should not be in circuit open state initially', () => {
    expect(isCircuitOpen()).toBe(false);
  });

  it('should invalidate cache by tool name', () => {
    const cache = getToolCache();
    cache.set('tool:test:{"a":1}', 'val1');
    cache.set('tool:test:{"b":2}', 'val2');
    cache.set('tool:other:{"c":3}', 'val3');

    const count = invalidateToolCache('test');
    expect(count).toBe(2);
  });

  it('should store in tool cache', () => {
    const cache = getToolCache();
    cache.set('test-key', 'test-value');
    expect(cache.get('test-key')).toBe('test-value');
  });
});
