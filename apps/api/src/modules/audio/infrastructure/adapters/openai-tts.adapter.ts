import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { TtsProviderPort, TtsResult } from '../../domain/ports/tts-provider.port';

/**
 * OpenAI TTS adapter (fallback).
 * Outputs MP3 which must be converted to OGG Opus for Telegram.
 */
@Injectable()
export class OpenAiTtsAdapter implements TtsProviderPort {
  readonly name = 'openai-tts';
  private readonly logger = new Logger(OpenAiTtsAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('llm.openaiKey', '');
  }

  async synthesize(text: string, outputPath: string): Promise<TtsResult> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova',
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`OpenAI TTS error ${response.status}: ${errorBody}`);
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const mp3Path = outputPath.replace(/\.[^.]+$/, '.mp3');
    fs.writeFileSync(mp3Path, audioBuffer);

    const estimatedDuration = Math.ceil((text.length / 5) / 150 * 60);

    this.logger.log(`OpenAI TTS generated: ${mp3Path} (~${estimatedDuration}s)`);

    return {
      filePath: mp3Path,
      format: 'mp3',
      durationSeconds: estimatedDuration,
    };
  }
}
