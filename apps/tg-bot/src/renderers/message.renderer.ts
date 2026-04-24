import { InputFile } from 'grammy';
import type { NigarContext } from '../adapters/telegram.adapter';
import type { CommandResponse } from '../../../api/src/modules/command-router/domain/command.interfaces';
import { renderStepOutput } from './onboarding.renderer';

/**
 * Sends a CommandResponse back to the user via Telegram.
 * Handles text, inline keyboards, audio, and images.
 */
export async function sendCommandResponse(
  ctx: NigarContext,
  response: CommandResponse,
): Promise<void> {
  const rendered = renderStepOutput(response.output);

  // Send image if present (as photo with caption)
  if (rendered.imageUrl) {
    // For now, images are asset references — will be URLs or file_ids later
    // Skip image sending until asset pipeline is ready
  }

  // Determine response format to decide text + voice combination
  const audioBuffer = (response as any).meta?.audioBuffer as Buffer | undefined;

  // Send voice if we have a buffer (TTS result) or an explicit audioUrl
  if (audioBuffer && audioBuffer.length > 0) {
    try {
      await ctx.replyWithVoice(new InputFile(audioBuffer, 'reply.ogg'));
    } catch (err) {
      // If voice fails (e.g. network / API), silently fall through — text still below.
      console.error('[message.renderer] replyWithVoice failed:', (err as Error).message);
    }
  } else if (rendered.audioUrl) {
    try {
      await ctx.replyWithVoice(rendered.audioUrl);
    } catch {
      // Fallback: audio not available
    }
  }

  // Send text with optional keyboard
  if (rendered.text) {
    await ctx.reply(rendered.text, {
      parse_mode: 'HTML',
      reply_markup: rendered.keyboard,
    });
  }
}

/**
 * Answer a callback query (removes the "loading" spinner on the button).
 */
export async function answerCallback(ctx: NigarContext): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // Ignore if already answered or expired
  }
}
