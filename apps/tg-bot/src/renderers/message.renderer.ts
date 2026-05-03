import { existsSync } from 'fs';
import { resolve } from 'path';
import { InputFile } from 'grammy';
import type { NigarContext } from '../adapters/telegram.adapter';
import type { CommandResponse } from '../../../api/src/modules/command-router/domain/command.interfaces';
import { renderStepOutput } from './onboarding.renderer';

const ASSETS_SEARCH_PATHS = [
  resolve(__dirname, '..', '..', 'assets'),
  resolve(process.cwd(), 'apps', 'tg-bot', 'assets'),
  resolve(process.cwd(), 'assets'),
];
const photoFileIdCache = new Map<string, string>();

function resolveAssetPath(ref: string): string | null {
  for (const root of ASSETS_SEARCH_PATHS) {
    const candidate = resolve(root, ref);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Sends a CommandResponse back to the user via Telegram.
 * Handles text, inline keyboards, audio, and images.
 */
export async function sendCommandResponse(
  ctx: NigarContext,
  response: CommandResponse,
): Promise<void> {
  const rendered = renderStepOutput(response.output);

  if (rendered.imageUrl) {
    await sendPhoto(ctx, rendered.imageUrl);
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

async function sendPhoto(ctx: NigarContext, ref: string): Promise<void> {
  if (/^https?:\/\//.test(ref)) {
    try {
      await ctx.replyWithPhoto(ref);
    } catch (err) {
      console.error('[message.renderer] replyWithPhoto(url) failed:', (err as Error).message);
    }
    return;
  }

  const cached = photoFileIdCache.get(ref);
  if (cached) {
    try {
      await ctx.replyWithPhoto(cached);
      return;
    } catch {
      // file_id might have expired — fall through to upload
      photoFileIdCache.delete(ref);
    }
  }

  const path = resolveAssetPath(ref);
  if (!path) {
    console.error(`[message.renderer] Onboarding asset not found: ${ref}`);
    return;
  }

  try {
    const sent = await ctx.replyWithPhoto(new InputFile(path));
    const photo = sent.photo?.[sent.photo.length - 1];
    if (photo?.file_id) photoFileIdCache.set(ref, photo.file_id);
  } catch (err) {
    console.error('[message.renderer] replyWithPhoto(file) failed:', (err as Error).message);
  }
}
