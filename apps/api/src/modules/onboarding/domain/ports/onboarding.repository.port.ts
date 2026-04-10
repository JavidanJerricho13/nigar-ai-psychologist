import { OnboardingState } from '../entities/onboarding-state.entity';

export const ONBOARDING_REPOSITORY = 'ONBOARDING_REPOSITORY';

export interface OnboardingRepositoryPort {
  /** Find onboarding state by user ID */
  findByUserId(userId: string): Promise<OnboardingState | null>;

  /** Save or update onboarding state */
  save(state: OnboardingState): Promise<void>;

  /** Check if user has completed onboarding */
  isCompleted(userId: string): Promise<boolean>;
}
