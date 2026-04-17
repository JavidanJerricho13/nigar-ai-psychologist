import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';

/**
 * Sends proactive messages to users via Telegram Bot API.
 * Reuses the same TELEGRAM_BOT_TOKEN as the main bot (API-only, no polling).
 */
@Injectable()
export class TelegramOutreachAdapter {
  private readonly logger = new Logger(TelegramOutreachAdapter.name);
  private readonly bot: Bot | null;

  constructor(config: ConfigService) {
    const token = config.get<string>('telegram.botToken') ?? process.env.TELEGRAM_BOT_TOKEN;
    this.bot = token ? new Bot(token) : null;

    if (!this.bot) {
      this.logger.warn('TelegramOutreach: TELEGRAM_BOT_TOKEN missing — outreach disabled');
    }
  }

  get isEnabled(): boolean {
    return !!this.bot;
  }

  /**
   * Send a text message to a specific Telegram user.
   * Returns true on success, false on failure (never throws).
   */
  async sendToUser(telegramId: string, text: string): Promise<boolean> {
    if (!this.bot || !telegramId) return false;

    try {
      await this.bot.api.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      // User blocked the bot or chat not found — not an error to retry
      if (msg.includes('bot was blocked') || msg.includes('chat not found')) {
        this.logger.debug(`User ${telegramId} blocked bot or chat not found — skipping`);
        return false;
      }
      this.logger.error(`Outreach send failed to ${telegramId}: ${msg}`);
      return false;
    }
  }
}
