import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SessionService } from '../../../../shared/redis/session.service';

const THROTTLE_HOURS = 48;

@Injectable()
export class OutreachThrottleService {
  private readonly logger = new Logger(OutreachThrottleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
  ) {}

  /**
   * Check if a user can receive an outreach message.
   * Returns true if allowed (no message sent in the last 48 hours and not muted).
   */
  async canSend(userId: string): Promise<boolean> {
    // 1. Check mute settings
    const settings = await this.prisma.userOutreachSettings.findUnique({
      where: { userId },
    });

    if (settings?.muted) {
      // Check if mute has expired
      if (settings.mutedUntil && settings.mutedUntil < new Date()) {
        // Mute expired — unmute
        await this.prisma.userOutreachSettings.update({
          where: { userId },
          data: { muted: false, mutedUntil: null },
        });
      } else {
        return false;
      }
    }

    // 2. Check Redis fast path (48h TTL key)
    const lastSentKey = `outreach:last:${userId}`;
    const exists = await this.session.exists(lastSentKey);
    if (exists) return false;

    // 3. Fallback: check DB
    const since = new Date();
    since.setHours(since.getHours() - THROTTLE_HOURS);

    const recentLog = await this.prisma.outreachLog.findFirst({
      where: {
        userId,
        sentAt: { gte: since },
      },
    });

    return !recentLog;
  }

  /**
   * Record that an outreach message was sent.
   * Sets a Redis key with 48h TTL for fast throttle checks.
   */
  async recordSent(userId: string, type: string, message: string): Promise<void> {
    // Log to DB
    await this.prisma.outreachLog.create({
      data: { userId, type, message },
    });

    // Set Redis fast throttle key (48h TTL)
    await this.session.set(
      `outreach:last:${userId}`,
      Date.now(),
      THROTTLE_HOURS * 60 * 60,
    );
  }
}
