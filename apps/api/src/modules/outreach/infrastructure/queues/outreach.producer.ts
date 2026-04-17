import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OUTREACH_QUEUE, OutreachJobData } from './outreach.types';

@Injectable()
export class OutreachProducer {
  private readonly logger = new Logger(OutreachProducer.name);

  constructor(@InjectQueue(OUTREACH_QUEUE) private readonly queue: Queue) {}

  /**
   * Schedule a check-in message 24 hours after session end.
   */
  async scheduleCheckIn(userId: string, conversationId: string): Promise<void> {
    await this.queue.add(
      'outreach',
      { userId, type: 'check_in', conversationId } satisfies OutreachJobData,
      {
        delay: 24 * 60 * 60 * 1000, // 24 hours
        attempts: 2,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 200,
        removeOnFail: 50,
        jobId: `check_in:${userId}`, // deduplicate: only 1 pending check-in per user
      },
    );
    this.logger.log(`Check-in scheduled (+24h) for user ${userId.slice(0, 8)}`);
  }

  /**
   * Schedule a crisis follow-up 24 hours after crisis detection.
   */
  async scheduleCrisisFollowUp(userId: string): Promise<void> {
    await this.queue.add(
      'outreach',
      { userId, type: 'crisis_follow_up' } satisfies OutreachJobData,
      {
        delay: 24 * 60 * 60 * 1000, // 24 hours
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 50,
        jobId: `crisis_followup:${userId}`,
      },
    );
    this.logger.log(`Crisis follow-up scheduled (+24h) for user ${userId.slice(0, 8)}`);
  }

  /**
   * Schedule a milestone celebration message (immediate, but throttle-checked).
   */
  async scheduleMilestone(userId: string, milestoneDay: number): Promise<void> {
    await this.queue.add(
      'outreach',
      { userId, type: 'milestone', milestoneDay } satisfies OutreachJobData,
      {
        delay: 5000, // small delay so summary job finishes first
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 50,
      },
    );
  }
}
