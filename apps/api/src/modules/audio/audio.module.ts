import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { STT_PROVIDER } from './domain/ports/stt-provider.port';
import { TTS_PROVIDER } from './domain/ports/tts-provider.port';
import { OpenAiWhisperAdapter } from './infrastructure/adapters/openai-whisper.adapter';
import { ElevenLabsTtsAdapter } from './infrastructure/adapters/elevenlabs-tts.adapter';
import { OpenAiTtsAdapter } from './infrastructure/adapters/openai-tts.adapter';
import { FfmpegService } from './infrastructure/conversion/ffmpeg.service';
import { AudioProducer } from './infrastructure/queues/audio.producer';
import { TranscriptionConsumer } from './infrastructure/queues/audio.consumer';
import { SynthesisConsumer } from './infrastructure/queues/synthesis.consumer';
import { TranscribeVoiceUseCase } from './domain/use-cases/transcribe-voice.use-case';
import { SynthesizeSpeechUseCase } from './domain/use-cases/synthesize-speech.use-case';
import { TRANSCRIPTION_QUEUE, SYNTHESIS_QUEUE } from './infrastructure/queues/audio.types';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.get<string>('redis.url', 'redis://localhost:6379')).hostname,
          port: parseInt(
            new URL(config.get<string>('redis.url', 'redis://localhost:6379')).port || '6379',
          ),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: TRANSCRIPTION_QUEUE },
      { name: SYNTHESIS_QUEUE },
    ),
  ],
  providers: [
    // STT: Whisper
    { provide: STT_PROVIDER, useClass: OpenAiWhisperAdapter },

    // TTS: ElevenLabs primary (swap to OpenAiTtsAdapter for fallback)
    { provide: TTS_PROVIDER, useClass: ElevenLabsTtsAdapter },

    // Keep OpenAI TTS available for manual fallback
    OpenAiTtsAdapter,

    // Conversion
    FfmpegService,

    // Queues
    AudioProducer,
    TranscriptionConsumer,
    SynthesisConsumer,

    // Use cases
    TranscribeVoiceUseCase,
    SynthesizeSpeechUseCase,
  ],
  exports: [
    TranscribeVoiceUseCase,
    SynthesizeSpeechUseCase,
    AudioProducer,
    FfmpegService,
  ],
})
export class AudioModule {}
