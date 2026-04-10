import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  REFERRAL_REPOSITORY,
  ReferralRepositoryPort,
} from '../ports/referral.repository.port';
import { AddCreditsUseCase } from '../../../billing/domain/use-cases/add-credits.use-case';
import {
  SelfReferralException,
  AlreadyReferredException,
  ReferrerNotFoundException,
} from '../exceptions/referral.exceptions';

const REFERRER_BONUS = 5;
const REFERRED_BONUS = 3;

export interface ApplyReferralInput {
  /** The new user's ID */
  referredUserId: string;
  /** The referral code from deep link */
  referralCode: string;
}

export interface ApplyReferralOutput {
  success: boolean;
  referrerBonus: number;
  referredBonus: number;
}

@Injectable()
export class ApplyReferralUseCase {
  private readonly logger = new Logger(ApplyReferralUseCase.name);

  constructor(
    @Inject(REFERRAL_REPOSITORY) private readonly referralRepo: ReferralRepositoryPort,
    private readonly addCredits: AddCreditsUseCase,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: ApplyReferralInput): Promise<ApplyReferralOutput> {
    // 1. Find referrer by referral code
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: input.referralCode },
      select: { id: true },
    });

    if (!referrer) {
      throw new ReferrerNotFoundException(input.referralCode);
    }

    // 2. Prevent self-referral
    if (referrer.id === input.referredUserId) {
      throw new SelfReferralException();
    }

    // 3. Check if already referred
    const existing = await this.referralRepo.findByReferredId(input.referredUserId);
    if (existing) {
      throw new AlreadyReferredException(input.referredUserId);
    }

    // 4. Create referral record
    const referral = await this.referralRepo.create(
      referrer.id,
      input.referredUserId,
    );

    // 5. Grant bonuses to both
    await this.addCredits.execute({
      userId: referrer.id,
      amount: REFERRER_BONUS,
      type: 'referral_bonus',
      description: `Referal bonusu: yeni istifadəçi dəvət edildi`,
    });

    await this.addCredits.execute({
      userId: input.referredUserId,
      amount: REFERRED_BONUS,
      type: 'referral_bonus',
      description: `Xoş gəldin bonusu: referal kodu ilə qoşuldun`,
    });

    // 6. Mark bonus as credited
    await this.referralRepo.markBonusCredited(referral.id);

    this.logger.log(
      `Referral applied: ${referrer.id.slice(0, 8)} → ${input.referredUserId.slice(0, 8)} (${REFERRER_BONUS}+${REFERRED_BONUS} credits)`,
    );

    return {
      success: true,
      referrerBonus: REFERRER_BONUS,
      referredBonus: REFERRED_BONUS,
    };
  }
}
