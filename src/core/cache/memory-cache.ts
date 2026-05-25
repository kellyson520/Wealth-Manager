interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
  hitCount: number;
  createdAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  evictions: number;
  hitRate: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  } = { hits: 0, misses: 0, evictions: 0 };
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 500, defaultTTLMs: number = 30 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return undefined;
    }

    entry.hitCount++;
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.evictIfNeeded();

    const existing = this.cache.get(key);
    const hitCount = existing ? existing.hitCount + 1 : 0;

    this.cache.set(key, {
      key,
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTTL),
      hitCount,
      createdAt: Date.now(),
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 10000) / 100 : 0,
    };
  }

  getHitCount(key: string): number {
    return this.cache.get(key)?.hitCount || 0;
  }

  keys(): string[] {
    const now = Date.now();
    const valid: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now <= entry.expiresAt) {
        valid.push(key);
      }
    }
    return valid;
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.maxSize) {
      this.evictOne();
    }
  }

  private evictOne(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
}
