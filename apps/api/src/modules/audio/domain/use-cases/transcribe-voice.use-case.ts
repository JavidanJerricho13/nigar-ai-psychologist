import { Injectable, Inject, Logger } from '@nestjs/common';
import { STT_PROVIDER, SttProviderPort, SttResult } from '../ports/stt-provider.port';
import { FfmpegService } from '../../infrastructure/conversion/ffmpeg.service';
import { TranscriptionFailedException } from '../exceptions/audio.exceptions';

export interface TranscribeInput {
  /** Path to the OGG Opus file from Telegram */
  filePath: string;
  userId: string;
  languageHint?: string;
}

@Injectable()
export class TranscribeVoiceUseCase {
  private readonly logger = new Logger(TranscribeVoiceUseCase.name);

  constructor(
    @Inject(STT_PROVIDER) private readonly stt: SttProviderPort,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async execute(input: TranscribeInput): Promise<SttResult> {
    let wavPath: string | undefined;

    try {
      // 1. Convert OGG Opus → WAV for better STT accuracy
      wavPath = await this.ffmpeg.oggToWav(input.filePath);

      // 2. Transcribe with language hint "az"
      const result = await this.stt.transcribe(
        wavPath,
        input.languageHint ?? 'az',
      );

      this.logger.log(
        `Transcribed for user ${input.userId.slice(0, 8)}: "${result.text.slice(0, 40)}..."`,
      );

      return result;
    } catch (error) {
      throw new TranscriptionFailedException((error as Error).message);
    } finally {
      // Cleanup temp WAV
      if (wavPath) this.ffmpeg.cleanup(wavPath);
    }
  }
}
