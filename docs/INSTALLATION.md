# Installation Guide

## Prerequisites

- Node.js >= 18
- npm, pnpm, or bun
- Redis (or outro broker)

---

## Step 1: Install Dependencies

```bash
cd elysia-messaging

# Instalar dependências
npm install

# Ou com pnpm
pnpm install

# Ou com bun
bun install
```

Isso instalará:
- `elysia` (peer dependency)
- `ioredis` (para Redis Streams adapter)
- `@sinclair/typebox` (para validação, será dependency depois)
- `typescript` (devDependency)
- `@types/node` (devDependency)

---

## Step 2: Build do Plugin

```bash
npm run build

# Ou em watch mode durante desenvolvimento
npm run dev
```

Isso compila o TypeScript para JavaScript e gera os arquivos `.d.ts` em `dist/`.

---

## Step 3: Implementar os Adapters

Os adapters estão com stubs (TODO comments). Você precisa implementar:

### 3.1. RedisStreamsBus

**Arquivo:** `src/adapters/redis-streams/redis-streams.bus.ts`

```typescript
async publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>): Promise<void> {
  const streamKey = `${REDIS_PREFIXES.STREAM}${topic}`

  const fields = {
    eventId: envelope.eventId,
    type: envelope.type,
    jobId: envelope.jobId,
    occurredAt: envelope.occurredAt,
    version: envelope.version.toString(),
    attempts: envelope.attempts.toString(),
    payload: JSON.stringify(envelope.payload),
    ...(envelope.correlationId && { correlationId: envelope.correlationId }),
    ...(envelope.causationId && { causationId: envelope.causationId }),
  }

  // Descomente esta linha:
  await this.redis.xadd(streamKey, RedisStreams.IDS.AUTO, ...Object.entries(fields).flat())
}
```

### 3.2. RedisDedupeStore

**Arquivo:** `src/adapters/redis-streams/redis-dedupe.store.ts`

```typescript
async has(eventId: string): Promise<boolean> {
  const key = this.getKey(eventId)
  const exists = await this.redis.exists(key)
  return exists === 1
}

async mark(eventId: string, ttlSeconds = RedisStreams.DEFAULTS.DEDUPE_TTL_SECONDS): Promise<void> {
  const key = this.getKey(eventId)
  await this.redis.setex(key, ttlSeconds, '1')
}

async remove(eventId: string): Promise<void> {
  const key = this.getKey(eventId)
  await this.redis.del(key)
}
```

### 3.3. RedisStreamsConsumer

**Arquivo:** `src/adapters/redis-streams/redis-streams.consumer.ts`

Este é o mais complexo. Precisa implementar:

1. **Create consumer group**
```typescript
try {
  await this.redis.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM')
} catch (error) {
  // Group já existe, tudo bem
}
```

2. **Consumption loop**
```typescript
this.isRunning = true
while (this.isRunning) {
  try {
    const results = await this.redis.xreadgroup(
      'GROUP',
      consumerGroup,
      consumerName,
      'BLOCK',
      blockMs || 5000,
      'COUNT',
      10,
      'STREAMS',
      streamKey,
      '>'
    )

    if (results && results.length > 0) {
      for (const [stream, messages] of results) {
        for (const [messageId, rawFields] of messages) {
          try {
            // Converter array [k1, v1, k2, v2] para object
            const fields = {}
            for (let i = 0; i < rawFields.length; i += 2) {
              fields[rawFields[i]] = rawFields[i + 1]
            }

            const envelope = this.parseMessage(fields)
            await handler(envelope)

            // ACK message
            await this.redis.xack(streamKey, consumerGroup, messageId)
          } catch (error) {
            console.error('Handler error:', error)
            // Implementar retry logic aqui
          }
        }
      }
    }
  } catch (error) {
    console.error('Consumer error:', error)
    await sleep(1000)
  }
}
```

### 3.4. TypeBox Validator

**Arquivo:** `src/core/registry.types.ts`

```typescript
import { Value } from '@sinclair/typebox/value'

export const typeBoxValidator: SchemaValidator = {
  validate: <TSchema extends TSchema>(schema: TSchema, data: unknown) => {
    const errors = [...Value.Errors(schema, data)]
    if (errors.length > 0) {
      throw new ValidationError(
        'Validation failed',
        errors.map((e) => ({ path: e.path, message: e.message }))
      )
    }
  },

  isValid: <TSchema extends TSchema>(schema: TSchema, data: unknown): boolean => {
    return Value.Check(schema, data)
  },
}
```

