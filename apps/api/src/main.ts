import { initSentry } from './common/sentry/sentry.init';
// Initialize Sentry BEFORE anything else
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // Security headers
  app.use(helmet());

  // CORS: whitelist from env, or allow all in dev
  const corsOrigins = config.get<string>('CORS_ORIGINS', '');
  if (nodeEnv === 'production' && corsOrigins) {
    app.enableCors({
      origin: corsOrigins.split(',').map((s) => s.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      maxAge: 3600,
    });
  } else {
    app.enableCors();
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);
  Logger.log(`🧠 Nigar API running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`🔒 Helmet + CORS active (env=${nodeEnv})`, 'Bootstrap');
}

bootstrap();
