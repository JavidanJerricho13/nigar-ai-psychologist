import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { InsufficientBalanceException } from '../exceptions/billing.exceptions';

export interface GiftCreditsInput {
  senderUserId: string;
  receiverUserId: string;
  amount: number;
}

export interface GiftCreditsOutput {
  senderNewBalance: number;
  receiverNewBalance: number;
}

@Injectable()
export class GiftCreditsUseCase {
  private readonly logger = new Logger(GiftCreditsUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: GiftCreditsInput): Promise<GiftCreditsOutput> {
    if (input.amount <= 0) {
      throw new Error('Hədiyyə miqdarı müsbət olmalıdır');
    }

    if (input.senderUserId === input.receiverUserId) {
      throw new Error('Özünə hədiyyə göndərə bilməzsən');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Check sender balance
      const senderCredit = await tx.credit.findUnique({
        where: { userId: input.senderUserId },
      });

      const senderBalance = senderCredit ? Number(senderCredit.balance) : 0;
      if (senderBalance < input.amount) {
        throw new InsufficientBalanceException(
          input.senderUserId,
          input.amount,
          senderBalance,
        );
      }

      // 2. Verify receiver exists
      const receiver = await tx.user.findUnique({
        where: { id: input.receiverUserId },
        select: { id: true },
      });
      if (!receiver) {
        throw new Error('Alıcı tapılmadı');
      }

      // 3. Ensure receiver has credit record
      await tx.credit.upsert({
        where: { userId: input.receiverUserId },
        create: { userId: input.receiverUserId },
        update: {},
      });

      // 4. Atomic: deduct from sender
      const updatedSender = await tx.credit.update({
        where: { userId: input.senderUserId },
        data: {
          balance: { decrement: input.amount },
          totalSpent: { increment: input.amount },
        },
      });

      // 5. Atomic: add to receiver
      const updatedReceiver = await tx.credit.update({
        where: { userId: input.receiverUserId },
        data: { balance: { increment: input.amount } },
      });

      // 6. Transaction records for both
      await tx.transaction.createMany({
        data: [
          {
            userId: input.senderUserId,
            type: 'gift',
            amount: -input.amount,
            description: `Hədiyyə göndərildi: ${input.amount} kredit`,
          },
          {
            userId: input.receiverUserId,
            type: 'gift',
            amount: input.amount,
            description: `Hədiyyə alındı: ${input.amount} kredit`,
          },
        ],
      });

      this.logger.log(
        `🎁 Gift: ${input.senderUserId.slice(0, 8)} → ${input.receiverUserId.slice(0, 8)}: ${input.amount} credits`,
      );

      return {
        senderNewBalance: Number(updatedSender.balance),
        receiverNewBalance: Number(updatedReceiver.balance),
      };
    });
  }
}
