import { OnboardingState } from '../entities/onboarding-state.entity';
import { StepDefinition, StepOutput, UserInput } from './step.interface';
import {
  StepNotFoundException,
  OnboardingAlreadyCompletedException,
} from '../exceptions/onboarding.exceptions';

export interface FsmResult {
  newState: OnboardingState;
  output: StepOutput;
  completed: boolean;
}

/**
 * Pure, transport-agnostic FSM engine.
 * Takes (state, input) → (newState, output).
 * No I/O, no side effects — all persistence is handled by the use case layer.
 */
export class OnboardingFsm {
  private readonly steps: Map<string, StepDefinition>;

  constructor(steps: StepDefinition[]) {
    this.steps = new Map(steps.map((s) => [s.id, s]));
  }

  /** Get the prompt for the current step (used when entering a step for the first time) */
  getPrompt(state: OnboardingState): StepOutput {
    if (state.isCompleted) {
      throw new OnboardingAlreadyCompletedException(state.userId);
    }

    const step = this.getStep(state.currentStep);
    return step.prompt(state);
  }

  /** Process user input and advance the FSM */
  process(state: OnboardingState, input: UserInput): FsmResult {
    if (state.isCompleted) {
      throw new OnboardingAlreadyCompletedException(state.userId);
    }

    const currentStep = this.getStep(state.currentStep);

    // Validate
    const validation = currentStep.validate(input, state);
    if (!validation.valid) {
      return {
        newState: state,
        output: validation.errorOutput!,
        completed: false,
      };
    }

    // Extract data from input
    const extracted = currentStep.extract(input);

    // Merge extracted data into state BEFORE determining next step
    // (nextStep may read stepData for conditional branching)
    state.stepData = { ...state.stepData, ...extracted };

    // Handle privacy acceptance (both old and new flow step IDs)
    if (
      (currentStep.id === 'privacy_policy' || currentStep.id === 'privacy_quick') &&
      extracted.privacyAccepted
    ) {
      state.acceptPrivacy();
    }

    // Determine next step
    const nextStepId = currentStep.nextStep(state);

    if (nextStepId === null) {
      // Onboarding complete
      state.advance('completed', {});
      state.complete();
      return {
        newState: state,
        output: this.buildCompletionOutput(state),
        completed: true,
      };
    }

    // Advance to next step (data already merged above)
    state.advance(nextStepId, {});

    const nextStep = this.getStep(nextStepId);
    return {
      newState: state,
      output: nextStep.prompt(state),
      completed: false,
    };
  }

  /** Get a step by ID or throw */
  private getStep(stepId: string): StepDefinition {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new StepNotFoundException(stepId);
    }
    return step;
  }

  /** Build the final summary output when onboarding completes */
  private buildCompletionOutput(state: OnboardingState): StepOutput {
    const name = (state.stepData.name as string) || 'Dostum';
    return {
      text:
        `✅ Tanışlıq tamamlandı, ${name}!\n\n` +
        `İndi mənə yaz — dinləyirəm 💛`,
      inputType: 'text',
    };
  }

  /** Get all registered step IDs in order */
  getStepIds(): string[] {
    return Array.from(this.steps.values())
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id);
  }
}
