import { initSentry } from './common/sentry/sentry.init';
// Initialize Sentry BEFORE anything else
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);

  app.enableCors();
  app.setGlobalPrefix('api/v1', {
    exclude: ['mini-app', 'mini-app/*path'],
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Serve Telegram Mini App static files at /mini-app
  const miniAppPath = path.resolve(__dirname, '../../../mini-app/src');
  app.useStaticAssets(miniAppPath, { prefix: '/mini-app' });

  await app.listen(port);
  Logger.log(`🧠 Nigar API running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`📱 Mini App: http://localhost:${port}/mini-app/index.html`, 'Bootstrap');
}

bootstrap();
