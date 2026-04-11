import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { configuration, validationSchema } from './config/configuration';
import { RedisModule } from './shared/redis/redis.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { NigarThrottleGuard } from './common/guards/throttle.guard';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { UserModule } from './modules/user/user.module';
import { CommandRouterModule } from './modules/command-router/command-router.module';
import { ChatModule } from './modules/chat/chat.module';
import { AudioModule } from './modules/audio/audio.module';
import { BillingModule } from './modules/billing/billing.module';
import { ReferralModule } from './modules/referral/referral.module';
import { AdminPanelModule } from './admin/admin.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validationSchema,
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },    // 3 req/sec burst
      { name: 'medium', ttl: 60000, limit: 30 },  // 30 req/min
      { name: 'long', ttl: 3600000, limit: 500 }, // 500 req/hour
    ]),
    RedisModule,
    PrismaModule,
    EncryptionModule,
    OnboardingModule,
    UserModule,
    CommandRouterModule,
    ChatModule,
    AudioModule,
    BillingModule,
    ReferralModule,
    AdminPanelModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: NigarThrottleGuard },
  ],
})
export class AppModule {}
