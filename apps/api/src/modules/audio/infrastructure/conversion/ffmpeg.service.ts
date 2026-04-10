import { Injectable, Logger } from '@nestjs/common';
import ffmpeg = require('fluent-ffmpeg');
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Audio conversion service using FFmpeg.
 *
 * Key conversions:
 * - OGG Opus (Telegram voice) → WAV (for Whisper STT)
 * - MP3/WAV (TTS output) → OGG Opus 48kHz (for Telegram voice reply)
 *
 * CRITICAL: Telegram only displays audio as native voice waveform
 * if it's OGG with Opus codec. MP3/WAV shows as audio file (music player).
 */
@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'nigar-audio');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Convert Telegram OGG Opus → WAV for STT.
   * Whisper accepts OGG directly but WAV gives more consistent results.
   */
  async oggToWav(inputPath: string): Promise<string> {
    const outputPath = this.tempPath('wav');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('end', () => {
          this.logger.log(`Converted OGG → WAV: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err: any) => {
          this.logger.error(`OGG → WAV failed: ${err.message}`);
          reject(new Error(`FFmpeg OGG→WAV failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Convert TTS output (MP3/WAV) → OGG Opus for Telegram voice messages.
   * Uses libopus codec at 48kHz — REQUIRED for Telegram voice waveform UI.
   */
  async toOggOpus(inputPath: string): Promise<string> {
    const outputPath = this.tempPath('ogg');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .audioBitrate('48k')
        .audioFrequency(48000)
        .audioChannels(1)
        .format('ogg')
        .on('end', () => {
          this.logger.log(`Converted → OGG Opus: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err: any) => {
          this.logger.error(`→ OGG Opus failed: ${err.message}`);
          reject(new Error(`FFmpeg →OGG Opus failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /** Clean up a temp file */
  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Generate a unique temp file path */
  private tempPath(ext: string): string {
    return path.join(this.tempDir, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
  }
}
