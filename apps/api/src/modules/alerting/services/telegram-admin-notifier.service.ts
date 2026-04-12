import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';

/**
 * TelegramAdminNotifier — sends operational alerts to a configured admin chat.
 *
 * Uses a dedicated grammY Bot client (re-uses TELEGRAM_BOT_TOKEN, no polling) so it
 * is fully decoupled from the user-facing bot polling loop and from any HTTP layer.
 *
 * Required env:
 *   - TELEGRAM_BOT_TOKEN (already used by the main bot)
 *   - ADMIN_TG_ID  (numeric chat id for a private DM with the admin, or a channel id like -100…)
 */
@Injectable()
export class TelegramAdminNotifierService {
  private readonly logger = new Logger(TelegramAdminNotifierService.name);
  private readonly bot: Bot | null;
  private readonly chatId: string | null;

  constructor(config: ConfigService) {
    const token = config.get<string>('telegram.botToken') ?? process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.ADMIN_TG_ID ?? config.get<string>('admin.telegramId') ?? null;

    this.chatId = chatId && chatId.trim().length > 0 ? chatId.trim() : null;
    this.bot = token ? new Bot(token) : null;

    if (!this.bot) {
      this.logger.warn('TelegramAdminNotifier: TELEGRAM_BOT_TOKEN missing — alerts disabled');
    }
    if (!this.chatId) {
      this.logger.warn('TelegramAdminNotifier: ADMIN_TG_ID missing — alerts will be skipped');
    }
  }

  get isEnabled(): boolean {
    return !!this.bot && !!this.chatId;
  }

  /**
   * Low-level send. Always returns true on success / false on failure (never throws),
   * because alerts must NEVER break the calling pipeline (cron, webhook, etc.).
   */
  async sendText(text: string): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      await this.bot!.api.sendMessage(this.chatId!, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (err) {
      this.logger.error(`Telegram admin alert failed: ${(err as Error).message}`);
      return false;
    }
  }

  // -------- Specialized helpers --------

  /** 6.1 — daily crisis summary */
  async sendCrisisSummary(args: {
    unhandled: number;
    last24h: number;
    samples: Array<{ severity: string; createdAt: Date; userId: string; keywords: string[] }>;
  }): Promise<boolean> {
    if (args.unhandled === 0 && args.last24h === 0) {
      return this.sendText(
        '✅ <b>Daily Safety Report</b>\nNo crisis events in the last 24h. No unhandled cases.',
      );
    }

    const lines: string[] = [];
    lines.push('🆘 <b>Daily Safety Report</b>');
    lines.push(`• Unhandled crisis events: <b>${args.unhandled}</b>`);
    lines.push(`• New crisis events (24h): <b>${args.last24h}</b>`);

    if (args.samples.length > 0) {
      lines.push('');
      lines.push('<b>Latest:</b>');
      for (const s of args.samples.slice(0, 5)) {
        const when = s.createdAt.toISOString().slice(0, 16).replace('T', ' ');
        const kw = s.keywords.slice(0, 3).join(', ');
        lines.push(
          `• [${s.severity}] ${when} UTC — user <code>${s.userId.slice(0, 8)}</code> — ${kw || '—'}`,
        );
      }
    }

    lines.push('');
    lines.push('Open admin panel → Safety → CrisisEvents to handle.');
    return this.sendText(lines.join('\n'));
  }

  /** 6.3 — Stripe failed payment alert */
  async sendStripeFailure(args: {
    userId?: string;
    amountCents?: number;
    currency?: string;
    reason?: string;
    paymentIntentId?: string;
  }): Promise<boolean> {
    const amount = args.amountCents ? (args.amountCents / 100).toFixed(2) : '?';
    const currency = (args.currency ?? '').toUpperCase();
    const lines = [
      '💳 <b>Stripe payment failed</b>',
      `• User: <code>${args.userId ?? 'unknown'}</code>`,
      `• Amount: <b>${amount} ${currency}</b>`,
      `• Reason: ${args.reason ?? 'n/a'}`,
      `• PaymentIntent: <code>${args.paymentIntentId ?? '—'}</code>`,
    ];
    return this.sendText(lines.join('\n'));
  }
}
