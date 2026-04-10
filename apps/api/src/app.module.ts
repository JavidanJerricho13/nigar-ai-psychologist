import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, validationSchema } from './config/configuration';
import { RedisModule } from './shared/redis/redis.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { UserModule } from './modules/user/user.module';
import { CommandRouterModule } from './modules/command-router/command-router.module';
import { ChatModule } from './modules/chat/chat.module';
import { AudioModule } from './modules/audio/audio.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validationSchema,
    }),
    RedisModule,
    PrismaModule,
    EncryptionModule,
    OnboardingModule,
    UserModule,
    CommandRouterModule,
    ChatModule,
    AudioModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
