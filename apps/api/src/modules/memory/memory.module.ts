import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChatModule } from '../chat/chat.module';
import { SessionSummaryService } from './domain/services/session-summary.service';
import { MoodExtractionService } from './domain/services/mood-extraction.service';
import { TherapeuticProfileService } from './domain/services/therapeutic-profile.service';
import { StreakService } from './domain/services/streak.service';
import { SummaryProducer } from './infrastructure/queues/summary.producer';
import { SummaryConsumer } from './infrastructure/queues/summary.consumer';
import { SUMMARY_QUEUE } from './infrastructure/queues/summary.types';

@Module({
  imports: [
    ChatModule,
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
  ],
  providers: [
    // Domain services
    SessionSummaryService,
    MoodExtractionService,
    TherapeuticProfileService,
    StreakService,

    // Queue infrastructure
    SummaryProducer,
    SummaryConsumer,
  ],
  exports: [
    SessionSummaryService,
    MoodExtractionService,
    TherapeuticProfileService,
    StreakService,
    SummaryProducer,
  ],
})
export class MemoryModule {}
