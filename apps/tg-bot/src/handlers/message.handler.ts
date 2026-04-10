import { Injectable, Logger } from '@nestjs/common';
import { CommandRouterService } from '../../../api/src/modules/command-router/command-router.service';
import { TelegramAdapter, NigarContext } from '../adapters/telegram.adapter';
import { sendCommandResponse } from '../renderers/message.renderer';
import { BotService } from '../adapters/bot.service';

/**
 * Handles free-text messages (not commands).
 * Routes through CommandRouter which decides: onboarding FSM or chat.
 */
@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly router: CommandRouterService,
  ) {}

  register(): void {
    const bot = this.botService.bot;

    bot.on('message:text', async (ctx) => {
      // Skip if it's a command (handled by CommandHandler)
      if (ctx.message.text.startsWith('/')) return;

      const request = TelegramAdapter.toCommandRequest(ctx);
      if (!request) return;

      await ctx.replyWithChatAction('typing');

      try {
        const response = await this.router.dispatch(request);
        await sendCommandResponse(ctx, response);
      } catch (error) {
        this.logger.error(`Message handler error: ${(error as Error).message}`);
        await ctx.reply('⚠️ Xəta baş verdi. Yenidən cəhd edin.');
      }
    });

    this.logger.log('Registered text message handler');
  }
}
