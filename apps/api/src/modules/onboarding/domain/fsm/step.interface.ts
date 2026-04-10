import { OnboardingState } from '../entities/onboarding-state.entity';
import type { StepOutput, UserInput, ValidationResult } from '@nigar/shared-types';

export interface StepDefinition {
  /** Unique step identifier */
  readonly id: string;

  /** Step order (for display/debugging) */
  readonly order: number;

  /** Generate the output to show when this step is entered */
  prompt(state: OnboardingState): StepOutput;

  /** Validate user input for this step */
  validate(input: UserInput, state: OnboardingState): ValidationResult;

  /** Extract data from valid input to merge into state */
  extract(input: UserInput): Record<string, unknown>;

  /** Determine the next step ID (null = onboarding complete) */
  nextStep(state: OnboardingState): string | null;
}

export { StepOutput, UserInput, ValidationResult };
