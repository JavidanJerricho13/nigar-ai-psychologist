import { ApplyReferralUseCase } from '../apply-referral.use-case';
import { GetReferralInfoUseCase } from '../get-referral-info.use-case';
import { ReferralRepositoryPort } from '../../ports/referral.repository.port';
import { AddCreditsUseCase } from '../../../../billing/domain/use-cases/add-credits.use-case';
import {
  SelfReferralException,
  AlreadyReferredException,
  ReferrerNotFoundException,
} from '../../exceptions/referral.exceptions';

const mockReferralRepo: jest.Mocked<ReferralRepositoryPort> = {
  findByReferredId: jest.fn(),
  create: jest.fn(),
  markBonusCredited: jest.fn(),
  getStats: jest.fn(),
  getUserReferralCode: jest.fn(),
};

const mockAddCredits: jest.Mocked<Partial<AddCreditsUseCase>> = {
  execute: jest.fn().mockResolvedValue(5),
};

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
  },
};

describe('ApplyReferralUseCase', () => {
  let useCase: ApplyReferralUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'referrer-1' });
    mockReferralRepo.findByReferredId.mockResolvedValue(null);
    mockReferralRepo.create.mockResolvedValue({
      id: 'ref-1',
      referrerId: 'referrer-1',
      referredId: 'referred-1',
      bonusCredited: false,
      createdAt: new Date(),
    });

    useCase = new ApplyReferralUseCase(
      mockReferralRepo,
      mockAddCredits as any,
      mockPrisma,
    );
  });

  it('should grant 5 credits to referrer and 3 to referred', async () => {
    const result = await useCase.execute({
      referredUserId: 'referred-1',
      referralCode: 'REF123',
    });

    expect(result.success).toBe(true);
    expect(result.referrerBonus).toBe(5);
    expect(result.referredBonus).toBe(3);

    // Check addCredits was called for referrer (5)
    expect(mockAddCredits.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'referrer-1', amount: 5, type: 'referral_bonus' }),
    );
    // Check addCredits was called for referred (3)
    expect(mockAddCredits.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'referred-1', amount: 3, type: 'referral_bonus' }),
    );
  });

  it('should create referral record', async () => {
    await useCase.execute({
      referredUserId: 'referred-1',
      referralCode: 'REF123',
    });

    expect(mockReferralRepo.create).toHaveBeenCalledWith('referrer-1', 'referred-1');
  });

  it('should mark bonus as credited', async () => {
    await useCase.execute({
      referredUserId: 'referred-1',
      referralCode: 'REF123',
    });

    expect(mockReferralRepo.markBonusCredited).toHaveBeenCalledWith('ref-1');
  });

  it('should throw SelfReferralException', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'same-user' });

    await expect(
      useCase.execute({ referredUserId: 'same-user', referralCode: 'SELF' }),
    ).rejects.toThrow(SelfReferralException);
  });

  it('should throw AlreadyReferredException', async () => {
    mockReferralRepo.findByReferredId.mockResolvedValue({
      id: 'existing',
      referrerId: 'other',
      referredId: 'referred-1',
      bonusCredited: true,
      createdAt: new Date(),
    });

    await expect(
      useCase.execute({ referredUserId: 'referred-1', referralCode: 'REF123' }),
    ).rejects.toThrow(AlreadyReferredException);
  });

  it('should throw ReferrerNotFoundException for invalid code', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute({ referredUserId: 'referred-1', referralCode: 'INVALID' }),
    ).rejects.toThrow(ReferrerNotFoundException);
  });

  it('should not grant bonus on self-referral attempt', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'same' });

    await expect(
      useCase.execute({ referredUserId: 'same', referralCode: 'CODE' }),
    ).rejects.toThrow();

    expect(mockAddCredits.execute).not.toHaveBeenCalled();
  });
});

describe('GetReferralInfoUseCase', () => {
  const useCase = new GetReferralInfoUseCase(mockReferralRepo);

  beforeEach(() => jest.clearAllMocks());

  it('should return referral stats', async () => {
    mockReferralRepo.getStats.mockResolvedValue({
      totalReferred: 10,
      bonusCredited: 8,
      referralCode: 'MY_CODE',
    });

    const result = await useCase.execute('user-1');

    expect(result.totalReferred).toBe(10);
    expect(result.bonusCredited).toBe(8);
    expect(result.referralCode).toBe('MY_CODE');
  });

  it('should return zeros for new user', async () => {
    mockReferralRepo.getStats.mockResolvedValue({
      totalReferred: 0,
      bonusCredited: 0,
      referralCode: 'NEW_CODE',
    });

    const result = await useCase.execute('new-user');
    expect(result.totalReferred).toBe(0);
  });
});
