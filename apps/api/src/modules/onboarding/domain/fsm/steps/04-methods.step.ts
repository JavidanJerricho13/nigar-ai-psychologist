import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class MethodsStep implements StepDefinition {
  readonly id = 'methods';
  readonly order = 4;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `Söhbətimizə orqanik şəkildə ekspertlər tərəfindən təsdiqlənmiş ` +
        `psixoterapiya metodikalarını "daxil edəcəm":\n\n` +
        `🧠 KBT (Koqnitiv Davranış Terapiyası)\n` +
        `💚 Emosiyaya fokuslanmış terapiya\n` +
        `🧘 Mayndfullnes\n` +
        `💪 Fiziki praktikalar\n` +
        `🎨 Yaradıcılıq\n\n` +
        `Dialoqda birlikdə izləyəcəyik ki, nə sənə rahatlıq gətirir ` +
        `və effektiv işləyir.`,
      imageUrl: 'onboarding/methods.png',
      options: [
        { id: 'credentials', label: 'Maraqlıdır, bütün bunları haradan bilirsən?', value: 'next' },
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
    return 'credentials';
  }
}
