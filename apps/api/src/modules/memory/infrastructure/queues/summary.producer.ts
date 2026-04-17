import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SUMMARY_QUEUE, SummaryJobData } from './summary.types';

@Injectable()
export class SummaryProducer {
  private readonly logger = new Logger(SummaryProducer.name);

  constructor(@InjectQueue(SUMMARY_QUEUE) private readonly queue: Queue) {}

  /**
   * Enqueue a summary generation job for a completed conversation.
   * Runs async so it doesn't block the user's next message.
   */
  async enqueueSummary(data: SummaryJobData): Promise<void> {
    await this.queue.add('generate-summary', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    this.logger.log(`Summary job enqueued: conv=${data.conversationId.slice(0, 8)}`);
  }
}
