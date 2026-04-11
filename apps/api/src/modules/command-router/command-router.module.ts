import { Module } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UserModule } from '../user/user.module';
import { BillingModule } from '../billing/billing.module';
import { ReferralModule } from '../referral/referral.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [OnboardingModule, UserModule, BillingModule, ReferralModule, ChatModule],
  providers: [CommandRouterService],
  exports: [CommandRouterService],
})
export class CommandRouterModule {}
