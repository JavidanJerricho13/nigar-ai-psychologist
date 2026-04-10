import { Module } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [OnboardingModule, UserModule],
  providers: [CommandRouterService],
  exports: [CommandRouterService],
})
export class CommandRouterModule {}
