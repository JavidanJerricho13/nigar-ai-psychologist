import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class WhatDiscussStep implements StepDefinition {
  readonly id = 'what_discuss';
  readonly order = 3;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `Biz tamamilə fərqli mövzuları müzakirə edə bilərik, məsələn:\n\n` +
        `✅ Stresslə necə mübarizə aparmaq 🧘\n` +
        `✅ Özünü qəbul etməyə başlamaq 🙏\n` +
        `✅ Şəxsi sərhədlər qurmaq 😎\n` +
        `✅ Yaxınlarla münasibətləri yaxşılaşdırmaq ❤️\n` +
        `✅ Arıqlamaq və ya kökəlmək 💪\n` +
        `✅ Karyerada inkişaf etmək 👩‍💼\n` +
        `✅ Daha yaxşı oxumaq 📚\n` +
        `... və bir çox digər mövzular.\n\n` +
        `Həmçinin hobbilər, kitablar, oyunlar, incəsənət haqqında da danışa bilərik 🎨📚🎮\n\n` +
        `🎨 /art rejimində art-terapiya ilə yaradıcılığını təhlil edə bilərik.`,
      imageUrl: 'onboarding/what-discuss.png',
      options: [
        { id: 'methods', label: 'Hansı metodikalardan istifadə edirsən?', value: 'next' },
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
    return 'methods';
  }
}
