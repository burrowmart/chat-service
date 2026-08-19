# chat-service

Cloned from `user-service` (see [`platform-infra`](../platform-infra) for the shared
scaffold this template provides — auth guard, correlation id, pino logging, OTel
tracing, Prometheus metrics, Helm chart, CI).

## Architecture

`chat-service` persists chat messages with a monotonic per-conversation sequence
number and fans them out to `ws-gateway` over Redis pub/sub:

- Owns the `chat_messages` MongoDB collection — `(conversationId, seq)` unique compound index.
- Owns the `conversation_counters` MongoDB collection — one document per conversation,
  advanced exclusively via `findOneAndUpdate($inc, upsert:true)`. This is the *only*
  place `seq` is assigned: atomic in Mongo, so it's gapless and correct across
  concurrent requests, service restarts, and multiple replicas — no in-memory counter.
- Presence (`presence:{email}`, 30s TTL) and typing (`typing:{conversationId}:{email}`,
  5s TTL) live in Redis only and are **never** written to Mongo.
- Does **not** use the transactional outbox / RabbitMQ: the send flow is
  persist-then-best-effort-publish. If the Redis `PUBLISH` fails, the message is
  already durable in Mongo and reachable via the `afterSeq` reconnect endpoint below —
  the request never fails on a publish error (see `ChatService.sendMessage`).
- Owns the `conversation_members` MongoDB collection — membership is *derived*,
  not declared: an email is upserted as a member the moment it sends into a
  conversation (there is no invite flow / participant roster). `ws-gateway`
  calls `GET /conversations/:id/members/:email` before allowing a
  `chat:{conversationId}` channel join, so a client can't subscribe to a
  conversation it has never taken part in.

### Send flow

```
POST /conversations/:id/messages
  → ChatMessagesRepository.nextSeq(id)        // atomic $inc, upsert, in Mongo
  → ChatMessagesRepository.createMessage(...)  // durable write, unique (id, seq)
  → ChatRedisService.publish('chat:{id}', msg) // best-effort; failure is logged, not thrown
```

### Reconnect flow

```
GET /conversations/:id/messages?afterSeq={lastSeq}
  → messages with seq > lastSeq, ordered ascending, paginated
```

### What this service owns

| Resource | Type | Notes |
|----------|------|-------|
| `chat_messages` | MongoDB collection | unique `(conversationId, seq)` |
| `conversation_counters` | MongoDB collection | `_id` = conversationId, `seq` advanced via `$inc` |
| `conversation_members` | MongoDB collection | unique `(conversationId, email)`, upserted on send |
| `chat:{conversationId}` | Redis pub/sub channel | consumed by `ws-gateway` |
| `presence:{email}` | Redis key, TTL 30s | heartbeat |
| `typing:{conversationId}:{email}` | Redis key, TTL 5s | typing indicator |

---

## Running locally

### Prerequisites

```bash
# 1. Build the shared contracts package (provides Paginated<T> etc.)
cd ../contracts && npm install && npm run build && cd -

# 2. Install service dependencies
npm install

# 3. Copy env and start the Mongo + Redis compose stack
cp .env.example .env
docker compose -f ../platform-infra/docker-compose.yml up -d mongo redis
```

### Start in dev mode

```bash
npm run start:dev
# Service listens on http://localhost:3000
# Swagger UI at    http://localhost:3000/api
```

### Tests

```bash
# Unit tests (repository/redis mocked)
npm test

# E2E tests — uses mongodb-memory-server for Mongo, and a REAL Redis at
# REDIS_URL (default redis://localhost:6379) for pub/sub + TTL assertions.
# Start Redis first: docker compose -f ../platform-infra/docker-compose.yml up -d redis
npm run test:e2e
```

### curl round-trip

```bash
BASE=http://localhost:3000
CID=demo-conversation

# Send
curl -s -X POST $BASE/conversations/$CID/messages \
  -H 'Content-Type: application/json' \
  -d '{"senderEmail":"alice@example.com","body":"hey"}' | jq

# Reconnect — only messages after seq 0
curl -s "$BASE/conversations/$CID/messages?afterSeq=0" | jq

# Membership check (200 once alice has sent at least once; 404 before that / for anyone else)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/conversations/$CID/members/alice@example.com

# Presence heartbeat / read
curl -s -X PUT $BASE/presence/alice@example.com -o /dev/null -w "%{http_code}\n"
curl -s $BASE/presence/alice@example.com | jq

# Typing heartbeat / read
curl -s -X PUT $BASE/conversations/$CID/typing/alice@example.com -o /dev/null -w "%{http_code}\n"
curl -s $BASE/conversations/$CID/typing | jq
```

### Verifying seq gaplessness and pub/sub fan-out

```bash
# Watch fan-out live while sending from another shell
redis-cli SUBSCRIBE chat:$CID

# Prove seq is gapless 1..N in Mongo after concurrent sends
mongosh "mongodb://localhost:27017/chat-service" \
  --eval 'db.chat_messages.find({conversationId:"demo-conversation"}, {seq:1,_id:0}).sort({seq:1}).toArray()'
```
