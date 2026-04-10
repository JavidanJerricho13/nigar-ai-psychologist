import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class GreetingStep implements StepDefinition {
  readonly id = 'greeting';
  readonly order = 1;

  prompt(state: OnboardingState): StepOutput {
    const name = (state.stepData.firstName as string) || 'Dostum';
    return {
      text:
        `🌟 Salam, ${name}!\n\n` +
        `Mən Nigar — sənin onlayn psixoloqun və AI-assistentin.\n\n` +
        `Düşüncələrin, hisslərin və çətin situasiyalarla məşğul olmağa kömək edəcəm.\n\n` +
        `/nigar_black rejimində açıq danışa bilərsən — tibb, münasibətlər, manipulyasiyalar və s. Heç bir mühakimə yoxdur.\n\n` +
        `Mənə mətn və ya səs yaz istənilən vaxt 😊`,
      options: [
        { id: 'why_need', label: 'Mənə nə üçün lazımdır?', value: 'next' },
        { id: 'skip_onboarding', label: 'Tanışlığı keç', value: 'skip' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (input.type === 'callback' && ['next', 'skip'].includes(input.value)) {
      return { valid: true };
    }
    if (input.type === 'command' && input.value === 'start') {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Zəhmət olmasa, düymələrdən birini seçin 👇',
        options: [
          { id: 'why_need', label: 'Mənə nə üçün lazımdır?', value: 'next' },
          { id: 'skip_onboarding', label: 'Tanışlığı keç', value: 'skip' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { skippedOnboarding: input.value === 'skip' };
  }

  nextStep(state: OnboardingState): string | null {
    if (state.stepData.skippedOnboarding) {
      return 'ask_gender';
    }
    return 'why_need';
  }
}
