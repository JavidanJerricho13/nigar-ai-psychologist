import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { MemoryModule } from '../memory/memory.module';
import { TelegramOutreachAdapter } from './infrastructure/adapters/telegram-outreach.adapter';
import { OutreachThrottleService } from './domain/services/outreach-throttle.service';
import { ProgressiveProfilingService } from './domain/services/progressive-profiling.service';
import { OutreachProducer } from './infrastructure/queues/outreach.producer';
import { OutreachConsumer } from './infrastructure/queues/outreach.consumer';
import { OUTREACH_QUEUE } from './infrastructure/queues/outreach.types';
import { WeeklyMoodSummaryCron } from './domain/cron/weekly-mood-summary.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MemoryModule,
    BullModule.registerQueue({ name: OUTREACH_QUEUE }),
  ],
  providers: [
    TelegramOutreachAdapter,
    OutreachThrottleService,
    ProgressiveProfilingService,
    WeeklyMoodSummaryCron,
    OutreachProducer,
    OutreachConsumer,
  ],
  exports: [
    OutreachProducer,
    OutreachThrottleService,
    TelegramOutreachAdapter,
    ProgressiveProfilingService,
  ],
})
export class OutreachModule {}
