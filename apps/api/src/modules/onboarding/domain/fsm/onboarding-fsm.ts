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

    // Handle privacy acceptance
    if (currentStep.id === 'privacy_policy' && extracted.privacyAccepted) {
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
    const d = state.stepData;
    const name = (d.name as string) || 'Dostum';
    const gender = (d.gender as string) || '—';
    const age = (d.age as string) || '—';
    const bio = (d.bio as string) || 'Hələ doldurulmayıb';
    const format = (d.responseFormat as string) || 'text';

    const genderLabel =
      gender === 'male' ? 'Kişi' : gender === 'female' ? 'Qadın' : '—';
    const formatLabel =
      format === 'voice'
        ? 'Səs'
        : format === 'voice_and_text'
          ? 'Səs + Mətn'
          : 'Mətn';

    return {
      text:
        `✅ Tanışlıq tamamlandı!\n\n` +
        `👤 Ad: ${name}\n` +
        `⚧ Cins: ${genderLabel}\n` +
        `🎂 Yaş: ${age}\n` +
        `📝 Haqqında: ${bio.length > 100 ? bio.slice(0, 100) + '...' : bio}\n` +
        `🎙 Format: ${formatLabel}\n\n` +
        `İstədiyin zaman /info ilə profilini dəyişə bilərsən.\n` +
        `İndi mənə yaz — söhbətimizə başlayaq! 💬`,
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
