import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { CHAT_REDIS_CLIENT } from './chat-redis.tokens';

const PRESENCE_TTL_SECONDS = 30;
const TYPING_TTL_SECONDS = 5;

const presenceKey = (email: string) => `presence:${email}`;
const typingKey = (conversationId: string, email: string) => `typing:${conversationId}:${email}`;
const typingPattern = (conversationId: string) => `typing:${conversationId}:*`;
const channel = (conversationId: string) => `chat:${conversationId}`;

@Injectable()
export class ChatRedisService {
  constructor(@Inject(CHAT_REDIS_CLIENT) private readonly redis: Redis) {}

  /** Fan-out to ws-gateway subscribers of chat:{conversationId} — the payload carries seq. */
  publish(conversationId: string, message: unknown): Promise<number> {
    return this.redis.publish(channel(conversationId), JSON.stringify(message));
  }

  heartbeatPresence(email: string): Promise<'OK'> {
    return this.redis.setex(presenceKey(email), PRESENCE_TTL_SECONDS, '1');
  }

  async isOnline(email: string): Promise<boolean> {
    return (await this.redis.exists(presenceKey(email))) === 1;
  }

  setTyping(conversationId: string, email: string): Promise<'OK'> {
    return this.redis.setex(typingKey(conversationId, email), TYPING_TTL_SECONDS, '1');
  }

  // Presence/typing are TTL-only and never persisted, so "who is typing" is
  // reconstructed by scanning the live key space rather than reading a stored list.
  async getTypingEmails(conversationId: string): Promise<string[]> {
    const prefix = `typing:${conversationId}:`;
    const emails: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        typingPattern(conversationId),
        'COUNT',
        100,
      );
      cursor = next;
      for (const key of keys) emails.push(key.slice(prefix.length));
    } while (cursor !== '0');
    return emails;
  }
}
