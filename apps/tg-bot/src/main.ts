import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { BotModule } from './bot.module';
import { BotService } from './adapters/bot.service';

async function bootstrap() {
  const app = await NestFactory.create(BotModule);
  const botService = app.get(BotService);

  await botService.launch(app);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, shutting down...`, 'Bootstrap');
    await botService.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
