import { initSentry } from './common/sentry/sentry.init';
// Initialize Sentry BEFORE anything else
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);

  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);
  Logger.log(`🧠 Nigar API running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
