/**
 * Admin Panel — separate process from the bot.
 *
 * Usage: node dist/admin-entry.js
 * Access: http://localhost:3001/admin
 */
import * as path from 'path';

import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { configuration, validationSchema } from './config/configuration';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AdminPanelModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../../../.env'),
        path.resolve(__dirname, '../../.env'),
      ],
      load: [configuration],
      validate: validationSchema,
    }),
    PrismaModule,
    RedisModule,
    EncryptionModule,
    AdminPanelModule,
  ],
})
class AdminEntryModule {}

async function bootstrap() {
  const app = await NestFactory.create(AdminEntryModule);
  const port = process.env.ADMIN_PORT ?? 3001;

  await app.listen(port);
  Logger.log(`🔧 Admin Panel running at http://localhost:${port}/admin`, 'AdminBootstrap');
}

bootstrap();
