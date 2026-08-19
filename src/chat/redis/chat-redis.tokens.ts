/** Injection token for chat's ioredis client (pub/sub fan-out + presence/typing TTL keys). */
export const CHAT_REDIS_CLIENT = Symbol('CHAT_REDIS_CLIENT');
