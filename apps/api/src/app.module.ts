import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, validationSchema } from './config/configuration';
import { RedisModule } from './shared/redis/redis.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
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
    OnboardingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
