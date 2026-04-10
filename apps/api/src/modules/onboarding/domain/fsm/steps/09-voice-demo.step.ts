import { StepDefinition, StepOutput, UserInput, ValidationResult } from '../step.interface';
import { OnboardingState } from '../../entities/onboarding-state.entity';

export class VoiceDemoStep implements StepDefinition {
  readonly id = 'voice_demo';
  readonly order = 9;

  prompt(_state: OnboardingState): StepOutput {
    return {
      text:
        `🎙 Yeri gəlmişkən, mənim belə səsim var.\n\n` +
        `Necə istəyirsən ki, sənə cavab verim?\n` +
        `- Səslə\n` +
        `- Mətnlə\n` +
        `- Səs + Mətn\n\n` +
        `Seçimi /format əmri ilə dəyişmək olar.\n` +
        `İlk 3 səsli cavab pulsuzdur 🎁`,
      audioUrl: 'onboarding/nigar-voice-demo.ogg',
      options: [
        { id: 'voice', label: '🎙 Səs', value: 'voice' },
        { id: 'text', label: '📝 Mətn', value: 'text' },
        { id: 'voice_and_text', label: '🎙 Səs + Mətn', value: 'voice_and_text' },
        { id: 'hide', label: 'Gizlət', value: 'text' },
      ],
      inputType: 'button',
    };
  }

  validate(input: UserInput, _state: OnboardingState): ValidationResult {
    if (
      input.type === 'callback' &&
      ['voice', 'text', 'voice_and_text'].includes(input.value)
    ) {
      return { valid: true };
    }
    return {
      valid: false,
      errorOutput: {
        text: 'Zəhmət olmasa cavab formatını seçin 👇',
        options: [
          { id: 'voice', label: '🎙 Səs', value: 'voice' },
          { id: 'text', label: '📝 Mətn', value: 'text' },
          { id: 'voice_and_text', label: '🎙 Səs + Mətn', value: 'voice_and_text' },
        ],
        inputType: 'button',
      },
    };
  }

  extract(input: UserInput): Record<string, unknown> {
    return { responseFormat: input.value };
  }

  nextStep(_state: OnboardingState): string {
    return 'ask_gender';
  }
}
