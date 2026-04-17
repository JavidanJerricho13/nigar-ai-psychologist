import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MemoryModule } from '../memory/memory.module';
import { TelegramOutreachAdapter } from './infrastructure/adapters/telegram-outreach.adapter';
import { OutreachThrottleService } from './domain/services/outreach-throttle.service';
import { OutreachProducer } from './infrastructure/queues/outreach.producer';
import { OutreachConsumer } from './infrastructure/queues/outreach.consumer';
import { OUTREACH_QUEUE } from './infrastructure/queues/outreach.types';

@Module({
  imports: [
    MemoryModule,
    BullModule.registerQueue({ name: OUTREACH_QUEUE }),
  ],
  providers: [
    TelegramOutreachAdapter,
    OutreachThrottleService,
    OutreachProducer,
    OutreachConsumer,
  ],
  exports: [
    OutreachProducer,
    OutreachThrottleService,
    TelegramOutreachAdapter,
  ],
})
export class OutreachModule {}
