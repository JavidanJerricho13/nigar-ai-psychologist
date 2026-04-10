import { Module } from '@nestjs/common';
import { OnboardingFsm } from './domain/fsm/onboarding-fsm';
import { createAllSteps } from './domain/fsm/steps';
import { AdvanceStepUseCase } from './domain/use-cases/advance-step.use-case';
import { GetOnboardingStatusUseCase } from './domain/use-cases/get-onboarding-status.use-case';
import { ONBOARDING_REPOSITORY } from './domain/ports/onboarding.repository.port';
import { ONBOARDING_CACHE } from './domain/ports/onboarding-cache.port';
import { PrismaOnboardingRepository } from './infrastructure/adapters/prisma-onboarding.repository';
import { RedisOnboardingCacheAdapter } from './infrastructure/adapters/redis-onboarding-cache.adapter';

@Module({
  providers: [
    // FSM engine (pure, no dependencies)
    {
      provide: OnboardingFsm,
      useFactory: () => new OnboardingFsm(createAllSteps()),
    },

    // Ports → Adapters
    {
      provide: ONBOARDING_REPOSITORY,
      useClass: PrismaOnboardingRepository,
    },
    {
      provide: ONBOARDING_CACHE,
      useClass: RedisOnboardingCacheAdapter,
    },

    // Use cases
    AdvanceStepUseCase,
    GetOnboardingStatusUseCase,
  ],
  exports: [AdvanceStepUseCase, GetOnboardingStatusUseCase],
})
export class OnboardingModule {}
