import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { TtsProviderPort, TtsResult } from '../../domain/ports/tts-provider.port';

/**
 * ElevenLabs TTS adapter (primary).
 * Outputs MP3 which must be converted to OGG Opus for Telegram.
 */
@Injectable()
export class ElevenLabsTtsAdapter implements TtsProviderPort {
  readonly name = 'elevenlabs';
  private readonly logger = new Logger(ElevenLabsTtsAdapter.name);
  private readonly apiKey: string;
  private readonly voiceId: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('audio.elevenlabsKey', '');
    this.voiceId = this.config.get<string>('audio.elevenlabsVoiceId', 'pNInz6obpgDQGcFmaJgB');
  }

  async synthesize(text: string, outputPath: string): Promise<TtsResult> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`ElevenLabs API error ${response.status}: ${errorBody}`);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const mp3Path = outputPath.replace(/\.[^.]+$/, '.mp3');
    fs.writeFileSync(mp3Path, audioBuffer);

    // Estimate duration (~150 words/min, ~5 chars/word)
    const estimatedDuration = Math.ceil((text.length / 5) / 150 * 60);

    this.logger.log(`TTS generated: ${mp3Path} (~${estimatedDuration}s)`);

    return {
      filePath: mp3Path,
      format: 'mp3',
      durationSeconds: estimatedDuration,
    };
  }
}
