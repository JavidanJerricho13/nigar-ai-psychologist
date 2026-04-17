import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SUMMARY_QUEUE, SummaryJobData } from './summary.types';
import { SessionSummaryService } from '../../domain/services/session-summary.service';
import { TherapeuticProfileService } from '../../domain/services/therapeutic-profile.service';
import { StreakService } from '../../domain/services/streak.service';

@Processor(SUMMARY_QUEUE, { concurrency: 2 })
export class SummaryConsumer extends WorkerHost {
  private readonly logger = new Logger(SummaryConsumer.name);

  constructor(
    private readonly summaryService: SessionSummaryService,
    private readonly profileService: TherapeuticProfileService,
    private readonly streakService: StreakService,
  ) {
    super();
  }

  async process(job: Job<SummaryJobData>): Promise<void> {
    const { conversationId, userId } = job.data;
    this.logger.log(`Processing summary job: conv=${conversationId.slice(0, 8)}`);

    // 1. Generate session summary + mood entry
    const result = await this.summaryService.generateSummary(conversationId, userId);
    if (!result) {
      this.logger.debug(`No summary generated for conv ${conversationId.slice(0, 8)}`);
      return;
    }

    // 2. Update therapeutic profile with new session insights
    await this.profileService.updateFromSession(userId, result);

    // 3. Update streak
    const milestone = await this.streakService.recordSession(userId);
    if (milestone) {
      this.logger.log(`Streak milestone ${milestone} for user ${userId.slice(0, 8)}`);
      // TODO: Phase 2 — enqueue milestone outreach message
    }
  }
}
