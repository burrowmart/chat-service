/** Single source of truth for all strings that change when cloning this template. */

/** Slug used for OTEL service.name, Helm release name, and image tag prefix. */
export const SERVICE_NAME = 'chat-service';

/** MongoDB collection this service owns. */
export const MONGO_COLLECTION = 'chat_messages';

/** Mongo collection backing the atomic per-conversation seq counter ($inc, upsert). */
export const COUNTER_COLLECTION = 'conversation_counters';

/** Mongo collection recording which emails have sent into which conversation (membership). */
export const CONVERSATION_MEMBER_COLLECTION = 'conversation_members';

/** RabbitMQ queue this service binds (mirrors helm/values.yaml app.env.RABBITMQ_QUEUE). */
export const RABBITMQ_QUEUE = 'chat-service.queue';
