import { Module, Global, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url', 'redis://localhost:6379');
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });

        client.on('connect', () => {
          Logger.log('Redis connected', 'RedisModule');
        });

        client.on('error', (err) => {
          Logger.error(`Redis error: ${err.message}`, 'RedisModule');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy() {
    // Redis client cleanup is handled by NestJS DI container
  }
}
