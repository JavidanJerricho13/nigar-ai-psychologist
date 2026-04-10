import { Context } from 'grammy';
import type { CommandRequest } from '../../../api/src/modules/command-router/domain/command.interfaces';

/**
 * Extended grammY context type for Nigar bot.
 * Can be augmented with session data later.
 */
export type NigarContext = Context;

/**
 * Translates grammY Context → CommandRequest for the core domain.
 * This is the ONLY place that touches Telegram-specific types.
 */
export class TelegramAdapter {
  /** Convert a Telegram update into a transport-agnostic CommandRequest */
  static toCommandRequest(ctx: NigarContext): CommandRequest | null {
    const from = ctx.from;
    if (!from) return null;

    const telegramId = String(from.id);
    const firstName = from.first_name;

    // Command message (e.g., /start, /roles)
    if (ctx.message?.text?.startsWith('/')) {
      const fullText = ctx.message.text;
      const parts = fullText.split(/\s+/);
      const command = parts[0]; // e.g., "/start"
      const deepLinkParam = parts[1]; // e.g., referral code from /start REF_CODE

      return {
        userId: telegramId,
        telegramId,
        command,
        payload: deepLinkParam,
        deepLinkParam,
        userInput: {
          type: 'command',
          value: command.replace('/', ''),
        },
      };
    }

    // Callback query (inline keyboard button press)
    if (ctx.callbackQuery?.data) {
      return {
        userId: telegramId,
        telegramId,
        command: '', // Not a command — will be routed based on onboarding state
        payload: ctx.callbackQuery.data,
        userInput: {
          type: 'callback',
          value: ctx.callbackQuery.data,
        },
      };
    }

    // Voice message
    if (ctx.message?.voice) {
      return {
        userId: telegramId,
        telegramId,
        command: '', // Will be routed to chat or onboarding
        payload: ctx.message.voice.file_id,
        userInput: {
          type: 'voice',
          value: ctx.message.voice.file_id,
        },
      };
    }

    // Regular text message
    if (ctx.message?.text) {
      return {
        userId: telegramId,
        telegramId,
        command: ctx.message.text, // CommandRouter.parseCommand() handles detection
        payload: ctx.message.text,
        userInput: {
          type: 'text',
          value: ctx.message.text,
        },
      };
    }

    return null;
  }

  /** Extract a display name from Telegram context */
  static getDisplayName(ctx: NigarContext): string {
    const from = ctx.from;
    if (!from) return 'Dostum';
    return from.first_name || from.username || 'Dostum';
  }
}
