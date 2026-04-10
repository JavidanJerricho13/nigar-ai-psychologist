import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { REFERRAL_REPOSITORY } from './domain/ports/referral.repository.port';
import { PrismaReferralRepository } from './infrastructure/adapters/prisma-referral.repository';
import { ApplyReferralUseCase } from './domain/use-cases/apply-referral.use-case';
import { GetReferralInfoUseCase } from './domain/use-cases/get-referral-info.use-case';

@Module({
  imports: [BillingModule],
  providers: [
    { provide: REFERRAL_REPOSITORY, useClass: PrismaReferralRepository },
    ApplyReferralUseCase,
    GetReferralInfoUseCase,
  ],
  exports: [ApplyReferralUseCase, GetReferralInfoUseCase],
})
export class ReferralModule {}
