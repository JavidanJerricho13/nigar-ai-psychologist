import { Injectable, Inject } from '@nestjs/common';
import {
  REFERRAL_REPOSITORY,
  ReferralRepositoryPort,
  ReferralStats,
} from '../ports/referral.repository.port';

@Injectable()
export class GetReferralInfoUseCase {
  constructor(
    @Inject(REFERRAL_REPOSITORY) private readonly repo: ReferralRepositoryPort,
  ) {}

  async execute(userId: string): Promise<ReferralStats> {
    return this.repo.getStats(userId);
  }
}
