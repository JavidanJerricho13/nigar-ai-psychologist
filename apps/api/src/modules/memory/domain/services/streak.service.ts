import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  lastSessionDate: Date | null;
}

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a session and update streak counters.
   * Returns the milestone number if a milestone was reached (3, 7, 14, 30, etc.), else null.
   */
  async recordSession(userId: string): Promise<number | null> {
    const existing = await this.prisma.userStreak.findUnique({
      where: { userId },
    });

    const today = this.toDateOnly(new Date());

    if (!existing) {
      await this.prisma.userStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastSessionDate: today,
          totalSessions: 1,
        },
      });
      return null;
    }

    // Already recorded today — just skip
    if (existing.lastSessionDate && this.isSameDay(existing.lastSessionDate, today)) {
      return null;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isConsecutive = existing.lastSessionDate
      ? this.isSameDay(existing.lastSessionDate, yesterday)
      : false;

    const newStreak = isConsecutive ? existing.currentStreak + 1 : 1;
    const newLongest = Math.max(existing.longestStreak, newStreak);
    const newTotal = existing.totalSessions + 1;

    await this.prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastSessionDate: today,
        totalSessions: newTotal,
      },
    });

    // Check milestones
    const milestones = [3, 7, 14, 30, 60, 100];
    if (milestones.includes(newStreak)) {
      this.logger.log(`Milestone reached: user=${userId.slice(0, 8)} streak=${newStreak}`);
      return newStreak;
    }

    return null;
  }

  async getStreak(userId: string): Promise<StreakData> {
    const streak = await this.prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      return { currentStreak: 0, longestStreak: 0, totalSessions: 0, lastSessionDate: null };
    }

    // Check if streak is still active (last session was today or yesterday)
    const today = this.toDateOnly(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isActive = streak.lastSessionDate
      ? (this.isSameDay(streak.lastSessionDate, today) || this.isSameDay(streak.lastSessionDate, yesterday))
      : false;

    return {
      currentStreak: isActive ? streak.currentStreak : 0,
      longestStreak: streak.longestStreak,
      totalSessions: streak.totalSessions,
      lastSessionDate: streak.lastSessionDate,
    };
  }

  private toDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
