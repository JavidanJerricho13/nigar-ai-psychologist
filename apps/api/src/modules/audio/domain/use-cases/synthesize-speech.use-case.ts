import { Injectable, Inject, Logger } from '@nestjs/common';
import { TTS_PROVIDER, TtsProviderPort } from '../ports/tts-provider.port';
import { FfmpegService } from '../../infrastructure/conversion/ffmpeg.service';
import { SessionService } from '../../../../shared/redis/session.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  SynthesisFailedException,
  InsufficientCreditsException,
} from '../exceptions/audio.exceptions';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SynthesizeInput {
  text: string;
  userId: string;
}

export interface SynthesizeOutput {
  /** Path to OGG Opus file ready for Telegram */
  oggPath: string;
  /** Audio buffer for sending */
  buffer: Buffer;
  durationSeconds: number;
  creditsRemaining: number;
}

@Injectable()
export class SynthesizeSpeechUseCase {
  private readonly logger = new Logger(SynthesizeSpeechUseCase.name);

  constructor(
    @Inject(TTS_PROVIDER) private readonly tts: TtsProviderPort,
    private readonly ffmpeg: FfmpegService,
    private readonly session: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: SynthesizeInput): Promise<SynthesizeOutput> {
    // 1. Check voice credits
    const creditsRemaining = await this.checkAndDeductCredits(input.userId);

    let ttsOutputPath: string | undefined;
    let oggPath: string | undefined;

    try {
      // 2. Generate speech via TTS provider
      const tempOutputPath = path.join(
        os.tmpdir(),
        'nigar-audio',
        `tts_${Date.now()}.mp3`,
      );
      const ttsResult = await this.tts.synthesize(input.text, tempOutputPath);
      ttsOutputPath = ttsResult.filePath;

      // 3. Convert MP3 → OGG Opus (48kHz, libopus) for Telegram
      oggPath = await this.ffmpeg.toOggOpus(ttsOutputPath);

      // 4. Read the OGG file into buffer
      const buffer = fs.readFileSync(oggPath);

      this.logger.log(
        `Synthesized for ${input.userId.slice(0, 8)}: ${buffer.length} bytes, ~${ttsResult.durationSeconds}s`,
      );

      return {
        oggPath,
        buffer,
        durationSeconds: ttsResult.durationSeconds,
        creditsRemaining,
      };
    } catch (error) {
      if (error instanceof InsufficientCreditsException) throw error;
      throw new SynthesisFailedException((error as Error).message);
    } finally {
      // Cleanup TTS temp file (keep OGG for sending)
      if (ttsOutputPath) this.ffmpeg.cleanup(ttsOutputPath);
    }
  }

  /** Clean up the OGG file after sending */
  cleanup(oggPath: string): void {
    this.ffmpeg.cleanup(oggPath);
  }

  /**
   * Check and deduct voice credits.
   * Returns remaining credits after deduction.
   * Throws InsufficientCreditsException if no credits left.
   */
  private async checkAndDeductCredits(userId: string): Promise<number> {
    // Check Redis cache first (fast path)
    const remaining = await this.session.decrementVoice(userId);

    if (remaining >= 0) {
      // Sync to DB periodically
      if (remaining % 3 === 0 || remaining === 0) {
        await this.syncCreditsToDb(userId, remaining);
      }
      return remaining;
    }

    // Credits exhausted — check if user has purchased credits
    const credit = await this.prisma.credit.findUnique({
      where: { userId },
      select: { balance: true },
    });

    const balance = credit?.balance ? Number(credit.balance) : 0;
    if (balance <= 0) {
      throw new InsufficientCreditsException(userId);
    }

    // Deduct from purchased balance
    await this.prisma.credit.update({
      where: { userId },
      data: {
        balance: { decrement: 1 },
        totalSpent: { increment: 1 },
      },
    });

    return balance - 1;
  }

  private async syncCreditsToDb(userId: string, remaining: number): Promise<void> {
    try {
      await this.prisma.credit.upsert({
        where: { userId },
        create: { userId, freeVoiceRemaining: remaining },
        update: { freeVoiceRemaining: remaining },
      });
    } catch {
      // Non-critical — Redis is source of truth for free credits
    }
  }
}
