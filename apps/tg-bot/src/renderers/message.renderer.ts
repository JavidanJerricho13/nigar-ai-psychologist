import type { NigarContext } from '../adapters/telegram.adapter';
import type { CommandResponse } from '../../../api/src/modules/command-router/domain/command.interfaces';
import { renderStepOutput, RenderedOutput } from './onboarding.renderer';

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

  // Send voice if present
  if (rendered.audioUrl) {
    try {
      // audioUrl is either a file_id or a URL to an OGG Opus file
      await ctx.replyWithVoice(rendered.audioUrl);
    } catch {
      // Fallback: audio not available yet
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
