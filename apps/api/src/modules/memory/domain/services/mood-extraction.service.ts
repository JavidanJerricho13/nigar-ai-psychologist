import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface MoodTrend {
  average: number;
  direction: 'improving' | 'declining' | 'stable';
  recentScores: Array<{ score: number; emotion: string; date: Date }>;
  totalEntries: number;
}

@Injectable()
export class MoodExtractionService {
  private readonly logger = new Logger(MoodExtractionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get mood history for a user over the last N days.
   */
  async getMoodHistory(
    userId: string,
    days: number = 14,
  ): Promise<Array<{ score: number; dominantEmotion: string; createdAt: Date }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.moodEntry.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        score: true,
        dominantEmotion: true,
        createdAt: true,
      },
    });
  }

  /**
   * Calculate mood trend for a user.
   */
  async getMoodTrend(userId: string, days: number = 14): Promise<MoodTrend> {
    const entries = await this.getMoodHistory(userId, days);

    if (entries.length === 0) {
      return {
        average: 0,
        direction: 'stable',
        recentScores: [],
        totalEntries: 0,
      };
    }

    const scores = entries.map((e) => e.score);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Determine direction: compare first half vs second half average
    let direction: MoodTrend['direction'] = 'stable';
    if (scores.length >= 4) {
      const mid = Math.floor(scores.length / 2);
      const firstHalf = scores.slice(0, mid);
      const secondHalf = scores.slice(mid);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const diff = secondAvg - firstAvg;

      if (diff > 0.5) direction = 'improving';
      else if (diff < -0.5) direction = 'declining';
    }

    return {
      average: Math.round(average * 10) / 10,
      direction,
      recentScores: entries.map((e) => ({
        score: e.score,
        emotion: e.dominantEmotion,
        date: e.createdAt,
      })),
      totalEntries: entries.length,
    };
  }

  /**
   * Build a text-based mood chart for Telegram display.
   */
  buildMoodChart(
    entries: Array<{ score: number; dominantEmotion: string; createdAt: Date }>,
  ): string {
    if (entries.length === 0) {
      return 'Hələ əhval məlumatı yoxdur.';
    }

    const moodEmoji: Record<number, string> = {
      1: '😰', 2: '😢', 3: '😔', 4: '😟',
      5: '😐', 6: '🙂', 7: '😊', 8: '😄',
      9: '😁', 10: '🤩',
    };

    const lines = entries.map((e) => {
      const date = e.createdAt.toLocaleDateString('az-AZ', {
        day: 'numeric',
        month: 'short',
      });
      const filled = '█'.repeat(e.score);
      const empty = '░'.repeat(10 - e.score);
      const emoji = moodEmoji[e.score] ?? '😐';
      return `${date.padEnd(8)} ${filled}${empty} ${e.score}/10 ${emoji}`;
    });

    return lines.join('\n');
  }
}
