/**
 * Unit tests for voice/format + profile collection steps (09-13).
 */
import { OnboardingState } from '../../entities/onboarding-state.entity';
import {
  VoiceDemoStep,
  AskGenderStep,
  AskNameStep,
  AskAgeStep,
  AskBioStep,
} from '../steps';

describe('Voice & Profile Steps', () => {
  // ==================== 09 - VoiceDemo ====================
  describe('VoiceDemoStep', () => {
    const step = new VoiceDemoStep();

    it('has correct id=voice_demo, order=9', () => {
      expect(step.id).toBe('voice_demo');
      expect(step.order).toBe(9);
    });

    it('prompt includes audioUrl for voice demo', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.audioUrl).toBeDefined();
      expect(output.audioUrl).toContain('.ogg');
    });

    it('prompt has 4 format options (voice, text, both, hide)', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.options!.length).toBe(4);
    });

    it('validate accepts voice', () => {
      expect(step.validate({ type: 'callback', value: 'voice' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts text', () => {
      expect(step.validate({ type: 'callback', value: 'text' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts voice_and_text', () => {
      expect(step.validate({ type: 'callback', value: 'voice_and_text' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects invalid format', () => {
      expect(step.validate({ type: 'callback', value: 'invalid' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects text input', () => {
      expect(step.validate({ type: 'text', value: 'voice' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract maps value to responseFormat', () => {
      expect(step.extract({ type: 'callback', value: 'voice_and_text' })).toEqual({ responseFormat: 'voice_and_text' });
    });

    it('nextStep returns ask_gender', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('ask_gender');
    });
  });

  // ==================== 10 - AskGender ====================
  describe('AskGenderStep', () => {
    const step = new AskGenderStep();

    it('has correct id=ask_gender, order=10', () => {
      expect(step.id).toBe('ask_gender');
      expect(step.order).toBe(10);
    });

    it('prompt has 3 options (male, female, skip)', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.options!.length).toBe(3);
    });

    it('validate accepts male', () => {
      expect(step.validate({ type: 'callback', value: 'male' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts female', () => {
      expect(step.validate({ type: 'callback', value: 'female' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts skip', () => {
      expect(step.validate({ type: 'callback', value: 'skip' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects invalid gender', () => {
      expect(step.validate({ type: 'callback', value: 'other' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects text input', () => {
      expect(step.validate({ type: 'text', value: 'male' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract maps value to gender', () => {
      expect(step.extract({ type: 'callback', value: 'female' })).toEqual({ gender: 'female' });
    });

    it('nextStep returns ask_name', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('ask_name');
    });
  });

  // ==================== 11 - AskName ====================
  describe('AskNameStep', () => {
    const step = new AskNameStep();

    it('has correct id=ask_name, order=11', () => {
      expect(step.id).toBe('ask_name');
      expect(step.order).toBe(11);
    });

    it('prompt expects text input', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.inputType).toBe('text');
      expect(output.validation?.maxLength).toBe(100);
    });

    it('validate accepts normal name', () => {
      expect(step.validate({ type: 'text', value: 'Cavidan' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts name with spaces', () => {
      expect(step.validate({ type: 'text', value: 'Əli Vəliyev' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects empty string', () => {
      expect(step.validate({ type: 'text', value: '' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects whitespace-only', () => {
      expect(step.validate({ type: 'text', value: '   ' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects name over 100 chars', () => {
      expect(step.validate({ type: 'text', value: 'a'.repeat(101) }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects callback input', () => {
      expect(step.validate({ type: 'callback', value: 'test' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract trims the name', () => {
      expect(step.extract({ type: 'text', value: '  Nigar  ' })).toEqual({ name: 'Nigar' });
    });

    it('nextStep returns ask_age', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('ask_age');
    });
  });

  // ==================== 12 - AskAge ====================
  describe('AskAgeStep', () => {
    const step = new AskAgeStep();

    it('has correct id=ask_age, order=12', () => {
      expect(step.id).toBe('ask_age');
      expect(step.order).toBe(12);
    });

    it('prompt uses collected name', () => {
      const state = new OnboardingState({ userId: 'u1', stepData: { name: 'Əli' } });
      const output = step.prompt(state);
      expect(output.text).toContain('Əli');
    });

    it('prompt falls back to Dostum', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text).toContain('Dostum');
    });

    it('validate accepts valid age 10', () => {
      expect(step.validate({ type: 'text', value: '10' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts valid age 120', () => {
      expect(step.validate({ type: 'text', value: '120' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts age with spaces', () => {
      expect(step.validate({ type: 'text', value: ' 25 ' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects age 9 (too young)', () => {
      expect(step.validate({ type: 'text', value: '9' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects age 121 (too old)', () => {
      expect(step.validate({ type: 'text', value: '121' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects negative age', () => {
      expect(step.validate({ type: 'text', value: '-5' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects non-numeric text', () => {
      expect(step.validate({ type: 'text', value: 'twenty' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate accepts float age (parseInt truncates to integer)', () => {
      // parseInt('25.5') = 25, which is valid — this is by design
      expect(step.validate({ type: 'text', value: '25.5' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects callback input', () => {
      expect(step.validate({ type: 'callback', value: '25' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract parses age as integer', () => {
      expect(step.extract({ type: 'text', value: ' 28 ' })).toEqual({ age: 28 });
    });

    it('nextStep returns ask_bio', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('ask_bio');
    });
  });

  // ==================== 13 - AskBio ====================
  describe('AskBioStep', () => {
    const step = new AskBioStep();

    it('has correct id=ask_bio, order=13', () => {
      expect(step.id).toBe('ask_bio');
      expect(step.order).toBe(13);
    });

    it('prompt uses collected name', () => {
      const state = new OnboardingState({ userId: 'u1', stepData: { name: 'Nigar' } });
      const output = step.prompt(state);
      expect(output.text).toContain('Nigar');
    });

    it('prompt has text_or_button inputType', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.inputType).toBe('text_or_button');
      expect(output.validation?.maxLength).toBe(3000);
    });

    it('prompt has skip button', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.options!.length).toBe(1);
      expect(output.options![0].value).toBe('skip');
    });

    it('validate accepts text bio', () => {
      expect(step.validate({ type: 'text', value: 'Mən psixologiya ilə maraqlanıram' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts skip callback', () => {
      expect(step.validate({ type: 'callback', value: 'skip' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate accepts bio at exactly 3000 chars', () => {
      expect(step.validate({ type: 'text', value: 'x'.repeat(3000) }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects bio over 3000 chars', () => {
      const result = step.validate({ type: 'text', value: 'x'.repeat(3001) }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(false);
      expect(result.errorOutput!.text).toContain('uzundur');
    });

    it('validate rejects empty text', () => {
      const result = step.validate({ type: 'text', value: '  ' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(false);
      expect(result.errorOutput!.text).toContain('Boş');
    });

    it('validate rejects random callback', () => {
      const result = step.validate({ type: 'callback', value: 'random' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(false);
    });

    it('extract returns bio text', () => {
      expect(step.extract({ type: 'text', value: '  My bio  ' })).toEqual({ bio: 'My bio' });
    });

    it('extract returns empty bio on skip', () => {
      expect(step.extract({ type: 'callback', value: 'skip' })).toEqual({ bio: '' });
    });

    it('nextStep returns null (last step)', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBeNull();
    });
  });
});