---

## Step 4: Run Tests

### Setup Redis

```bash
# Com Docker
docker run -d -p 6379:6379 redis:latest

# Ou instale localmente
# macOS
brew install redis
redis-server

# Linux
sudo apt-get install redis-server
sudo service redis-server start
```

### Run Examples

```bash
# Terminal 1: API Server
npm run build
node dist/examples/complete-api.js

# Terminal 2: Worker
node dist/examples/complete-worker.js

# Terminal 3: Test publish
curl -X POST http://localhost:3000/videos \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/video.mp4",
    "userId": "user-123",
    "options": { "quality": "1080p" }
  }'
```

### Verificar no Redis

```bash
redis-cli

# Ver streams criados
KEYS stream:*

# Ver mensagens
XRANGE stream:video.jobs - +

# Ver consumer groups
XINFO GROUPS stream:video.jobs

# Ver consumers no group
XINFO CONSUMERS stream:video.jobs video-processors
```

---

## Step 5: Use in Your Project

### Install o plugin publicado

```bash
npm install elysia-messaging ioredis
```

### Setup

```typescript
// shared/topics.ts
import { t } from 'elysia'
import { createTopicRegistry } from 'elysia-messaging'

export const myTopics = createTopicRegistry({
  'user.created': {
    schema: t.Object({
      userId: t.String(),
      email: t.String({ format: 'email' }),
    }),
  },
})

// api.ts
import { Elysia } from 'elysia'
import { messaging } from 'elysia-messaging'
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
import { Redis } from 'ioredis'
import { myTopics } from './shared/topics'

const redis = new Redis()
const bus = new RedisStreamsBus(redis)

const app = new Elysia()
  .use(messaging({ registry: myTopics, bus }))
  .post('/users', async ({ messaging, body }) => {
    await messaging.publish('user.created', {
      userId: body.userId,
      email: body.email,
    })
    return { success: true }
  })
  .listen(3000)

// worker.ts
import { Elysia } from 'elysia'
import { messagingConsumers, createConsumer } from 'elysia-messaging'
import { RedisStreamsConsumer } from 'elysia-messaging/redis-streams'
import { myTopics } from './shared/topics'

const consumer = new RedisStreamsConsumer(redis)

const userCreatedConsumer = createConsumer(myTopics, {
  topic: 'user.created',
  group: 'email-senders',
  name: 'worker-1',
  async handler(envelope) {
    console.log('User created:', envelope.payload)
    // Send welcome email...
  },
})

const worker = new Elysia()
  .use(messagingConsumers({
    consumers: [userCreatedConsumer],
    consumer,
  }))
  .listen(3001)
```

---

## Troubleshooting

### Erro: Cannot find module 'elysia'

```bash
npm install elysia
```

### Erro: Cannot find module '@sinclair/typebox'

```bash
npm install @sinclair/typebox
```

### Erro: Redis connection refused

```bash
# Verifique se Redis está rodando
redis-cli ping
# Deve retornar: PONG

# Se não estiver rodando:
docker run -d -p 6379:6379 redis:latest
```

### Erro: Consumer não recebe mensagens

- Verifique se consumer group foi criado: `XINFO GROUPS stream:video.jobs`
- Verifique se há mensagens no stream: `XLEN stream:video.jobs`
- Verifique logs do consumer para erros

### TypeScript errors

```bash
# Rebuild
npm run build

# Check types
npm run typecheck
```

---

## Next Steps

1. **Read the docs:**
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - Como funciona
   - [DESIGN-DECISIONS.md](./DESIGN-DECISIONS.md) - Trade-offs
   - [ROADMAP.md](./ROADMAP.md) - Próximas versões

2. **Run examples:**
   - `src/examples/complete-api.ts`
   - `src/examples/complete-worker.ts`
   - `src/examples/advanced-usage.ts`

3. **Contribute:**
   - Implementar outros adapters (NATS, Kafka)
   - Adicionar testes
   - Melhorar documentação

---

## Support

- GitHub Issues: Para bugs e feature requests
- GitHub Discussions: Para perguntas e discussões
- Examples: `src/examples/` para referência

