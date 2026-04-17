import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { AddCreditsUseCase } from '../../../billing/domain/use-cases/add-credits.use-case';

const INVITE_EXPIRY_DAYS = 7;
const SENDER_BONUS = 5;
const RECEIVER_BONUS = 3;
const MAX_ACTIVE_INVITES = 5;

/**
 * Shadow Referral — anonymous invite system.
 *
 * Allows users to share Nigar without exposing their identity.
 * "Gift a Session" — generates a short anonymous code that a new user
 * can redeem. The sender gets credit only after the receiver completes
 * onboarding. Neither side knows the other's identity.
 */
@Injectable()
export class ShadowReferralService {
  private readonly logger = new Logger(ShadowReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly addCredits: AddCreditsUseCase,
  ) {}

  /**
   * Create an anonymous invite link.
   * Returns a short code (8 chars) that can be shared.
   */
  async createInvite(userId: string): Promise<{
    code: string;
    deepLink: string;
    expiresAt: Date;
    activeInvites: number;
  }> {
    // Check active invite limit
    const activeCount = await this.prisma.anonymousInvite.count({
      where: {
        createdById: userId,
        claimedById: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeCount >= MAX_ACTIVE_INVITES) {
      throw new Error(`Maksimum ${MAX_ACTIVE_INVITES} aktiv dəvət ola bilər.`);
    }

    const code = this.generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    await this.prisma.anonymousInvite.create({
      data: {
        code,
        createdById: userId,
        expiresAt,
      },
    });

    this.logger.log(`Anonymous invite created: ${code} by user ${userId.slice(0, 8)}`);

    return {
      code,
      deepLink: `https://t.me/nigar_ai_bot?start=gift_${code}`,
      expiresAt,
      activeInvites: activeCount + 1,
    };
  }

  /**
   * Claim an anonymous invite when a new user opens the bot with gift_ deep link.
   * Returns true if claimed successfully, false if invalid/expired/already claimed.
   */
  async claimInvite(code: string, newUserId: string): Promise<boolean> {
    const invite = await this.prisma.anonymousInvite.findUnique({
      where: { code },
    });

    if (!invite) return false;
    if (invite.claimedById) return false; // Already claimed
    if (invite.expiresAt < new Date()) return false; // Expired
    if (invite.createdById === newUserId) return false; // Self-claim

    // Claim the invite
    await this.prisma.anonymousInvite.update({
      where: { id: invite.id },
      data: {
        claimedById: newUserId,
        claimedAt: new Date(),
      },
    });

    // Grant bonus to new user immediately
    await this.addCredits.execute({
      userId: newUserId,
      amount: RECEIVER_BONUS,
      type: 'referral_bonus',
      description: 'Anonim dəvət bonusu: pulsuz sessiya hədiyyə edildi',
    });

    // Grant bonus to sender (anonymous — they just see credits appear)
    await this.addCredits.execute({
      userId: invite.createdById,
      amount: SENDER_BONUS,
      type: 'referral_bonus',
      description: 'Anonim dəvət bonusu: kimsə dəvətini qəbul etdi',
    });

    await this.prisma.anonymousInvite.update({
      where: { id: invite.id },
      data: { bonusGranted: true },
    });

    this.logger.log(`Anonymous invite claimed: ${code} by user ${newUserId.slice(0, 8)}`);
    return true;
  }

  /**
   * Get invite stats for a user (how many created, claimed, active).
   */
  async getInviteStats(userId: string): Promise<{
    totalCreated: number;
    totalClaimed: number;
    activeInvites: number;
  }> {
    const [totalCreated, totalClaimed, activeInvites] = await Promise.all([
      this.prisma.anonymousInvite.count({ where: { createdById: userId } }),
      this.prisma.anonymousInvite.count({ where: { createdById: userId, claimedById: { not: null } } }),
      this.prisma.anonymousInvite.count({
        where: { createdById: userId, claimedById: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    return { totalCreated, totalClaimed, activeInvites };
  }

  /**
   * Generate a short, human-friendly invite code.
   * Format: 8 alphanumeric chars (no ambiguous chars like 0/O, 1/l/I).
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
