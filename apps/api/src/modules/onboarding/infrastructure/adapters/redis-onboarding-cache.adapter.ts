import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../shared/redis/redis.constants';
import { OnboardingCachePort } from '../../domain/ports/onboarding-cache.port';
import { OnboardingState } from '../../domain/entities/onboarding-state.entity';

const PREFIX = 'onboarding:';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

@Injectable()
export class RedisOnboardingCacheAdapter implements OnboardingCachePort {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(userId: string): Promise<OnboardingState | null> {
    const raw = await this.redis.get(`${PREFIX}${userId}`);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      return new OnboardingState({
        userId: data.userId,
        currentStep: data.currentStep,
        stepData: data.stepData ?? {},
        completedSteps: data.completedSteps ?? [],
        privacyAccepted: data.privacyAccepted ?? false,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
      });
    } catch {
      await this.delete(userId);
      return null;
    }
  }

  async set(state: OnboardingState): Promise<void> {
    const payload = JSON.stringify({
      userId: state.userId,
      currentStep: state.currentStep,
      stepData: state.stepData,
      completedSteps: state.completedSteps,
      privacyAccepted: state.privacyAccepted,
      startedAt: state.startedAt.toISOString(),
      completedAt: state.completedAt?.toISOString() ?? null,
    });

    await this.redis.set(`${PREFIX}${state.userId}`, payload, 'EX', TTL_SECONDS);
  }

  async delete(userId: string): Promise<void> {
    await this.redis.del(`${PREFIX}${userId}`);
  }
}
