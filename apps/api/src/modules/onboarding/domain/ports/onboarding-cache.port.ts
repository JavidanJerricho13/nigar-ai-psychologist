import { OnboardingState } from '../entities/onboarding-state.entity';

export const ONBOARDING_CACHE = 'ONBOARDING_CACHE';

export interface OnboardingCachePort {
  /** Get cached onboarding state */
  get(userId: string): Promise<OnboardingState | null>;

  /** Set onboarding state in cache with TTL */
  set(state: OnboardingState): Promise<void>;

  /** Remove cached state (after completion or expiry) */
  delete(userId: string): Promise<void>;
}
