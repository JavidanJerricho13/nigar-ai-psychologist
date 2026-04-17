import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Bot, webhookCallback, BotError, GrammyError, HttpError } from 'grammy';
import type { INestApplication } from '@nestjs/common';
import { BOT_CONFIG, BotEnvConfig, BotMode } from '../config/bot.config';
import type { NigarContext } from './telegram.adapter';

@Injectable()
export class BotService implements OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  readonly bot: Bot<NigarContext>;
  private running = false;

  constructor(@Inject(BOT_CONFIG) private readonly config: BotEnvConfig) {
    this.bot = new Bot<NigarContext>(config.TELEGRAM_BOT_TOKEN);
    this.setupErrorHandler();
  }

  /** Launch the bot in the configured mode */
  async launch(app: INestApplication): Promise<void> {
    if (this.config.BOT_MODE === BotMode.WEBHOOK) {
      await this.startWebhook(app);
    } else {
      await this.startPolling();
    }
  }

  /** Stop the bot gracefully */
  async stop(): Promise<void> {
    if (this.running) {
      await this.bot.stop();
      this.running = false;
      this.logger.log('Bot stopped');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  // ===================== MODES =====================

  private async startPolling(): Promise<void> {
    // Delete any existing webhook before starting polling
    await this.bot.api.deleteWebhook();

    this.bot.start({
      onStart: async (botInfo) => {
        this.running = true;
        this.logger.log(
          `🤖 Bot started in POLLING mode as @${botInfo.username}`,
        );
        await this.setupMenuButton();
      },
    });
  }

  private async startWebhook(app: INestApplication): Promise<void> {
    const domain = this.config.WEBHOOK_DOMAIN;
    const path = this.config.WEBHOOK_PATH;
    const secret = this.config.TELEGRAM_WEBHOOK_SECRET;
    const port = this.config.WEBHOOK_PORT;

    if (!domain) {
      throw new Error('WEBHOOK_DOMAIN is required for webhook mode');
    }

    const webhookUrl = `${domain}${path}`;

    // Set webhook with Telegram
    await this.bot.api.setWebhook(webhookUrl, {
      secret_token: secret,
    });

    // Mount webhook handler on Express
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.post(
      path,
      webhookCallback(this.bot, 'express', {
        secretToken: secret,
      }),
    );

    await app.listen(port);
    this.running = true;
    this.logger.log(
      `🌐 Bot started in WEBHOOK mode at ${webhookUrl} (port ${port})`,
    );
    await this.setupMenuButton();
  }

  // ===================== MENU BUTTON =====================

  /**
   * Set the Chat Menu Button to open the Telegram Mini App.
   * This adds a button in the bot's chat input area that opens the TWA.
   */
  private async setupMenuButton(): Promise<void> {
    const miniAppUrl = this.config.WEBHOOK_DOMAIN
      ? `${this.config.WEBHOOK_DOMAIN}/mini-app/index.html`
      : null;

    if (!miniAppUrl) {
      this.logger.debug('No WEBHOOK_DOMAIN configured — skipping Menu Button setup');
      return;
    }

    try {
      await this.bot.api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '📊 İrəliləyiş',
          web_app: { url: miniAppUrl },
        },
      });
      this.logger.log(`Menu button set: ${miniAppUrl}`);
    } catch (err) {
      this.logger.warn(`Failed to set menu button: ${(err as Error).message}`);
    }
  }

  // ===================== ERROR HANDLING =====================

  private setupErrorHandler(): void {
    this.bot.catch((err: BotError<NigarContext>) => {
      const ctx = err.ctx;
      const e = err.error;

      const userId = ctx.from?.id ?? 'unknown';

      if (e instanceof GrammyError) {
        this.logger.error(
          `Grammy API error for user ${userId}: ${e.description} (code: ${e.error_code})`,
        );
        // Rate limit (429) — silently ignore, don't crash
        if (e.error_code === 429) return;
      } else if (e instanceof HttpError) {
        this.logger.error(
          `HTTP error for user ${userId}: ${e.message}`,
        );
      } else {
        this.logger.error(
          `Unexpected error for user ${userId}: ${e}`,
        );
      }

      // Try to notify user of error (best effort)
      ctx
        .reply('⚠️ Xəta baş verdi. Zəhmət olmasa bir az sonra yenidən cəhd edin.')
        .catch(() => {});
    });
  }
}
