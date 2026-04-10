import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class WhyNeedStep implements StepDefinition {
  readonly id = 'why_need';
  readonly order = 2;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `Mən buradayam ki, sənə gündəlik qayğılarında kömək edim, ` +
        `emosiyalarınla baş-başa qalma, daha şüurlu və harmonik yaşa.\n\n` +
        `Mənim üçün əhəmiyyətsiz mövzu və axmaq sual yoxdur. ` +
        `Hər zaman mənə yaza, məsləhət ala və heç bir mühakimə olmadan dəstək ala bilərsən.`,
      imageUrl: 'onboarding/why-need.png',
      options: [
        { id: 'what_discuss', label: 'Nə müzakirə edə bilərik?', value: 'next' },
        { id: 'skip', label: 'Keç', value: 'skip' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput): ValidationResult {
    if (input.type === 'callback') return { valid: true };
    return {
      valid: false,
      errorOutput: this.prompt(new OnboardingState({ userId: '' })),
    };
  }

  extract(): Record<string, unknown> {
    return {};
  }

  nextStep(): string {
    return 'what_discuss';
  }
}
