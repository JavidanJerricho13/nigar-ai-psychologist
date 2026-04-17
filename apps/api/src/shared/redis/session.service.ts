import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/** Safe JSON wrapper that never throws on parse failures */
function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Transport-agnostic session service backed by Redis.
 * Handles FSM state caching, user sessions, and rate-limit counters.
 *
 * Key schema (from ARCHITECTURE.md):
 *   onboarding:{userId}              → Hash (FSM state)       TTL 24h
 *   session:{telegramId}             → String (userId)        TTL 7d
 *   ratelimit:{userId}:{action}      → Sorted set             TTL 60s
 *   voice_remaining:{userId}         → String (int)           no TTL
 *   conversation:{conversationId}:ctx → List (messages)       TTL 1h
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  private static readonly TTL = {
    ONBOARDING: 24 * 60 * 60,       // 24 hours
    SESSION: 7 * 24 * 60 * 60,      // 7 days
    RATE_LIMIT: 60,                   // 60 seconds
    CONVERSATION_CTX: 60 * 60,       // 1 hour
  };

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ===================== GENERIC OPERATIONS =====================

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return safeJsonParse<T>(raw);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  // ===================== SESSION MAPPING =====================

  /** Map telegramId → userId for fast auth lookup */
  async setUserSession(telegramId: string, userId: string): Promise<void> {
    await this.redis.set(
      `session:${telegramId}`,
      userId,
      'EX',
      SessionService.TTL.SESSION,
    );
  }

  /** Get userId from telegramId session */
  async getUserSession(telegramId: string): Promise<string | null> {
    return this.redis.get(`session:${telegramId}`);
  }

  /** Refresh session TTL on activity */
  async touchSession(telegramId: string): Promise<void> {
    await this.redis.expire(
      `session:${telegramId}`,
      SessionService.TTL.SESSION,
    );
  }

  // ===================== VOICE CREDITS =====================

  /** Get remaining free voice messages */
  async getVoiceRemaining(userId: string): Promise<number> {
    const raw = await this.redis.get(`voice_remaining:${userId}`);
    return raw !== null ? parseInt(raw, 10) : 3; // default 3 free
  }

  /** Decrement voice credits, returns new value (-1 if already 0) */
  async decrementVoice(userId: string): Promise<number> {
    const key = `voice_remaining:${userId}`;
    const exists = await this.redis.exists(key);
    if (!exists) {
      // Initialize with 3 free, then decrement to 2
      await this.redis.set(key, '2');
      return 2;
    }
    const newVal = await this.redis.decr(key);
    return newVal;
  }

  // ===================== RATE LIMITING =====================

  /**
   * Sliding window rate limiter.
   * Returns { allowed: boolean, remaining: number, retryAfterMs: number }
   */
  async checkRateLimit(
    userId: string,
    action: string,
    maxRequests: number,
    windowSeconds: number = SessionService.TTL.RATE_LIMIT,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const key = `ratelimit:${userId}:${action}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const pipeline = this.redis.pipeline();
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Count current entries
    pipeline.zcard(key);
    // Add current request
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    // Set TTL
    pipeline.expire(key, windowSeconds);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= maxRequests) {
      // Get oldest entry to calculate retry-after
      const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTime = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfterMs = oldestTime + windowSeconds * 1000 - now;

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(retryAfterMs, 0),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      retryAfterMs: 0,
    };
  }

  // ===================== ACTIVE CONVERSATION =====================

  /** Get the active conversation ID for a user (session continuity) */
  async getActiveConversation(userId: string): Promise<string | null> {
    return this.redis.get(`active_conversation:${userId}`);
  }

  /** Set the active conversation ID for a user */
  async setActiveConversation(userId: string, conversationId: string): Promise<void> {
    await this.redis.set(
      `active_conversation:${userId}`,
      conversationId,
      'EX',
      SessionService.TTL.CONVERSATION_CTX,
    );
  }

  /** Clear the active conversation (on /clear_chat or session end) */
  async clearActiveConversation(userId: string): Promise<void> {
    await this.redis.del(`active_conversation:${userId}`);
  }

  /** Refresh the active conversation TTL (keep session alive on activity) */
  async touchActiveConversation(userId: string): Promise<void> {
    const key = `active_conversation:${userId}`;
    await this.redis.expire(key, SessionService.TTL.CONVERSATION_CTX);
  }

  // ===================== CONVERSATION CONTEXT =====================

  /** Push a message to conversation context (for LLM sliding window) */
  async pushConversationMessage(
    conversationId: string,
    message: { role: string; content: string },
  ): Promise<void> {
    const key = `conversation:${conversationId}:ctx`;
    await this.redis.rpush(key, JSON.stringify(message));
    await this.redis.expire(key, SessionService.TTL.CONVERSATION_CTX);
  }

  /** Get recent conversation context */
  async getConversationContext(
    conversationId: string,
    limit: number = 20,
  ): Promise<Array<{ role: string; content: string }>> {
    const key = `conversation:${conversationId}:ctx`;
    const raw = await this.redis.lrange(key, -limit, -1);
    return raw.map((r) => safeJsonParse<{ role: string; content: string }>(r)!).filter(Boolean);
  }

  /** Clear conversation context */
  async clearConversationContext(conversationId: string): Promise<void> {
    await this.redis.del(`conversation:${conversationId}:ctx`);
  }
}
