import Redis from 'ioredis';

const PREFIX = 'admin:metrics:';

/**
 * Redis cache wrapper for analytics queries.
 * Protects the production DB from dashboard refresh storms.
 */
export class AnalyticsCacheService {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    this.redis.on('error', (err) => console.error('[AnalyticsCache] Redis error:', err.message));
  }

  /**
   * Get cached value or compute and cache.
   * Pattern: check cache → return if fresh → else compute + store.
   */
  async getCached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cacheKey = `${PREFIX}${key}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as T;
    } catch {}

    const result = await compute();
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
    } catch {}

    return result;
  }

  /** Force refresh a specific metric */
  async invalidate(key: string): Promise<void> {
    await this.redis.del(`${PREFIX}${key}`);
  }

  /** Clear all cached metrics */
  async invalidateAll(): Promise<void> {
    const keys = await this.redis.keys(`${PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
