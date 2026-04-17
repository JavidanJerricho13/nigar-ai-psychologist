import { Injectable, Logger } from '@nestjs/common';
import { CommandRouterService } from '../../../api/src/modules/command-router/command-router.service';
import { TelegramAdapter, NigarContext } from '../adapters/telegram.adapter';
import { sendCommandResponse } from '../renderers/message.renderer';
import { BotService } from '../adapters/bot.service';

/**
 * Registers all /command handlers on the grammY bot.
 * Each handler translates TG context → CommandRequest, dispatches, renders response.
 */
@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly router: CommandRouterService,
  ) {}

  register(): void {
    const bot = this.botService.bot;

    // /start — with optional deep link parameter
    bot.command('start', (ctx) => this.handleCommand(ctx));

    // All other registered commands
    const commands = [
      'roles', 'settings', 'format', 'info', 'balance', 'pay',
      'credits', 'referral', 'gift', 'topics', 'image', 'tales',
      'art', 'nigar_files', 'progress', 'clear_chat', 'memory',
      'mood', 'journal', 'mute', 'unmute', 'subscribe', 'gift_session',
      'programs', 'support', 'about_company', 'b2b', 'other',
    ];

    for (const cmd of commands) {
      bot.command(cmd, (ctx) => this.handleCommand(ctx));
    }

    this.logger.log(`Registered ${commands.length + 1} command handlers`);
  }

  private async handleCommand(ctx: NigarContext): Promise<void> {
    const request = TelegramAdapter.toCommandRequest(ctx);
    if (!request) return;

    await ctx.replyWithChatAction('typing');

    try {
      const response = await this.router.dispatch(request);
      await sendCommandResponse(ctx, response);
    } catch (error) {
      this.logger.error(`Command handler error: ${(error as Error).message}`);
      await ctx.reply('⚠️ Xəta baş verdi. Yenidən cəhd edin.');
    }
  }
}
