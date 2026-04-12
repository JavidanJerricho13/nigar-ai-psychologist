import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { TelegramAdminNotifierService } from './services/telegram-admin-notifier.service';
import { CrisisSummaryCron } from './cron/crisis-summary.cron';
import { AlertsDebugController } from './controllers/alerts-debug.controller';

/**
 * Alerting & automation module (Phase 6 of BACKOFFICE_ROADMAP).
 *
 * Provides a TelegramAdminNotifier service for sending operational alerts to a
 * configured admin chat, plus scheduled cron jobs for daily safety summaries.
 *
 * The notifier is exported so other modules (e.g. Billing for Stripe webhook
 * failures) can inject it without depending on the cron internals.
 */
@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [AlertsDebugController],
  providers: [TelegramAdminNotifierService, CrisisSummaryCron],
  exports: [TelegramAdminNotifierService],
})
export class AlertingModule {}
