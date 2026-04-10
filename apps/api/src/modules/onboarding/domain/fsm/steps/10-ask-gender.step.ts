import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class AskGenderStep implements StepDefinition {
  readonly id = 'ask_gender';
  readonly order = 10;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text: `İndi bir az tanışaq 😊\n\nCinsiyyətini seçə bilərsən:`,
      options: [
        { id: 'male', label: '👨 Kişi', value: 'male' },
        { id: 'female', label: '👩 Qadın', value: 'female' },
        { id: 'skip', label: 'Keç', value: 'skip' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput): ValidationResult {
    if (
      input.type === 'callback' &&
      ['male', 'female', 'skip'].includes(input.value)
    ) {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Zəhmət olmasa seçimlərdən birini seç 👇',
        options: [
          { id: 'male', label: '👨 Kişi', value: 'male' },
          { id: 'female', label: '👩 Qadın', value: 'female' },
          { id: 'skip', label: 'Keç', value: 'skip' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { gender: input.value };
  }

  nextStep(): string {
    return 'ask_name';
  }
}
