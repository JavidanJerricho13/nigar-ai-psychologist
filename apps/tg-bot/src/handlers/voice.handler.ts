import { Injectable, Logger } from '@nestjs/common';
import { CommandRouterService } from '../../../api/src/modules/command-router/command-router.service';
import { TelegramAdapter, NigarContext } from '../adapters/telegram.adapter';
import { sendCommandResponse } from '../renderers/message.renderer';
import { BotService } from '../adapters/bot.service';

/**
 * Handles voice messages.
 * Downloads OGG from Telegram, routes to CommandRouter.
 * Phase 4 will add STT transcription.
 */
@Injectable()
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly router: CommandRouterService,
  ) {}

  register(): void {
    const bot = this.botService.bot;

    bot.on('message:voice', async (ctx) => {
      const request = TelegramAdapter.toCommandRequest(ctx);
      if (!request) return;

      // Show "recording voice" action while processing
      await ctx.replyWithChatAction('record_voice');

      try {
        const response = await this.router.dispatch(request);
        await sendCommandResponse(ctx, response);
      } catch (error) {
        this.logger.error(`Voice handler error: ${(error as Error).message}`);
        await ctx.reply(
          '⚠️ Səs mesajını emal edə bilmədim. Zəhmət olmasa mətn kimi yazın.',
        );
      }
    });

    this.logger.log('Registered voice message handler');
  }
}
