import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ChatModule } from '../chat/chat.module';
import { REFERRAL_REPOSITORY } from './domain/ports/referral.repository.port';
import { PrismaReferralRepository } from './infrastructure/adapters/prisma-referral.repository';
import { ApplyReferralUseCase } from './domain/use-cases/apply-referral.use-case';
import { GetReferralInfoUseCase } from './domain/use-cases/get-referral-info.use-case';
import { ShadowReferralService } from './domain/services/shadow-referral.service';
import { WisdomCardService } from './domain/services/wisdom-card.service';

@Module({
  imports: [BillingModule, ChatModule],
  providers: [
    { provide: REFERRAL_REPOSITORY, useClass: PrismaReferralRepository },
    ApplyReferralUseCase,
    GetReferralInfoUseCase,
    ShadowReferralService,
    WisdomCardService,
  ],
  exports: [ApplyReferralUseCase, GetReferralInfoUseCase, ShadowReferralService, WisdomCardService],
})
export class ReferralModule {}
