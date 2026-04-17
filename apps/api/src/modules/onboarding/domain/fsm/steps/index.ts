import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';
import { MoodCheckStep } from './01-mood-check.step';
import { PrivacyQuickStep } from './02-privacy-quick.step';

// Legacy steps (kept for reference, no longer in main flow)
export { GreetingStep } from './01-greeting.step';
export { WhyNeedStep } from './02-why-need.step';
export { WhatDiscussStep } from './03-what-discuss.step';
export { MethodsStep } from './04-methods.step';
export { CredentialsStep } from './05-credentials.step';
export { HeavyWarningStep } from './06-heavy-warning.step';
export { PrivacyPolicyStep } from './07-privacy-policy.step';
export { SocialProofStep } from './08-social-proof.step';
export { VoiceDemoStep } from './09-voice-demo.step';
export { AskGenderStep } from './10-ask-gender.step';
export { AskNameStep } from './11-ask-name.step';
export { AskAgeStep } from './12-ask-age.step';
export { AskBioStep } from './13-ask-bio.step';

// New empathy-first steps
export { MoodCheckStep, PrivacyQuickStep };

/**
 * Empathy-first onboarding: 3 steps to first AI response.
 *
 * Flow: mood_check → privacy_quick → ask_name → COMPLETE
 *
 * Old 13-step flow removed. Gender, age, bio, voice format collected
 * via progressive profiling after the first session (Phase 3b).
 */
class AskNameFinalStep implements StepDefinition {
  readonly id = 'ask_name';
  readonly order = 3;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text: 'Adın nədir? ✍️\n\n(Ləqəb də olar)',
      inputType: 'text',
      validation: { maxLength: 100 },
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (input.type === 'text' && input.value.trim().length > 0) {
      if (input.value.trim().length > 100) {
        return {
          valid: false,
          errorOutput: {
            text: 'Ad çox uzundur. Zəhmət olmasa 100 simvoldan az yaz.',
            inputType: 'text',
            validation: { maxLength: 100 },
          },
        };
      }
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Zəhmət olmasa adını yaz ✍️',
        inputType: 'text',
        validation: { maxLength: 100 },
      },
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { name: input.value.trim() };
  }

  nextStep(_state: OnboardingState): string | null {
    return null; // Terminal step — triggers completion
  }
}

export function createAllSteps(): StepDefinition[] {
  return [
    new MoodCheckStep(),
    new PrivacyQuickStep(),
    new AskNameFinalStep(),
  ];
}
