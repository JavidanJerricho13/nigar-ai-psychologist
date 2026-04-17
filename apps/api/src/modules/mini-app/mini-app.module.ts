import { Module } from '@nestjs/common';
import { MiniAppController } from './mini-app.controller';
import { MemoryModule } from '../memory/memory.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [MemoryModule, BillingModule],
  controllers: [MiniAppController],
})
export class MiniAppModule {}
