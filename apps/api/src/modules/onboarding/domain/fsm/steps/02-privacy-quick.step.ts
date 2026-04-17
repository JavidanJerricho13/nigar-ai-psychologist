import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

/**
 * Empathy-first onboarding: Step 2
 * Quick privacy micro-consent that emphasizes safety, not legalese.
 */
export class PrivacyQuickStep implements StepDefinition {
  readonly id = 'privacy_quick';
  readonly order = 2;

  prompt(state: OnboardingState): StepOutput {
    const mood = state.stepData.initialMood as string;
    let empathyLine: string;

    switch (mood) {
      case 'bad':
      case 'help':
        empathyLine = 'Eşitdim. Sən doğru yerə gəlmisən 💛';
        break;
      case 'okay':
        empathyLine = 'Gəl birlikdə baxaq nə baş verir 💛';
        break;
      default:
        empathyLine = 'Gözəl! Gəl tanış olaq 💛';
    }

    return {
      text:
        `${empathyLine}\n\n` +
        `🔐 Sənin söhbətlərin:\n` +
        `• Şifrələnir — heç kim oxuya bilmir\n` +
        `• Üçüncü şəxslərə ötürülmür\n` +
        `• İstədiyin zaman silə bilərsən\n\n` +
        `Sən burda təhlükəsizliksən.`,
      options: [
        { id: 'accept', label: 'Razıyam — davam et', value: 'accept' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (input.type === 'callback' && input.value === 'accept') {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Davam etmək üçün razılığını ver 👇',
        options: [
          { id: 'accept', label: 'Razıyam — davam et', value: 'accept' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(_input: UserInput): Record<string, unknown> {
    return { privacyAccepted: true };
  }

  nextStep(_state: OnboardingState): string {
    return 'ask_name';
  }
}
