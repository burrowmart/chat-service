/**
 * Generates openapi.yaml from the NestJS Swagger module metadata.
 *
 * Prerequisites:
 *   - MongoDB must be reachable at MONGO_URI (or set env before running).
 *   - Run from the chat-service directory: npm run generate:openapi
 *
 * The emitted openapi.yaml is committed to the repo as the as-built view of
 * what this service actually serves. It is NOT the client-generator input:
 * contracts' generate-clients.ts reads the hand-authored design specs in
 * contracts/openapi/, never a service's own file — keep the two in agreement.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

// Defaults so the script is runnable without compose. These MUST be assigned
// before app.module is loaded: its ConfigModule.forRoot() call runs Joi at
// module-evaluation time, and a static `import { AppModule }` would be hoisted
// above these lines — leaving AUTH_DISABLED unset, which makes COGNITO_ISSUER
// and COGNITO_AUDIENCE required and fails validation. Hence the dynamic import
// inside generate() below.
process.env.MONGO_URI ??= 'mongodb://localhost:27017/chat-service';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.AUTH_DISABLED ??= 'true';

async function generate(): Promise<void> {
  const { AppModule } = await import('../src/app.module');

  // abortOnError: false — the default (true) makes Nest swallow the cause and
  // exit(1), which combined with `logger: false` produces a silent failure.
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });

  const config = new DocumentBuilder()
    .setTitle('Chat Service API')
    .setDescription(
      'Persists chat messages with a monotonic per-conversation seq and fans them out via ' +
        'Redis pub/sub. Presence and typing indicators live in Redis only (TTL, never persisted).',
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, '..', 'openapi.yaml');
  writeFileSync(outPath, yaml.dump(document, { lineWidth: 120, noRefs: true }));
  console.log(`openapi.yaml written to ${outPath}`);

  await app.close();
  // Force exit in case Mongoose connection is still pending
  process.exit(0);
}

generate().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
