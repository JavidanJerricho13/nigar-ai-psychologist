import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class AskNameStep implements StepDefinition {
  readonly id = 'ask_name';
  readonly order = 11;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text: `Adın nədir? ✍️`,
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

  nextStep(_state: OnboardingState): string {
    return 'ask_age';
  }
}
