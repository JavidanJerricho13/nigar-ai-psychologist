import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);

  app.enableCors();
  app.setGlobalPrefix('api/v1');

  await app.listen(port);
  Logger.log(`🧠 Nigar API running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
