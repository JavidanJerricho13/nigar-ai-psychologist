import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnboardingFsm, FsmResult } from '../fsm/onboarding-fsm';
import { OnboardingState } from '../entities/onboarding-state.entity';
import {
  ONBOARDING_REPOSITORY,
  OnboardingRepositoryPort,
} from '../ports/onboarding.repository.port';
import {
  ONBOARDING_CACHE,
  OnboardingCachePort,
} from '../ports/onboarding-cache.port';
import { OnboardingAlreadyCompletedException } from '../exceptions/onboarding.exceptions';
import type { UserInput, StepOutput } from '@nigar/shared-types';

export interface AdvanceStepInput {
  userId: string;
  input: UserInput;
}

export interface AdvanceStepOutput {
  output: StepOutput;
  completed: boolean;
  currentStep: string;
}

@Injectable()
export class AdvanceStepUseCase {
  private readonly logger = new Logger(AdvanceStepUseCase.name);

  constructor(
    private readonly fsm: OnboardingFsm,
    @Inject(ONBOARDING_REPOSITORY)
    private readonly repository: OnboardingRepositoryPort,
    @Inject(ONBOARDING_CACHE)
    private readonly cache: OnboardingCachePort,
  ) {}

  async execute(input: AdvanceStepInput): Promise<AdvanceStepOutput> {
    // 1. Load state: Redis cache first, then DB fallback, then new
    let state = await this.loadState(input.userId);

    if (state.isCompleted) {
      throw new OnboardingAlreadyCompletedException(input.userId);
    }

    // 2. Process through FSM
    const result: FsmResult = this.fsm.process(state, input.input);
    state = result.newState;

    // 3. Persist: always to cache, to DB on completion or every 3 steps
    await this.cache.set(state);

    if (result.completed || state.completedSteps.length % 3 === 0) {
      await this.repository.save(state);
      this.logger.log(
        `Onboarding state persisted to DB for user ${input.userId} (step: ${state.currentStep})`,
      );
    }

    if (result.completed) {
      await this.cache.delete(input.userId);
      this.logger.log(`Onboarding completed for user ${input.userId}`);
    }

    return {
      output: result.output,
      completed: result.completed,
      currentStep: state.currentStep,
    };
  }

  /** Get the initial prompt for a user (when entering /start for the first time) */
  async getInitialPrompt(userId: string): Promise<AdvanceStepOutput> {
    let state = await this.loadState(userId);

    if (state.isCompleted) {
      throw new OnboardingAlreadyCompletedException(userId);
    }

    const output = this.fsm.getPrompt(state);

    return {
      output,
      completed: false,
      currentStep: state.currentStep,
    };
  }

  private async loadState(userId: string): Promise<OnboardingState> {
    // Try cache first
    const cached = await this.cache.get(userId);
    if (cached) return cached;

    // Try DB
    const persisted = await this.repository.findByUserId(userId);
    if (persisted) {
      await this.cache.set(persisted);
      return persisted;
    }

    // New user
    return new OnboardingState({ userId });
  }
}
