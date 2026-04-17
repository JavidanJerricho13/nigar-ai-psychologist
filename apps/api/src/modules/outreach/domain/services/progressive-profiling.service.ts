import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TelegramOutreachAdapter } from '../../infrastructure/adapters/telegram-outreach.adapter';
import { OutreachThrottleService } from './outreach-throttle.service';

/**
 * Progressive profiling: collects gender, age, and voice format
 * over days 2-7 after the empathy-first onboarding completes.
 *
 * Triggered by the summary consumer after sessions — checks if
 * the user's profile is missing key fields and sends a gentle prompt.
 */
@Injectable()
export class ProgressiveProfilingService {
  private readonly logger = new Logger(ProgressiveProfilingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramOutreachAdapter,
    private readonly throttle: OutreachThrottleService,
  ) {}

  /**
   * Check if the user needs progressive profiling prompts.
   * Called after session summary generation.
   * Sends at most one prompt per check (respects throttle).
   */
  async checkAndPrompt(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        telegramId: true,
        profile: { select: { name: true, gender: true, age: true, bio: true } },
        settings: { select: { responseFormat: true } },
      },
    });

    if (!user?.telegramId || !user.profile) return;

    // Check throttle
    const canSend = await this.throttle.canSend(userId);
    if (!canSend) return;

    const profile = user.profile;
    const name = profile.name ?? 'Dostum';

    // Priority order: gender → age → voice format → bio
    if (!profile.gender) {
      await this.sendGenderPrompt(userId, user.telegramId, name);
    } else if (!profile.age) {
      await this.sendAgePrompt(userId, user.telegramId, name);
    } else if (user.settings?.responseFormat === 'text') {
      // Only suggest voice if they haven't tried it
      await this.sendVoicePrompt(userId, user.telegramId, name);
    } else if (!profile.bio) {
      await this.sendBioPrompt(userId, user.telegramId, name);
    }
  }

  private async sendGenderPrompt(userId: string, telegramId: string, name: string): Promise<void> {
    const text =
      `${name}, yeri gəlmişkən — sənə daha yaxşı kömək etmək üçün bir şey soruşa bilərəm?\n\n` +
      `Cinsiyyətini bilsəm, söhbətimizi daha fərdi edə bilərəm.\n\n` +
      `Cavab vermək istəmirsənsə, sadəcə məni ignore elə 😊`;

    const sent = await this.telegram.sendToUser(telegramId, text);
    if (sent) {
      await this.throttle.recordSent(userId, 'profiling_gender', text);
      this.logger.log(`Progressive profiling: gender prompt sent to ${userId.slice(0, 8)}`);
    }
  }

  private async sendAgePrompt(userId: string, telegramId: string, name: string): Promise<void> {
    const text =
      `${name}, neçə yaşın var? 🎂\n\n` +
      `Yaşına uyğun məsləhətlər verə bilərəm.\n` +
      `Sadəcə rəqəm yaz (məs: 25)`;

    const sent = await this.telegram.sendToUser(telegramId, text);
    if (sent) {
      await this.throttle.recordSent(userId, 'profiling_age', text);
      this.logger.log(`Progressive profiling: age prompt sent to ${userId.slice(0, 8)}`);
    }
  }

  private async sendVoicePrompt(userId: string, telegramId: string, name: string): Promise<void> {
    const text =
      `${name}, bilirsən ki, mən səslə də cavab verə bilərəm? 🎙\n\n` +
      `İlk 3 səsli cavab pulsuzdur!\n\n` +
      `/format — cavab formatını dəyiş`;

    const sent = await this.telegram.sendToUser(telegramId, text);
    if (sent) {
      await this.throttle.recordSent(userId, 'profiling_voice', text);
      this.logger.log(`Progressive profiling: voice prompt sent to ${userId.slice(0, 8)}`);
    }
  }

  private async sendBioPrompt(userId: string, telegramId: string, name: string): Promise<void> {
    const text =
      `${name}, özün haqqında bir az danışmaq istəyirsən? 📝\n\n` +
      `Nə narahat edir, nə haqqında danışmaq istəyirsən — bunu bilsəm, daha yaxşı kömək edə bilərəm.\n\n` +
      `/info — profili redaktə et`;

    const sent = await this.telegram.sendToUser(telegramId, text);
    if (sent) {
      await this.throttle.recordSent(userId, 'profiling_bio', text);
      this.logger.log(`Progressive profiling: bio prompt sent to ${userId.slice(0, 8)}`);
    }
  }
}
