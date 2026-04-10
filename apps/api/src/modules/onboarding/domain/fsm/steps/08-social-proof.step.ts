import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class SocialProofStep implements StepDefinition {
  readonly id = 'social_proof';
  readonly order = 8;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `2024-cü ilin əvvəlindən artıq 60 000-dən çox istifadəçi Nigar ilə yazışıb! 🎉\n\n` +
        `Demək olar ki, tanışlığımız tamamlandı — gəl bir az da danışaq 🤝`,
      imageUrl: 'onboarding/social-proof.png',
      options: [
        { id: 'continue', label: 'Davam et', value: 'next' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (input.type === 'callback') return { valid: true };
    return {
      valid: false,
      errorOutput: this.prompt(new OnboardingState({ userId: '' })),
    };
  }

  extract(_input: UserInput): Record<string, unknown> {
    return {};
  }

  nextStep(_state: OnboardingState): string {
    return 'voice_demo';
  }
}
