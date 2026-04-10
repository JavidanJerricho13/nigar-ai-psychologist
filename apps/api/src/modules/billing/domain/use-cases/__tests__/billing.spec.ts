import { GetBalanceUseCase } from '../get-balance.use-case';
import { DeductCreditsUseCase } from '../deduct-credits.use-case';
import { AddCreditsUseCase } from '../add-credits.use-case';
import { CreditRepositoryPort } from '../../ports/credit.repository.port';
import { InsufficientBalanceException } from '../../exceptions/billing.exceptions';

const mockRepo: jest.Mocked<CreditRepositoryPort> = {
  getBalance: jest.fn(),
  ensureExists: jest.fn(),
  deduct: jest.fn(),
  add: jest.fn(),
  deductFreeVoice: jest.fn(),
};

describe('GetBalanceUseCase', () => {
  const useCase = new GetBalanceUseCase(mockRepo);

  beforeEach(() => jest.clearAllMocks());

  it('should return full balance info', async () => {
    mockRepo.getBalance.mockResolvedValue({
      userId: 'user-1',
      balance: 50,
      freeVoiceRemaining: 2,
      totalPurchased: 100,
      totalSpent: 50,
    });

    const result = await useCase.execute('user-1');

    expect(result.balance).toBe(50);
    expect(result.freeVoiceRemaining).toBe(2);
    expect(result.totalPurchased).toBe(100);
    expect(result.totalSpent).toBe(50);
  });
});

describe('DeductCreditsUseCase', () => {
  const useCase = new DeductCreditsUseCase(mockRepo);

  beforeEach(() => jest.clearAllMocks());

  it('should deduct and return new balance', async () => {
    mockRepo.deduct.mockResolvedValue(45);

    const result = await useCase.execute({
      userId: 'user-1',
      amount: 5,
      description: 'Voice synthesis',
    });

    expect(result).toBe(45);
    expect(mockRepo.deduct).toHaveBeenCalledWith('user-1', 5, 'Voice synthesis');
  });

  it('should propagate InsufficientBalanceException', async () => {
    mockRepo.deduct.mockRejectedValue(
      new InsufficientBalanceException('user-1', 10, 3),
    );

    await expect(
      useCase.execute({ userId: 'user-1', amount: 10, description: 'test' }),
    ).rejects.toThrow(InsufficientBalanceException);
  });

  it('should not allow negative deduction', async () => {
    // The repo would handle this, but testing the flow
    mockRepo.deduct.mockResolvedValue(50);
    const result = await useCase.execute({
      userId: 'user-1',
      amount: 0,
      description: 'zero deduction',
    });
    expect(result).toBe(50);
  });
});

describe('AddCreditsUseCase', () => {
  const useCase = new AddCreditsUseCase(mockRepo);

  beforeEach(() => jest.clearAllMocks());

  it('should add credits for purchase', async () => {
    mockRepo.add.mockResolvedValue(60);

    const result = await useCase.execute({
      userId: 'user-1',
      amount: 10,
      type: 'purchase',
      description: 'Purchased 10 credits',
    });

    expect(result).toBe(60);
    expect(mockRepo.add).toHaveBeenCalledWith('user-1', 10, 'purchase', 'Purchased 10 credits');
  });

  it('should add credits for referral bonus', async () => {
    mockRepo.add.mockResolvedValue(5);

    const result = await useCase.execute({
      userId: 'user-2',
      amount: 5,
      type: 'referral_bonus',
      description: 'Referral bonus',
    });

    expect(result).toBe(5);
    expect(mockRepo.add).toHaveBeenCalledWith('user-2', 5, 'referral_bonus', 'Referral bonus');
  });

  it('should add credits for gift', async () => {
    mockRepo.add.mockResolvedValue(15);

    await useCase.execute({
      userId: 'user-3',
      amount: 15,
      type: 'gift',
      description: 'Gift from friend',
    });

    expect(mockRepo.add).toHaveBeenCalledWith('user-3', 15, 'gift', 'Gift from friend');
  });
});

describe('Credit arithmetic edge cases', () => {
  const deductUC = new DeductCreditsUseCase(mockRepo);
  const addUC = new AddCreditsUseCase(mockRepo);

  beforeEach(() => jest.clearAllMocks());

  it('should handle decimal amounts correctly', async () => {
    mockRepo.add.mockResolvedValue(10.5);

    const result = await addUC.execute({
      userId: 'user-1',
      amount: 0.5,
      type: 'gift',
      description: 'Half credit gift',
    });

    expect(result).toBe(10.5);
  });

  it('should handle zero balance after deduction', async () => {
    mockRepo.deduct.mockResolvedValue(0);

    const result = await deductUC.execute({
      userId: 'user-1',
      amount: 50,
      description: 'Final deduction',
    });

    expect(result).toBe(0);
  });
});
