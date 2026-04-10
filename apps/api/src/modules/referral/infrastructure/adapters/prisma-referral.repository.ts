import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  ReferralRepositoryPort,
  ReferralRecord,
  ReferralStats,
} from '../../domain/ports/referral.repository.port';

@Injectable()
export class PrismaReferralRepository implements ReferralRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByReferredId(referredId: string): Promise<ReferralRecord | null> {
    const record = await this.prisma.referral.findFirst({
      where: { referredId },
    });
    return record
      ? {
          id: record.id,
          referrerId: record.referrerId,
          referredId: record.referredId,
          bonusCredited: record.bonusCredited,
          createdAt: record.createdAt,
        }
      : null;
  }

  async create(referrerId: string, referredId: string): Promise<ReferralRecord> {
    const record = await this.prisma.referral.create({
      data: { referrerId, referredId },
    });
    return {
      id: record.id,
      referrerId: record.referrerId,
      referredId: record.referredId,
      bonusCredited: record.bonusCredited,
      createdAt: record.createdAt,
    };
  }

  async markBonusCredited(id: string): Promise<void> {
    await this.prisma.referral.update({
      where: { id },
      data: { bonusCredited: true },
    });
  }

  async getStats(userId: string): Promise<ReferralStats> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    const [totalReferred, bonusCredited] = await Promise.all([
      this.prisma.referral.count({ where: { referrerId: userId } }),
      this.prisma.referral.count({
        where: { referrerId: userId, bonusCredited: true },
      }),
    ]);

    return {
      totalReferred,
      bonusCredited,
      referralCode: user?.referralCode ?? '',
    };
  }

  async getUserReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    return user?.referralCode ?? '';
  }
}
