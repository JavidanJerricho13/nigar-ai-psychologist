import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { MoodExtractionService } from '../../../memory/domain/services/mood-extraction.service';
import { TelegramOutreachAdapter } from '../../infrastructure/adapters/telegram-outreach.adapter';
import { OutreachThrottleService } from '../services/outreach-throttle.service';

/**
 * Weekly mood summary push — Monday 10 AM.
 * Sends each active user a text-based mood chart of their past 7 days.
 */
@Injectable()
export class WeeklyMoodSummaryCron {
  private readonly logger = new Logger(WeeklyMoodSummaryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moodService: MoodExtractionService,
    private readonly telegram: TelegramOutreachAdapter,
    private readonly throttle: OutreachThrottleService,
  ) {}

  @Cron('0 10 * * 1') // Monday 10:00 AM
  async handleWeeklyMoodSummary(): Promise<void> {
    this.logger.log('Weekly mood summary cron started');

    // Find users who have mood entries in the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const usersWithMood = await this.prisma.moodEntry.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since } },
      _count: { userId: true },
      having: { userId: { _count: { gte: 2 } } }, // At least 2 entries
    });

    let sent = 0;

    for (const entry of usersWithMood) {
      try {
        const canSend = await this.throttle.canSend(entry.userId);
        if (!canSend) continue;

        const user = await this.prisma.user.findUnique({
          where: { id: entry.userId },
          select: { telegramId: true, profile: { select: { name: true } } },
        });

        if (!user?.telegramId) continue;

        const trend = await this.moodService.getMoodTrend(entry.userId, 7);
        if (trend.totalEntries < 2) continue;

        const chart = this.moodService.buildMoodChart(
          trend.recentScores.map((s) => ({
            score: s.score,
            dominantEmotion: s.emotion,
            createdAt: s.date,
          })),
        );

        const name = user.profile?.name ?? 'Dostum';
        const directionLabel = trend.direction === 'improving' ? 'yaxşılaşır 📈' : trend.direction === 'declining' ? 'diqqət tələb edir 📉' : 'sabitdir ➡️';

        const message =
          `Salam, ${name}! Həftəlik əhval hesabatın hazırdır 📊\n\n` +
          `${chart}\n\n` +
          `Orta əhval: ${trend.average}/10 — ${directionLabel}\n\n` +
          `Yeni həftəyə uğurla başla 💛`;

        const ok = await this.telegram.sendToUser(user.telegramId, message);
        if (ok) {
          await this.throttle.recordSent(entry.userId, 'weekly_mood', message);
          sent++;
        }
      } catch (err) {
        this.logger.warn(`Weekly mood failed for user ${entry.userId.slice(0, 8)}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Weekly mood summary: sent to ${sent}/${usersWithMood.length} users`);
  }
}
