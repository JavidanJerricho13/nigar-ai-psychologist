import { GiftCreditsUseCase } from '../gift-credits.use-case';
import { InsufficientBalanceException } from '../../exceptions/billing.exceptions';

function createMockPrisma(overrides: any = {}) {
  const defaultCredit = { balance: 50, totalSpent: 0 };
  return {
    $transaction: jest.fn(async (fn: any) => fn({
      credit: {
        findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(defaultCredit),
        upsert: jest.fn().mockResolvedValue({}),
        update: overrides.update ?? jest.fn().mockImplementation(({ data }) => ({
          balance: Number(defaultCredit.balance) + (data.balance?.increment ?? -(data.balance?.decrement ?? 0)),
        })),
      },
      user: {
        findUnique: overrides.userFindUnique ?? jest.fn().mockResolvedValue({ id: 'receiver-1' }),
      },
      transaction: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    })),
  };
}

describe('GiftCreditsUseCase', () => {
  it('should reject zero amount', async () => {
    const prisma = createMockPrisma();
    const useCase = new GiftCreditsUseCase(prisma as any);

    await expect(
      useCase.execute({ senderUserId: 'a', receiverUserId: 'b', amount: 0 }),
    ).rejects.toThrow('müsbət');
  });

  it('should reject negative amount', async () => {
    const prisma = createMockPrisma();
    const useCase = new GiftCreditsUseCase(prisma as any);

    await expect(
      useCase.execute({ senderUserId: 'a', receiverUserId: 'b', amount: -5 }),
    ).rejects.toThrow('müsbət');
  });

  it('should reject self-gift', async () => {
    const prisma = createMockPrisma();
    const useCase = new GiftCreditsUseCase(prisma as any);

    await expect(
      useCase.execute({ senderUserId: 'same', receiverUserId: 'same', amount: 10 }),
    ).rejects.toThrow('Özünə');
  });

  it('should reject when sender has insufficient balance', async () => {
    const prisma = createMockPrisma({
      findUnique: jest.fn().mockResolvedValue({ balance: 5 }),
    });
    const useCase = new GiftCreditsUseCase(prisma as any);

    await expect(
      useCase.execute({ senderUserId: 'sender', receiverUserId: 'receiver', amount: 10 }),
    ).rejects.toThrow(InsufficientBalanceException);
  });

  it('should reject when receiver does not exist', async () => {
    const prisma = createMockPrisma({
      userFindUnique: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GiftCreditsUseCase(prisma as any);

    await expect(
      useCase.execute({ senderUserId: 'sender', receiverUserId: 'ghost', amount: 5 }),
    ).rejects.toThrow('tapılmadı');
  });

  it('should execute within a $transaction (atomicity)', async () => {
    const prisma = createMockPrisma();
    const useCase = new GiftCreditsUseCase(prisma as any);

    await useCase.execute({
      senderUserId: 'sender',
      receiverUserId: 'receiver',
      amount: 10,
    });

    // $transaction was called (atomic)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should return new balances on success', async () => {
    const prisma = createMockPrisma({
      update: jest.fn()
        .mockResolvedValueOnce({ balance: 40 })   // sender after -10
        .mockResolvedValueOnce({ balance: 10 }),   // receiver after +10
    });
    const useCase = new GiftCreditsUseCase(prisma as any);

    const result = await useCase.execute({
      senderUserId: 'sender',
      receiverUserId: 'receiver',
      amount: 10,
    });

    expect(result.senderNewBalance).toBe(40);
    expect(result.receiverNewBalance).toBe(10);
  });
});
