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
import { AudioModule } from './modules/audio/audio.module';
import { Bot, webhookCallback, BotError, GrammyError, HttpError, InputFile } from 'grammy';
import { CommandRouterService } from './modules/command-router/command-router.service';
import type { CommandRequest, CommandResponse } from './modules/command-router/domain/command.interfaces';
import { TranscribeVoiceUseCase } from './modules/audio/domain/use-cases/transcribe-voice.use-case';
import { SynthesizeSpeechUseCase } from './modules/audio/domain/use-cases/synthesize-speech.use-case';
import { InlineKeyboard } from 'grammy';
import type { StepOutput } from '@nigar/shared-types';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';

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
    AudioModule,
  ],
})
class BotEntryModule implements OnModuleInit {
  private readonly logger = new Logger('BotEntry');
  private bot!: Bot;

  constructor(
    private readonly router: CommandRouterService,
    private readonly transcribe: TranscribeVoiceUseCase,
    private readonly synthesize: SynthesizeSpeechUseCase,
  ) {}

  async onModuleInit() {
    const token = loadBotToken();
    this.logger.log(`Bot token loaded (${token.slice(0, 5)}...${token.slice(-5)})`);

    this.bot = new Bot(token);
    this.setupErrorHandler();
    this.registerHandlers();

    try {
      this.logger.log('Deleting existing webhook...');
      await this.bot.api.deleteWebhook();
      this.logger.log('Webhook deleted, starting polling...');
    } catch (err) {
      this.logger.error(`Failed to delete webhook: ${(err as Error).message}`);
    }

    // bot.start() returns a Promise that resolves when bot stops
    // Don't await it — it runs forever
    this.bot.start({
      onStart: (info) => {
        this.logger.log(`🤖 Nigar Bot started as @${info.username} (polling mode)`);
      },
    }).catch((err) => {
      this.logger.error(`Bot polling failed: ${(err as Error).message}`);
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
        await this.sendResponse(ctx, response);
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

    // Voice messages — STT → Chat → optional TTS
    this.bot.on('message:voice', async (ctx) => {
      const from = ctx.from;
      if (!from) return;
      const telegramId = String(from.id);

      await ctx.replyWithChatAction('record_voice');

      let tempOggPath: string | undefined;

      try {
        // 1. Download OGG from Telegram
        const voice = ctx.message.voice;
        const file = await this.bot.api.getFile(voice.file_id);
        if (!file.file_path) throw new Error('No file_path from Telegram');

        const url = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
        const tempDir = path.join(os.tmpdir(), 'nigar-voice');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        tempOggPath = path.join(tempDir, `${Date.now()}.ogg`);

        await new Promise<void>((resolve, reject) => {
          const ws = fs.createWriteStream(tempOggPath!);
          https.get(url, (res) => {
            res.pipe(ws);
            ws.on('finish', () => { ws.close(); resolve(); });
          }).on('error', reject);
        });

        this.logger.log(`Voice downloaded: ${tempOggPath} (${voice.duration}s)`);

        // 2. STT — transcribe OGG to text
        await ctx.replyWithChatAction('typing');
        const sttResult = await this.transcribe.execute({
          filePath: tempOggPath,
          userId: telegramId,
        });

        this.logger.log(`STT result: "${sttResult.text.slice(0, 50)}..."`);

        if (!sttResult.text.trim()) {
          await ctx.reply('🤔 Səs mesajını anlaya bilmədim. Zəhmət olmasa daha aydın danışın.');
          return;
        }

        // 3. Route transcribed text through CommandRouter as a text message
        const request: CommandRequest = {
          userId: telegramId,
          telegramId,
          command: sttResult.text,
          payload: sttResult.text,
          userInput: { type: 'text', value: sttResult.text },
        };

        const response = await this.router.dispatch(request);

        // 4. Send response (voice + text based on meta)
        await this.sendResponse(ctx, response);
      } catch (err) {
        this.logger.error(`Voice error: ${(err as Error).message}`);
        await ctx.reply('⚠️ Səs mesajını emal edə bilmədim. Zəhmət olmasa mətn yazın.');
      } finally {
        if (tempOggPath && fs.existsSync(tempOggPath)) {
          try { fs.unlinkSync(tempOggPath); } catch {}
        }
      }
    });

    this.logger.log('All handlers registered');
  }

  /**
   * Send a CommandResponse back to Telegram.
   * Handles: text, inline keyboard, voice (TTS), and voice+text.
   */
  private async sendResponse(ctx: any, response: CommandResponse): Promise<void> {
    const rendered = renderStepOutput(response.output);

    // Check if we should generate voice (from meta.audioBuffer or TTS)
    const audioBuffer = response.meta?.audioBuffer as Buffer | undefined;
    const shouldSendVoice = !!audioBuffer;

    // If audio buffer exists (from TTS in handleChat), send as voice
    if (shouldSendVoice && audioBuffer) {
      try {
        await ctx.replyWithVoice(new InputFile(audioBuffer, 'response.ogg'));
      } catch (err: any) {
        this.logger.error(`Voice reply failed: ${err.message}`);
      }
    }

    // Send static audio URL (e.g., onboarding voice demo)
    if (rendered.audioUrl && !shouldSendVoice) {
      try { await ctx.replyWithVoice(rendered.audioUrl); } catch {}
    }

    // Always send text (unless voice-only and we already sent voice)
    await ctx.reply(rendered.text, { reply_markup: rendered.keyboard });
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
  // Trigger lifecycle hooks (onModuleInit → starts bot polling)
  await app.init();
  Logger.log('🧠 Bot process initialized and polling', 'Bootstrap');
}

bootstrap();
