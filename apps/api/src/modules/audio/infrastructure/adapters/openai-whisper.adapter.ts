import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { SttProviderPort, SttResult } from '../../domain/ports/stt-provider.port';

/**
 * OpenAI Whisper STT adapter.
 * Always passes language hint "az" for Azerbaijani to improve accuracy.
 */
@Injectable()
export class OpenAiWhisperAdapter implements SttProviderPort {
  readonly name = 'openai-whisper';
  private readonly logger = new Logger(OpenAiWhisperAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('llm.openaiKey', '');
  }

  async transcribe(filePath: string, languageHint = 'az'): Promise<SttResult> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', languageHint);
    formData.append('response_format', 'verbose_json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Whisper API error ${response.status}: ${errorBody}`);
      throw new Error(`Whisper API error: ${response.status}`);
    }

    const data = (await response.json()) as any;

    this.logger.log(
      `Transcribed: ${data.text?.slice(0, 50)}... (${data.duration}s, lang: ${data.language})`,
    );

    return {
      text: data.text ?? '',
      language: data.language ?? languageHint,
      durationSeconds: data.duration ?? 0,
    };
  }
}
