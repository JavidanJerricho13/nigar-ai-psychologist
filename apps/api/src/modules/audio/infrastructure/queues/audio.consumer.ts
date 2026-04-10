import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TRANSCRIPTION_QUEUE, TranscriptionJobData } from './audio.types';
import { TranscribeVoiceUseCase } from '../../domain/use-cases/transcribe-voice.use-case';

/**
 * BullMQ consumer for audio transcription jobs.
 * Concurrency: 3 (avoid rate-limiting STT APIs).
 */
@Processor(TRANSCRIPTION_QUEUE, { concurrency: 3 })
export class TranscriptionConsumer extends WorkerHost {
  private readonly logger = new Logger(TranscriptionConsumer.name);

  constructor(private readonly transcribeUseCase: TranscribeVoiceUseCase) {
    super();
  }

  async process(job: Job<TranscriptionJobData>): Promise<string> {
    this.logger.log(
      `Processing transcription job ${job.id} for user ${job.data.userId}`,
    );

    const result = await this.transcribeUseCase.execute({
      filePath: job.data.filePath,
      userId: job.data.userId,
    });

    this.logger.log(
      `Transcription complete: "${result.text.slice(0, 50)}..." (${result.durationSeconds}s)`,
    );

    return result.text;
  }
}
