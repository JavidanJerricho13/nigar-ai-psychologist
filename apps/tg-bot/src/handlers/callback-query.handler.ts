import { Injectable, Logger } from '@nestjs/common';
import { CommandRouterService } from '../../../api/src/modules/command-router/command-router.service';
import { TelegramAdapter, NigarContext } from '../adapters/telegram.adapter';
import { sendCommandResponse, answerCallback } from '../renderers/message.renderer';
import { BotService } from '../adapters/bot.service';

/**
 * Handles inline keyboard callback queries.
 * Answers the callback (removes spinner) then dispatches to CommandRouter.
 */
@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly router: CommandRouterService,
  ) {}

  register(): void {
    const bot = this.botService.bot;

    bot.on('callback_query:data', async (ctx) => {
      // Answer callback immediately (removes loading spinner)
      await answerCallback(ctx);

      const request = TelegramAdapter.toCommandRequest(ctx);
      if (!request) return;

      await ctx.replyWithChatAction('typing');

      try {
        const response = await this.router.dispatch(request);
        await sendCommandResponse(ctx, response);
      } catch (error) {
        this.logger.error(`Callback handler error: ${(error as Error).message}`);
        await ctx.reply('⚠️ Xəta baş verdi. Yenidən cəhd edin.');
      }
    });

    this.logger.log('Registered callback query handler');
  }
}
