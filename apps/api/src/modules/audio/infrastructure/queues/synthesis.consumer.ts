import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNTHESIS_QUEUE, SynthesisJobData } from './audio.types';
import { SynthesizeSpeechUseCase } from '../../domain/use-cases/synthesize-speech.use-case';

/**
 * BullMQ consumer for audio synthesis jobs.
 * Concurrency: 3 (avoid rate-limiting TTS APIs).
 */
@Processor(SYNTHESIS_QUEUE, { concurrency: 3 })
export class SynthesisConsumer extends WorkerHost {
  private readonly logger = new Logger(SynthesisConsumer.name);

  constructor(private readonly synthesizeUseCase: SynthesizeSpeechUseCase) {
    super();
  }

  async process(job: Job<SynthesisJobData>): Promise<{ oggPath: string; durationSeconds: number }> {
    this.logger.log(
      `Processing synthesis job ${job.id} for user ${job.data.userId}`,
    );

    const result = await this.synthesizeUseCase.execute({
      text: job.data.text,
      userId: job.data.userId,
    });

    this.logger.log(
      `Synthesis complete: ${result.durationSeconds}s, ${result.buffer.length} bytes`,
    );

    return {
      oggPath: result.oggPath,
      durationSeconds: result.durationSeconds,
    };
  }
}
