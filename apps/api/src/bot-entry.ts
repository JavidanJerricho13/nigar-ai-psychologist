/**
 * Bot entry point — runs within the API's NestJS context.
 *
 * Usage: node dist/bot-entry.js   (from apps/api/ or project root)
 */
import * as path from 'path';

import { initSentry } from './common/sentry/sentry.init';
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, validationSchema } from './config/configuration';
import { RedisModule } from './shared/redis/redis.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { UserModule } from './modules/user/user.module';
import { CommandRouterModule } from './modules/command-router/command-router.module';
import { ChatModule } from './modules/chat/chat.module';
import { Bot, webhookCallback, BotError, GrammyError, HttpError } from 'grammy';
import { CommandRouterService } from './modules/command-router/command-router.service';
import type { CommandRequest } from './modules/command-router/domain/command.interfaces';
import { InlineKeyboard } from 'grammy';
import type { StepOutput } from '@nigar/shared-types';

// ===================== BOT CONFIG =====================

function loadBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  return token;
}

// ===================== RENDERERS =====================

function renderStepOutput(output: StepOutput) {
  let keyboard: InlineKeyboard | undefined;
  if (output.options?.length) {
    keyboard = new InlineKeyboard();
    for (const opt of output.options) {
      keyboard.text(opt.label, opt.value).row();
    }
  }
  return { text: output.text, keyboard, audioUrl: output.audioUrl };
}

// ===================== BOT MODULE =====================

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),              // project root
        path.resolve(__dirname, '../../../.env'),           // from dist/
        path.resolve(__dirname, '../../.env'),              // from src/
      ],
      load: [configuration],
      validate: validationSchema,
    }),
    RedisModule,
    PrismaModule,
    EncryptionModule,
    OnboardingModule,
    UserModule,
    CommandRouterModule,
    ChatModule,
  ],
})
class BotEntryModule implements OnModuleInit {
  private readonly logger = new Logger('BotEntry');
  private bot!: Bot;

  constructor(private readonly router: CommandRouterService) {}

  async onModuleInit() {
    this.bot = new Bot(loadBotToken());
    this.setupErrorHandler();
    this.registerHandlers();

    await this.bot.api.deleteWebhook();
    this.bot.start({
      onStart: (info) => {
        this.logger.log(`🤖 Nigar Bot started as @${info.username} (polling)`);
      },
    });
  }

  private registerHandlers() {
    // Commands
    this.bot.on('message:text', async (ctx) => {
      const from = ctx.from;
      if (!from) return;

      const telegramId = String(from.id);
      const text = ctx.message.text;

      const request: CommandRequest = {
        userId: telegramId,
        telegramId,
        command: text,
        payload: text.startsWith('/') ? text.split(/\s+/)[1] : text,
        deepLinkParam: text.startsWith('/start ') ? text.split(/\s+/)[1] : undefined,
        userInput: text.startsWith('/')
          ? { type: 'command', value: text.replace('/', '').split(/\s+/)[0] }
          : { type: 'text', value: text },
      };

      await ctx.replyWithChatAction('typing');

      try {
        const response = await this.router.dispatch(request);
        const rendered = renderStepOutput(response.output);

        if (rendered.audioUrl) {
          try { await ctx.replyWithVoice(rendered.audioUrl); } catch {}
        }
        await ctx.reply(rendered.text, { reply_markup: rendered.keyboard });
      } catch (err) {
        this.logger.error(`Handler error: ${(err as Error).message}`);
        await ctx.reply('⚠️ Xəta baş verdi. Yenidən cəhd edin.');
      }
    });

    // Callback queries (inline keyboard)
    this.bot.on('callback_query:data', async (ctx) => {
      await ctx.answerCallbackQuery();
      const from = ctx.from;
      const telegramId = String(from.id);

      const request: CommandRequest = {
        userId: telegramId,
        telegramId,
        command: '',
        payload: ctx.callbackQuery.data,
        userInput: { type: 'callback', value: ctx.callbackQuery.data },
      };

      await ctx.replyWithChatAction('typing');

      try {
        const response = await this.router.dispatch(request);
        const rendered = renderStepOutput(response.output);
        await ctx.reply(rendered.text, { reply_markup: rendered.keyboard });
      } catch (err) {
        this.logger.error(`Callback error: ${(err as Error).message}`);
        await ctx.reply('⚠️ Xəta baş verdi.');
      }
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      const from = ctx.from;
      if (!from) return;
      const telegramId = String(from.id);

      await ctx.replyWithChatAction('record_voice');

      const request: CommandRequest = {
        userId: telegramId,
        telegramId,
        command: '',
        payload: ctx.message.voice.file_id,
        userInput: { type: 'voice', value: ctx.message.voice.file_id },
      };

      try {
        const response = await this.router.dispatch(request);
        const rendered = renderStepOutput(response.output);
        await ctx.reply(rendered.text, { reply_markup: rendered.keyboard });
      } catch (err) {
        this.logger.error(`Voice error: ${(err as Error).message}`);
        await ctx.reply('⚠️ Səs mesajını emal edə bilmədim.');
      }
    });

    this.logger.log('All handlers registered');
  }

  private setupErrorHandler() {
    this.bot.catch((err: BotError) => {
      const e = err.error;
      if (e instanceof GrammyError) {
        this.logger.error(`Grammy error: ${e.description}`);
        if (e.error_code === 429) return;
      } else if (e instanceof HttpError) {
        this.logger.error(`HTTP error: ${e.message}`);
      } else {
        this.logger.error(`Bot error: ${e}`);
      }
      err.ctx.reply('⚠️ Xəta baş verdi.').catch(() => {});
    });
  }
}

// ===================== BOOTSTRAP =====================

async function bootstrap() {
  const app = await NestFactory.create(BotEntryModule, { logger: ['log', 'error', 'warn'] });
  // Keep the process alive — bot.start() handles polling
  Logger.log('🧠 Bot process initialized', 'Bootstrap');
}

bootstrap();
