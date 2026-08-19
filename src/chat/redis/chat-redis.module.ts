import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CHAT_REDIS_CLIENT } from './chat-redis.tokens';

@Module({
  providers: [
    {
      provide: CHAT_REDIS_CLIENT,
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redisUrl')!;
        return new Redis(url);
      },
      inject: [ConfigService],
    },
  ],
  exports: [CHAT_REDIS_CLIENT],
})
export class ChatRedisModule {}
