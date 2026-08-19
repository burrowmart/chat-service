/**
 * Jest globalSetup — runs once before any test file is loaded.
 * Starts an in-memory MongoDB and exposes MONGO_URI via process.env so that
 * ConfigModule's Joi validation finds the variable when app.module.ts is
 * first imported (which happens at module-load time, before beforeAll).
 * Works because --runInBand keeps everything in the same process.
 *
 * Unlike user-service, chat-service never opens a multi-document Mongo
 * transaction (seq allocation is a single atomic findOneAndUpdate), so a
 * plain standalone MongoMemoryServer is sufficient — no replica set needed.
 *
 * REDIS_URL is left pointing at a real Redis (default localhost:6379, the
 * platform-infra compose stack) because the e2e suite asserts real pub/sub
 * delivery and real TTL expiry — behavior an in-memory/mocked client can't
 * faithfully reproduce.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('chat-service-test');
  process.env.PORT = '3002';
  process.env.AUTH_DISABLED = 'true';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  (global as any).__MONGOD__ = mongod;
}
