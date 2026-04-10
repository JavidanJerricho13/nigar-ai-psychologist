import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class AskBioStep implements StepDefinition {
  readonly id = 'ask_bio';
  readonly order = 13;

  prompt(state: OnboardingState): StepOutput {
    const name = (state.stepData.name as string) || 'Dostum';
    return {
      text:
        `${name}, özün haqqında bir az danış 📝\n\n` +
        `Nə narahat edir? Nə barədə danışmaq istəyirsən?\n` +
        `(Maksimum 3000 simvol)`,
      options: [
        { id: 'skip_bio', label: 'Sonra dolduracam', value: 'skip' },
      ],
      inputType: 'text_or_button',
      validation: { maxLength: 3000 },
    };
  }

  validate(input: UserInput): ValidationResult {
    // "Skip" button
    if (input.type === 'callback' && input.value === 'skip') {
      return { valid: true };
    }

    // Text input
    if (input.type === 'text') {
      if (input.value.trim().length === 0) {
        return {
          valid: false,
          errorOutput: {
            text: 'Boş mesaj göndərə bilməzsən. Bir şey yaz və ya "Sonra dolduracam" düyməsini bas.',
            options: [
              { id: 'skip_bio', label: 'Sonra dolduracam', value: 'skip' },
            ],
            inputType: 'text_or_button',
            validation: { maxLength: 3000 },
          },
        };
      }
      if (input.value.trim().length > 3000) {
        return {
          valid: false,
          errorOutput: {
            text: `Mətn çox uzundur (${input.value.trim().length}/3000). Zəhmət olmasa qısalt.`,
            options: [
              { id: 'skip_bio', label: 'Sonra dolduracam', value: 'skip' },
            ],
            inputType: 'text_or_button',
            validation: { maxLength: 3000 },
          },
        };
      }
      return { valid: true };
    }

    return {
      valid: false,
      errorOutput: this.prompt(new OnboardingState({ userId: '' })),
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    if (input.type === 'callback' && input.value === 'skip') {
      return { bio: '' };
    }
    return { bio: input.value.trim() };
  }

  nextStep(): string | null {
    return null; // Last step — triggers completion
  }
}
