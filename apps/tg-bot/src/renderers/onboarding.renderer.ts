import { InlineKeyboard } from 'grammy';
import type { StepOutput } from '@nigar/shared-types';

export interface RenderedOutput {
  text: string;
  keyboard?: InlineKeyboard;
  audioUrl?: string;
  imageUrl?: string;
}

/**
 * Converts domain StepOutput → grammY InlineKeyboard + formatted text.
 * This is the ONLY file that knows about grammY UI types.
 */
export function renderStepOutput(output: StepOutput): RenderedOutput {
  let keyboard: InlineKeyboard | undefined;

  if (output.options && output.options.length > 0) {
    keyboard = new InlineKeyboard();

    for (const opt of output.options) {
      keyboard.text(opt.label, opt.value).row();
    }
  }

  return {
    text: output.text,
    keyboard,
    audioUrl: output.audioUrl,
    imageUrl: output.imageUrl,
  };
}
