import { renderStepOutput } from '../onboarding.renderer';

describe('onboarding.renderer', () => {
  it('should render text-only output', () => {
    const rendered = renderStepOutput({
      text: 'Hello!',
      inputType: 'text',
    });

    expect(rendered.text).toBe('Hello!');
    expect(rendered.keyboard).toBeUndefined();
    expect(rendered.audioUrl).toBeUndefined();
  });

  it('should render output with inline keyboard buttons', () => {
    const rendered = renderStepOutput({
      text: 'Choose:',
      options: [
        { id: 'a', label: 'Option A', value: 'a' },
        { id: 'b', label: 'Option B', value: 'b' },
      ],
      inputType: 'button',
    });

    expect(rendered.text).toBe('Choose:');
    expect(rendered.keyboard).toBeDefined();
    // InlineKeyboard builds rows — verify it's an object
    expect(typeof rendered.keyboard).toBe('object');
  });

  it('should include audioUrl when present', () => {
    const rendered = renderStepOutput({
      text: 'Listen:',
      audioUrl: 'onboarding/nigar-voice-demo.ogg',
      inputType: 'button',
    });

    expect(rendered.audioUrl).toBe('onboarding/nigar-voice-demo.ogg');
  });

  it('should include imageUrl when present', () => {
    const rendered = renderStepOutput({
      text: 'Look:',
      imageUrl: 'onboarding/w2.png',
      inputType: 'button',
    });

    expect(rendered.imageUrl).toBe('onboarding/w2.png');
  });

  it('should handle empty options array', () => {
    const rendered = renderStepOutput({
      text: 'No buttons',
      options: [],
      inputType: 'button',
    });

    expect(rendered.keyboard).toBeUndefined();
  });

  it('should render voice demo step output correctly', () => {
    const rendered = renderStepOutput({
      text: 'Mənim belə səsim var.',
      audioUrl: 'onboarding/nigar-voice-demo.ogg',
      options: [
        { id: 'voice', label: '🎙 Səs', value: 'voice' },
        { id: 'text', label: '📝 Mətn', value: 'text' },
        { id: 'voice_and_text', label: '🎙 Səs + Mətn', value: 'voice_and_text' },
      ],
      inputType: 'button',
    });

    expect(rendered.text).toContain('səsim var');
    expect(rendered.audioUrl).toContain('.ogg');
    expect(rendered.keyboard).toBeDefined();
  });
});
