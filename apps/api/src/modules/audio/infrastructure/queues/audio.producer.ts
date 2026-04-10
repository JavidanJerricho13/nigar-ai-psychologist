import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TRANSCRIPTION_QUEUE,
  SYNTHESIS_QUEUE,
  TranscriptionJobData,
  SynthesisJobData,
} from './audio.types';

@Injectable()
export class AudioProducer {
  private readonly logger = new Logger(AudioProducer.name);

  constructor(
    @InjectQueue(TRANSCRIPTION_QUEUE) private readonly transcriptionQueue: Queue,
    @InjectQueue(SYNTHESIS_QUEUE) private readonly synthesisQueue: Queue,
  ) {}

  async enqueueTranscription(data: TranscriptionJobData): Promise<string> {
    const job = await this.transcriptionQueue.add('transcribe', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Enqueued transcription job ${job.id} for user ${data.userId}`);
    return job.id!;
  }

  async enqueueSynthesis(data: SynthesisJobData): Promise<string> {
    const job = await this.synthesisQueue.add('synthesize', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Enqueued synthesis job ${job.id} for user ${data.userId}`);
    return job.id!;
  }
}
