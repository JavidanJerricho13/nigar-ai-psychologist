import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

/**
 * Empathy-first onboarding: Step 1
 * "How are you feeling today?" — immediate emotional engagement.
 * This replaces the old 8-step information dump with a single touchpoint.
 */
export class MoodCheckStep implements StepDefinition {
  readonly id = 'mood_check';
  readonly order = 1;

  prompt(state: OnboardingState): StepOutput {
    const firstName = (state.stepData.firstName as string) || '';
    const greeting = firstName ? `Salam, ${firstName}!` : 'Salam!';

    return {
      text:
        `${greeting} 💛\n\n` +
        `Mən Nigar — sənin AI psixoloqun.\n\n` +
        `Bu gün necəsən?`,
      options: [
        { id: 'great', label: '😊 Yaxşıyam', value: 'great' },
        { id: 'okay', label: '😐 Belə-belə', value: 'okay' },
        { id: 'bad', label: '😔 Pis', value: 'bad' },
        { id: 'help', label: '🆘 Kömək lazımdır', value: 'help' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    const validMoods = ['great', 'okay', 'bad', 'help'];
    if (input.type === 'callback' && validMoods.includes(input.value)) {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Necə hiss etdiyini seç 👇',
        options: [
          { id: 'great', label: '😊 Yaxşıyam', value: 'great' },
          { id: 'okay', label: '😐 Belə-belə', value: 'okay' },
          { id: 'bad', label: '😔 Pis', value: 'bad' },
          { id: 'help', label: '🆘 Kömək lazımdır', value: 'help' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { initialMood: input.value };
  }

  nextStep(_state: OnboardingState): string {
    return 'privacy_quick';
  }
}
