/**
 * chat-service e2e verification.
 *
 * Mongo is an in-memory instance started by test/global-setup.ts.
 * Redis is REAL (REDIS_URL, default redis://localhost:6379) because two of
 * the four required proofs — pub/sub delivery and TTL expiry — cannot be
 * faithfully exercised against a mock.
 *
 * The app is bound to a real listening port (app.listen(0)) and driven with
 * native fetch rather than supertest's default in-memory agent: under ~20
 * truly simultaneous sockets, supertest's client intermittently reports a
 * spurious client-side ECONNRESET even though the server has already sent a
 * 201 for every request (verified independently against Mongo). fetch over
 * a real socket does not exhibit that artifact.
 */
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { ChatMessageEntity, ChatMessageDocument } from '../src/chat/schemas/chat-message.schema';

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let messageModel: Model<ChatMessageDocument>;
  let redisUrl: string;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    messageModel = moduleFixture.get(getModelToken(ChatMessageEntity.name));
    redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  });

  afterAll(async () => {
    await app.close();
  });

  const asJson = async <T>(res: Response): Promise<T> => (await res.json()) as T;

  const sendMessage = (conversationId: string, senderEmail: string, body: string) =>
    fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderEmail, body }),
    });

  it('20 concurrent sends to one conversation → seq is gapless 1..20 (proven by direct Mongo query)', async () => {
    const conversationId = `conv-concurrency-${randomUUID()}`;

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sendMessage(conversationId, `user${i}@example.com`, `message ${i}`),
      ),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);

    // Prove with a query: read seq directly from Mongo, not through the API.
    const docs = await messageModel
      .find({ conversationId })
      .sort({ seq: 1 })
      .lean()
      .exec();

    expect(docs).toHaveLength(20);
    const seqs = docs.map((d) => d.seq);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1)); // gapless 1..20

    // No two messages share a seq — the unique compound index held under concurrency.
    expect(new Set(seqs).size).toBe(20);
  });

  it('afterSeq returns exactly the tail', async () => {
    const conversationId = `conv-tail-${randomUUID()}`;

    for (let i = 0; i < 10; i++) {
      const res = await sendMessage(conversationId, 'alice@example.com', `msg-${i}`);
      expect(res.status).toBe(201);
    }

    const res = await fetch(
      `${baseUrl}/conversations/${conversationId}/messages?afterSeq=7&limit=50`,
    );
    expect(res.status).toBe(200);
    const body = await asJson<{ data: { seq: number }[]; total: number }>(res);

    // Only seq 8, 9, 10 — the exact tail after seq 7 — nothing more, nothing less.
    expect(body.data.map((m) => m.seq)).toEqual([8, 9, 10]);
    expect(body.total).toBe(3);
  });

  it('typing key disappears after its 5s TTL', async () => {
    const conversationId = `conv-typing-${randomUUID()}`;
    const email = 'typing-user@example.com';

    const put = await fetch(`${baseUrl}/conversations/${conversationId}/typing/${email}`, {
      method: 'PUT',
    });
    expect(put.status).toBe(204);

    const immediately = await asJson<{ typing: string[] }>(
      await fetch(`${baseUrl}/conversations/${conversationId}/typing`),
    );
    expect(immediately.typing).toContain(email);

    await new Promise((r) => setTimeout(r, 5_500));

    const afterTtl = await asJson<{ typing: string[] }>(
      await fetch(`${baseUrl}/conversations/${conversationId}/typing`),
    );
    expect(afterTtl.typing).not.toContain(email);
  }, 15_000);

  it('membership: 200 after the sender has sent into the conversation, 404 for a stranger', async () => {
    const conversationId = `conv-members-${randomUUID()}`;

    expect((await fetch(`${baseUrl}/conversations/${conversationId}/members/alice@example.com`)).status).toBe(404);

    const sent = await sendMessage(conversationId, 'alice@example.com', 'hi');
    expect(sent.status).toBe(201);

    const member = await fetch(`${baseUrl}/conversations/${conversationId}/members/alice@example.com`);
    expect(member.status).toBe(200);
    expect(await asJson<{ member: boolean }>(member)).toEqual({
      conversationId,
      email: 'alice@example.com',
      member: true,
    });

    expect((await fetch(`${baseUrl}/conversations/${conversationId}/members/stranger@example.com`)).status).toBe(
      404,
    );
  });

  it('pub/sub message is observed on send, and carries seq', async () => {
    const conversationId = `conv-pubsub-${randomUUID()}`;
    const subscriber = new Redis(redisUrl);

    const received: string = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for pub/sub message')), 8_000);
      subscriber.on('message', (_channel, message) => {
        clearTimeout(timer);
        resolve(message);
      });

      // Send only after the subscription is confirmed, to avoid a race where the
      // publish fires before this subscriber is registered.
      subscriber.subscribe(`chat:${conversationId}`).then(() => {
        void sendMessage(conversationId, 'bob@example.com', 'pubsub check');
      });
    });

    const payload = JSON.parse(received);
    expect(payload.conversationId).toBe(conversationId);
    expect(payload.senderEmail).toBe('bob@example.com');
    expect(payload.body).toBe('pubsub check');
    expect(payload.seq).toBe(1);

    await subscriber.quit();
  });
});
