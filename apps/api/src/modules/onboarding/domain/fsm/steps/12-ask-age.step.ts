import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class AskAgeStep implements StepDefinition {
  readonly id = 'ask_age';
  readonly order = 12;

  prompt(state: OnboardingState): StepOutput {
    const name = (state.stepData.name as string) || 'Dostum';
    return {
      text: `${name}, neçə yaşın var? 🎂`,
      inputType: 'text',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (input.type !== 'text') {
      return {
        valid: false,
        errorOutput: {
          text: 'Zəhmət olmasa yaşını rəqəm olaraq yaz (məsələn: 25)',
          inputType: 'text',
        },
      };
    }

    const age = parseInt(input.value.trim(), 10);
    if (isNaN(age) || age < 10 || age > 120) {
      return {
        valid: false,
        errorOutput: {
          text: 'Zəhmət olmasa düzgün yaş daxil et (10-120 arası)',
          inputType: 'text',
        },
      };
    }

    return { valid: true };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { age: parseInt(input.value.trim(), 10) };
  }

  nextStep(_state: OnboardingState): string {
    return 'ask_bio';
  }
}
