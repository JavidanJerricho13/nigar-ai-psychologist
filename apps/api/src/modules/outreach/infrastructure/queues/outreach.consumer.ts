import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OUTREACH_QUEUE, OutreachJobData } from './outreach.types';
import { OutreachThrottleService } from '../../domain/services/outreach-throttle.service';
import { TelegramOutreachAdapter } from '../adapters/telegram-outreach.adapter';
import { SessionSummaryService } from '../../../memory/domain/services/session-summary.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Processor(OUTREACH_QUEUE, { concurrency: 2 })
export class OutreachConsumer extends WorkerHost {
  private readonly logger = new Logger(OutreachConsumer.name);

  constructor(
    private readonly throttle: OutreachThrottleService,
    private readonly telegram: TelegramOutreachAdapter,
    private readonly summaryService: SessionSummaryService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<OutreachJobData>): Promise<void> {
    const { userId, type } = job.data;

    // 1. Check if user can receive messages
    const canSend = await this.throttle.canSend(userId);
    if (!canSend) {
      this.logger.debug(`Outreach throttled/muted for user ${userId.slice(0, 8)} — skipping ${type}`);
      return;
    }

    // 2. Resolve user's Telegram ID
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, profile: { select: { name: true } } },
    });

    if (!user?.telegramId) {
      this.logger.warn(`No telegramId for user ${userId.slice(0, 8)} — skipping outreach`);
      return;
    }

    const name = user.profile?.name ?? 'Dostum';
    let message: string;

    switch (type) {
      case 'check_in':
        message = await this.buildCheckInMessage(userId, name);
        break;
      case 'crisis_follow_up':
        message = this.buildCrisisFollowUp(name);
        break;
      case 'milestone':
        message = this.buildMilestoneMessage(name, job.data.milestoneDay ?? 0);
        break;
      default:
        this.logger.warn(`Unknown outreach type: ${type}`);
        return;
    }

    // 3. Send message
    const sent = await this.telegram.sendToUser(user.telegramId, message);
    if (sent) {
      await this.throttle.recordSent(userId, type, message);
      this.logger.log(`Outreach sent: ${type} to user ${userId.slice(0, 8)}`);
    }
  }

  private async buildCheckInMessage(userId: string, name: string): Promise<string> {
    // Try to reference the last session's topics
    const summaries = await this.summaryService.getRecentSummaries(userId, 1);
    if (summaries.length > 0 && summaries[0].topicsDiscussed.length > 0) {
      const topic = summaries[0].topicsDiscussed[0];
      return `Salam, ${name} 💛\n\nDünən <b>${topic}</b> haqqında danışdıq. Bu gün necəsən?\n\nMənə yaz istədiyin zaman — buradayam.`;
    }

    return `Salam, ${name} 💛\n\nBir neçə gündür görüşmürük. Hər şey qaydasındadır?\n\nMənə yaz istədiyin zaman — buradayam.`;
  }

  private buildCrisisFollowUp(name: string): string {
    return (
      `Salam, ${name} 💛\n\n` +
      `Dünən bir az çətin vaxt keçirirdin. Bu gün necəsən?\n\n` +
      `Danışmaq istəyirsənsə, buradayam.\n\n` +
      `🆘 Böhran xətti: 860-510-510`
    );
  }

  private buildMilestoneMessage(name: string, days: number): string {
    const emojis: Record<number, string> = {
      3: '🔥', 7: '🏅', 14: '⭐', 30: '🏆', 60: '💎', 100: '👑',
    };
    const emoji = emojis[days] ?? '🎉';

    return (
      `${emoji} Təbrik, ${name}!\n\n` +
      `${days} gün ardıcıl Nigar ilə söhbət edirsən!\n` +
      `Bu, özünə qulluğun ən gözəl formasıdır 💛\n\n` +
      `/progress — İrəliləyişinə bax`
    );
  }
}
