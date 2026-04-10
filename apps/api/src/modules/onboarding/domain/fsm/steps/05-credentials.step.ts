import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class CredentialsStep implements StepDefinition {
  readonly id = 'credentials';
  readonly order = 5;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `✅ Mən ən müasir neyroşəbəkələr üzərində işləyirəm — ` +
        `OpenAI, Google və Anthropic şirkətlərindən.\n\n` +
        `Bu neyroşəbəkələr psixologiya və psixiatriya sahəsində ` +
        `milyonlarla təsdiqlənmiş kitab, məqalə və elmi araşdırma ` +
        `əsasında öyrədilib.\n\n` +
        `Araşdırmalar göstərir ki, bu neyroşəbəkələr psixoterapevtlərə ` +
        `praktikalarında yaxşı kömək edir, həmçinin onların pasiyentlərinə ❤️`,
      imageUrl: 'onboarding/credentials.png',
      options: [
        { id: 'heavy_warning', label: 'Bəs ağır situasiya olarsa?', value: 'next' },
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
    return 'heavy_warning';
  }
}
