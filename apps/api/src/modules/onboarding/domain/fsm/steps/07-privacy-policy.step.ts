import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class PrivacyPolicyStep implements StepDefinition {
  readonly id = 'privacy_policy';
  readonly order = 7;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `🔒 Sənin məlumatların qorunur və üçüncü şəxslərə ötürülmür.\n\n` +
        `📋 Mən yalnız son 100 mesajı saxlayıram ki, söhbətimizin kontekstini ` +
        `daha yaxşı xatırlayım və hesabatlar generasiya edim.\n\n` +
        `Davam etməklə, Məxfilik Siyasəti ilə razılaşırsan.`,
      options: [
        { id: 'accept', label: 'Razıyam', value: 'accept' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput): ValidationResult {
    if (input.type === 'callback' && input.value === 'accept') {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Davam etmək üçün Məxfilik Siyasəti ilə razılaşmalısan 👇',
        options: [
          { id: 'accept', label: 'Razıyam', value: 'accept' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(): Record<string, unknown> {
    return { privacyAccepted: true };
  }

  nextStep(): string {
    return 'social_proof';
  }
}
