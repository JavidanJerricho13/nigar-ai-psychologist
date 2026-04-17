import { Controller, Get, Query, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MoodExtractionService } from '../memory/domain/services/mood-extraction.service';
import { SessionSummaryService } from '../memory/domain/services/session-summary.service';
import { TherapeuticProfileService } from '../memory/domain/services/therapeutic-profile.service';
import { StreakService } from '../memory/domain/services/streak.service';
import { SubscriptionService } from '../billing/domain/services/subscription.service';

/**
 * REST API for the Telegram Mini App (TWA).
 * All endpoints require telegramId query param for user identification.
 */
@Controller('mini-app')
export class MiniAppController {
  private readonly logger = new Logger(MiniAppController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moodService: MoodExtractionService,
    private readonly summaryService: SessionSummaryService,
    private readonly profileService: TherapeuticProfileService,
    private readonly streakService: StreakService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('mood')
  async getMood(@Query('telegramId') telegramId: string) {
    const userId = await this.resolveUserId(telegramId);
    const trend = await this.moodService.getMoodTrend(userId, 30);
    const history = await this.moodService.getMoodHistory(userId, 30);

    return {
      trend: {
        average: trend.average,
        direction: trend.direction,
        totalEntries: trend.totalEntries,
      },
      entries: history.map((e) => ({
        score: e.score,
        emotion: e.dominantEmotion,
        date: e.createdAt.toISOString().split('T')[0],
      })),
    };
  }

  @Get('journal')
  async getJournal(@Query('telegramId') telegramId: string) {
    const userId = await this.resolveUserId(telegramId);
    const summaries = await this.summaryService.getRecentSummaries(userId, 20);

    return {
      sessions: summaries.map((s) => ({
        summary: s.summary,
        moodScore: s.moodScore,
        emotion: s.dominantEmotion,
        topics: s.topicsDiscussed,
        date: s.createdAt.toISOString().split('T')[0],
      })),
    };
  }

  @Get('profile')
  async getProfile(@Query('telegramId') telegramId: string) {
    const userId = await this.resolveUserId(telegramId);
    const [profile, streak, sub] = await Promise.all([
      this.profileService.getOrCreate(userId),
      this.streakService.getStreak(userId),
      this.subscriptionService.getSubscription(userId),
    ]);

    return {
      therapeuticProfile: {
        concerns: profile.concerns,
        triggers: profile.triggers,
        strengths: profile.strengths,
        goals: profile.goals,
        copingMethods: profile.copingMethods,
        progressNotes: profile.progressNotes,
      },
      streak: {
        current: streak.currentStreak,
        longest: streak.longestStreak,
        totalSessions: streak.totalSessions,
      },
      subscription: {
        tier: sub.tier,
        planName: sub.plan.name,
        isActive: sub.isActive,
      },
    };
  }

  private async resolveUserId(telegramId: string): Promise<string> {
    if (!telegramId) {
      throw new HttpException('telegramId is required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user.id;
  }
}
