import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramAdminNotifierService } from '../services/telegram-admin-notifier.service';

/**
 * 6.1 — Daily Crisis Event Summary.
 * Runs every day at 9 AM (server time, see TZ env). Pulls all unhandled crisis events
 * plus events created in the last 24h, and posts a summary to the configured admin chat.
 */
@Injectable()
export class CrisisSummaryCron {
  private readonly logger = new Logger(CrisisSummaryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TelegramAdminNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'crisis-summary-daily' })
  async run(): Promise<void> {
    if (!this.notifier.isEnabled) {
      this.logger.debug('Skipping crisis summary cron — notifier not configured');
      return;
    }

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [unhandled, last24h, samples] = await Promise.all([
        this.prisma.crisisEvent.count({ where: { handled: false } }),
        this.prisma.crisisEvent.count({ where: { createdAt: { gte: since } } }),
        this.prisma.crisisEvent.findMany({
          where: { handled: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            severity: true,
            createdAt: true,
            userId: true,
            keywords: true,
          },
        }),
      ]);

      const ok = await this.notifier.sendCrisisSummary({ unhandled, last24h, samples });
      this.logger.log(
        `Crisis summary sent (ok=${ok}): unhandled=${unhandled}, last24h=${last24h}`,
      );
    } catch (err) {
      this.logger.error(`Crisis summary cron failed: ${(err as Error).message}`);
    }
  }

  /** Public method to allow manual trigger from CLI / tests. */
  async runManually(): Promise<void> {
    return this.run();
  }
}
