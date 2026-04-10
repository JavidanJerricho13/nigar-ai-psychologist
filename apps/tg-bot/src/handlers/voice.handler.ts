import { Injectable, Logger } from '@nestjs/common';
import { CommandRouterService } from '../../../api/src/modules/command-router/command-router.service';
import { TelegramAdapter, NigarContext } from '../adapters/telegram.adapter';
import { sendCommandResponse } from '../renderers/message.renderer';
import { BotService } from '../adapters/bot.service';
import { VoiceDownloadService } from '../services/voice-download.service';

/**
 * Handles voice messages.
 * Downloads OGG Opus from Telegram API, routes to CommandRouter.
 * Phase 4 will add STT transcription via the downloaded file.
 */
@Injectable()
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly router: CommandRouterService,
    private readonly voiceDownload: VoiceDownloadService,
  ) {}

  register(): void {
    const bot = this.botService.bot;

    bot.on('message:voice', async (ctx) => {
      const request = TelegramAdapter.toCommandRequest(ctx);
      if (!request) return;

      await ctx.replyWithChatAction('record_voice');

      let downloadedPath: string | undefined;

      try {
        // Download the OGG Opus file from Telegram
        const voice = ctx.message!.voice;
        const downloaded = await this.voiceDownload.download(
          voice.file_id,
          voice.duration,
        );
        downloadedPath = downloaded.filePath;

        this.logger.log(
          `Voice from ${ctx.from?.id}: ${downloaded.fileSize} bytes, ${downloaded.duration}s`,
        );

        // TODO Phase 4: Pass downloaded.filePath to STT pipeline
        // For now, route the file_id through CommandRouter
        const response = await this.router.dispatch(request);
        await sendCommandResponse(ctx, response);
      } catch (error) {
        this.logger.error(`Voice handler error: ${(error as Error).message}`);
        await ctx.reply(
          '⚠️ Səs mesajını emal edə bilmədim. Zəhmət olmasa mətn kimi yazın.',
        );
      } finally {
        if (downloadedPath) {
          this.voiceDownload.cleanup(downloadedPath);
        }
      }
    });

    this.logger.log('Registered voice message handler');
  }
}
