import { Injectable, Inject } from '@nestjs/common';
import {
  ONBOARDING_REPOSITORY,
  OnboardingRepositoryPort,
} from '../ports/onboarding.repository.port';
import {
  ONBOARDING_CACHE,
  OnboardingCachePort,
} from '../ports/onboarding-cache.port';

export interface OnboardingStatus {
  userId: string;
  completed: boolean;
  currentStep: string | null;
  stepsCompleted: number;
}

@Injectable()
export class GetOnboardingStatusUseCase {
  constructor(
    @Inject(ONBOARDING_REPOSITORY)
    private readonly repository: OnboardingRepositoryPort,
    @Inject(ONBOARDING_CACHE)
    private readonly cache: OnboardingCachePort,
  ) {}

  async execute(userId: string): Promise<OnboardingStatus> {
    // Try cache first
    const cached = await this.cache.get(userId);
    if (cached) {
      return {
        userId,
        completed: cached.isCompleted,
        currentStep: cached.currentStep,
        stepsCompleted: cached.completedSteps.length,
      };
    }

    // Fallback to DB
    const persisted = await this.repository.findByUserId(userId);
    if (persisted) {
      return {
        userId,
        completed: persisted.isCompleted,
        currentStep: persisted.currentStep,
        stepsCompleted: persisted.completedSteps.length,
      };
    }

    // Not started
    return {
      userId,
      completed: false,
      currentStep: null,
      stepsCompleted: 0,
    };
  }
}
