import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface TransactionRecord {
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

@Injectable()
export class GetTransactionHistoryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, limit = 10): Promise<TransactionRecord[]> {
    const records = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        type: true,
        amount: true,
        description: true,
        createdAt: true,
      },
    });

    return records.map((r) => ({
      type: r.type,
      amount: Number(r.amount),
      description: r.description ?? '',
      createdAt: r.createdAt,
    }));
  }
}
