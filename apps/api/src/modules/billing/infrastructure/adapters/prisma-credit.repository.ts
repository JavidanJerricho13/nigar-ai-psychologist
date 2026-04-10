import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CreditRepositoryPort,
  CreditBalance,
} from '../../domain/ports/credit.repository.port';
import { InsufficientBalanceException } from '../../domain/exceptions/billing.exceptions';

@Injectable()
export class PrismaCreditRepository implements CreditRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string): Promise<CreditBalance> {
    await this.ensureExists(userId);
    const credit = await this.prisma.credit.findUnique({
      where: { userId },
    });
    return {
      userId,
      balance: credit ? Number(credit.balance) : 0,
      freeVoiceRemaining: credit?.freeVoiceRemaining ?? 3,
      totalPurchased: credit ? Number(credit.totalPurchased) : 0,
      totalSpent: credit ? Number(credit.totalSpent) : 0,
    };
  }

  async ensureExists(userId: string): Promise<void> {
    await this.prisma.credit.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async deduct(
    userId: string,
    amount: number,
    description: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const credit = await tx.credit.findUnique({ where: { userId } });
      const currentBalance = credit ? Number(credit.balance) : 0;

      if (currentBalance < amount) {
        throw new InsufficientBalanceException(userId, amount, currentBalance);
      }

      const updated = await tx.credit.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
          totalSpent: { increment: amount },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'spend',
          amount: -amount,
          description,
        },
      });

      return Number(updated.balance);
    });
  }

  async add(
    userId: string,
    amount: number,
    type: string,
    description: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureExistsInTx(tx, userId);

      const updated = await tx.credit.update({
        where: { userId },
        data: {
          balance: { increment: amount },
          totalPurchased: type === 'purchase' ? { increment: amount } : undefined,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: type as any,
          amount,
          description,
        },
      });

      return Number(updated.balance);
    });
  }

  async deductFreeVoice(userId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureExistsInTx(tx, userId);

      const credit = await tx.credit.findUnique({ where: { userId } });
      const remaining = credit?.freeVoiceRemaining ?? 3;

      if (remaining <= 0) return -1;

      const updated = await tx.credit.update({
        where: { userId },
        data: { freeVoiceRemaining: { decrement: 1 } },
      });

      return updated.freeVoiceRemaining;
    });
  }

  private async ensureExistsInTx(tx: any, userId: string): Promise<void> {
    const exists = await tx.credit.findUnique({ where: { userId } });
    if (!exists) {
      await tx.credit.create({ data: { userId } });
    }
  }
}
