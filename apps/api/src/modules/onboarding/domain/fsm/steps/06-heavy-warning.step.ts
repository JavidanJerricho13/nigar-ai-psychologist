import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class HeavyWarningStep implements StepDefinition {
  readonly id = 'heavy_warning';
  readonly order = 6;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `🫧 Mən əsl psixoloq kimi səslənməyə çalışıram, lakin yenə də ` +
        `bazal psixoloji dəstək göstərən neyroşəbəkəyəm.\n\n` +
        `Əgər sənin həqiqətən çətin bir situasiyan varsa, ` +
        `zəhmət olmasa mütəxəssis-insanlara müraciət et.\n\n` +
        `🆘 Böhran xətti: 860-510-510`,
      imageUrl: 'onboarding/w6.png',
      options: [
        { id: 'privacy', label: 'Yaxşı. Bəs məlumatlarım təhlükəsizdir?', value: 'next' },
        { id: 'skip', label: 'Keç', value: 'skip' },
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
    return 'privacy_policy';
  }
}
