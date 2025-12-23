# elysia-messaging

**Production-grade, type-safe messaging plugin for [ElysiaJS](https://elysiajs.com) (broker-agnostic)**

Stop writing the same pub/sub boilerplate. Define your topics once, get type-safety everywhere.

## ✨ Features

- 🎯 **100% Type-Safe** - Topic → Payload type inference via TypeScript
- 🔧 **Broker-Agnostic** - Redis Streams, NATS, Kafka (via adapters)
- ✅ **TypeBox Validation** - Automatic payload validation with detailed errors
- 🏗️ **OO + Functional** - Class-based or functional consumer styles
- 🚀 **Enhanced Handlers** - Publish from handlers, access retry attempt
- ⚡ **Idempotency** - Built-in deduplication with configurable TTL
- 🛡️ **DLQ Support** - Dead letter queue for failed messages
- 📊 **Observability** - Comprehensive hooks for metrics/logging
- 🔌 **Lifecycle-Aware** - Integrates with Elysia onStart/onStop
- 📦 **Clean Architecture** - Port/Adapter pattern, zero coupling

## 📦 Installation

```bash
# Core package (broker-agnostic)
npm install elysia-messaging @sinclair/typebox

# If using Redis Streams
npm install ioredis
```

## 🚀 Quick Start

### 1. Define Your Topics (Type-Safe Registry)

```typescript
// shared/topics.ts
import { Type as t } from '@sinclair/typebox'
import { createTopicRegistry } from 'elysia-messaging'

export const myTopics = createTopicRegistry({
  'video.jobs': {
    schema: t.Object({
      videoId: t.String(),
      url: t.String({ format: 'uri' }),
      userId: t.String(),
    }),
    messageType: 'video.processing.request', // Auto-picked on publish
    description: 'Video processing jobs',
  },
  'video.results': {
    schema: t.Object({
      videoId: t.String(),
      success: t.Boolean(),
      outputUrl: t.Optional(t.String()),
    }),
    messageType: 'video.processing.result',
  },
})
```

### 2. API Server (Publisher)

```typescript
import { Elysia } from 'elysia'
import { messaging } from 'elysia-messaging'
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'  // ← Subpath import
import { Redis } from 'ioredis'
import { myTopics } from './shared/topics'

const redis = new Redis()
const bus = new RedisStreamsBus(redis)

const app = new Elysia()
  .use(messaging({ 
    registry: myTopics, 
    bus,
    hooks: {
      onPublish: (topic, envelope) => {
        console.log(`Published to ${topic}:`, envelope.eventId)
      }
    }
  }))
  .post('/video/process', async ({ messaging, body }) => {
    // ✅ Type-safe: payload type inferred from 'video.jobs' schema
    await messaging.publish('video.jobs', {
      videoId: body.videoId,
      url: body.url,
      userId: body.userId,
    })
    // ❌ TypeScript error if you pass wrong payload!
    // ✅ Automatic validation (throws ValidationError if invalid)

    return { status: 'processing' }
  })
  .listen(3000)
```

### 3. Worker (Consumer) - Functional Style

```typescript
import { Elysia } from 'elysia'
import { messaging, messagingConsumers, createConsumer } from 'elysia-messaging'
import type { HandlerContext } from 'elysia-messaging'
import { 
  RedisStreamsBus,
  RedisStreamsConsumer,
  RedisDedupeStore 
} from 'elysia-messaging/redis-streams'  // ← Subpath import
import { myTopics } from './shared/topics'

const redis = new Redis()
const bus = new RedisStreamsBus(redis)
const consumer = new RedisStreamsConsumer(redis, 'dlq')
const dedupe = new RedisDedupeStore(redis)

const videoJobsConsumer = createConsumer(myTopics, {
  topic: 'video.jobs',
  group: 'video-processors',
  name: 'worker-1',
  
  // ✅ Enhanced handler with messaging context (v0.2.0+)
  async handler({ envelope, attempt, messaging }: HandlerContext<any, any>) {
    console.log(`Processing (attempt ${attempt})`)
    
    // ✅ Handler payload is typed automatically!
    const { videoId, url, userId } = envelope.payload
    
    // Process video...
    await processVideo(videoId, url)
    
    // ✅ Publish results directly from handler!
    await messaging.publish('video.results', {
      videoId,
      success: true,
      outputUrl: 'https://cdn.example.com/output.mp4',
    })
  },
  
  options: {
    maxRetries: 3,
    retryDelayMs: 5000,
    idempotency: true,
  },
})

const worker = new Elysia()
  .use(messaging({ registry: myTopics, bus }))  // For publishing
  .use(messagingConsumers({
    consumers: [videoJobsConsumer],
    consumer,
    dedupe,
    hooks: {
      onError: (topic, envelope, error, attempt) => {
        console.error(`Error on ${topic} (attempt ${attempt}):`, error)
      },
      onDLQ: (topic, envelope, error) => {
        console.error('Sent to DLQ:', envelope.eventId)
      },
    },
  }))
  .listen(3001)
```

### 4. Worker (Consumer) - Class Style (Recommended)

```typescript
import { Consumer, createConsumerFromClass } from 'elysia-messaging'
import type { HandlerContext } from 'elysia-messaging'

// ✅ Class-based consumer (recommended for production)
class VideoJobsConsumer implements Consumer<typeof myTopics, 'video.jobs'> {
  readonly topic = 'video.jobs' as const
  readonly group = 'video-processors'
  readonly name = () => `worker-${process.pid}` // Dynamic!
  
  readonly options = {
    maxRetries: 3,
    retryDelayMs: 5000,
    idempotency: true,
  }
  
  constructor(
    private db: Database,
    private storage: Storage
  ) {}
  
  async handle({ envelope, attempt, messaging }: HandlerContext<any, any>) {
    const { videoId, url } = envelope.payload
    
    // Use injected dependencies
    await this.db.videos.update(videoId, { status: 'processing' })
    
    const result = await this.processVideo(url)
    
    await messaging.publish('video.results', {
      videoId,
      success: true,
      outputUrl: result.url,
    })
  }
  
  private async processVideo(url: string) {
    // Implementation...
    return { url: 'https://...' }
  }
}

// Register class-based consumer
const worker = new Elysia()
  .use(messaging({ registry: myTopics, bus }))
  .use(messagingConsumers({
    consumers: [
      createConsumerFromClass(myTopics, new VideoJobsConsumer(db, storage)),
    ],
    consumer,
    dedupe,
  }))
  .listen(3001)
```

**That's it!** Consumers start automatically when app starts. Type-safety everywhere.

---

## 🎯 What's New in v0.2.0

### ✅ TypeBox Validation (Working!)

```typescript
import { ValidationError } from 'elysia-messaging'

try {
  await messaging.publish('video.jobs', { invalid: 'payload' })
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.errors)
    // [{ path: '/videoId', message: 'Required property' }]
  }
}
```

### 🚀 Enhanced Handler Context

```typescript
// NEW: Handler receives { envelope, attempt, messaging }
async handler({ envelope, attempt, messaging }: HandlerContext<any, any>) {
  console.log(`Attempt ${attempt}`)
  
  // Publish directly from handler!
  await messaging.publish('results', { ... })
}

// OLD: Still supported (backwards compatible)
async handler(envelope) {
  // Legacy signature
}
```

### 🏗️ Class-Based Consumers

```typescript
class MyConsumer implements Consumer<typeof registry, 'my.topic'> {
  readonly topic = 'my.topic'
  readonly group = 'workers'
  readonly name = () => `worker-${process.pid}` // Dynamic!
  
  async handle({ envelope, messaging }) {
    // Use this.dependencies, publish results
  }
}
```

### 📦 Subpath Exports (Cleaner Imports)

```typescript
// Core (broker-agnostic)
import { messaging, messagingConsumers } from 'elysia-messaging'

// Redis Streams adapter (optional)
import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
```

**[See full changelog →](./CHANGELOG.md)**

---

## 📖 Core Concepts

### Message Envelope Structure

```typescript
interface MessageEnvelope<T = unknown> {
  eventId: string        // Unique event identifier (UUID) for idempotency
  type: string           // Event type (auto-picked from registry)
  jobId: string          // Job identifier (business key)
  occurredAt: string     // ISO timestamp
  correlationId?: string // Tracing ID
  causationId?: string   // What caused this event
  version: number        // Schema version (default: 1)
  attempts: number       // Retry count (0-based)
  payload: T             // Your business data (type-safe!)
}
```

### Topic Registry

The single source of truth for topics, schemas, and message types:

```typescript
const registry = createTopicRegistry({
  'my.topic': {
    schema: t.Object({ ... }),      // TypeBox schema
    messageType: 'my.event.type',   // Optional, defaults to topic name
    description: 'Human-readable',  // Optional documentation
  },
})
```

### Consumer Options

```typescript
interface ConsumerOptions {
  maxRetries?: number       // Max retry attempts (default: 3)
  retryDelayMs?: number     // Delay between retries (default: 0)
  blockMs?: number          // Block time waiting for messages
  skipInvalidPayload?: boolean  // Skip invalid payloads instead of throwing
  idempotency?: boolean     // Enable idempotency checking (default: false)
  dedupeTtl?: number        // Dedupe TTL in seconds (default: 86400 = 24h)
  startId?: string          // Start reading from message ID
}
```

### Observability Hooks

```typescript
// Publisher hooks
hooks: {
  onPublish: (topic, envelope) => { /* metrics */ },
  onPublishError: (topic, envelope, error) => { /* alert */ },
}

// Consumer hooks
hooks: {
  onMessage: (topic, envelope) => { /* log */ },
  onError: (topic, envelope, error, attempt) => { /* retry logic */ },
  onRetry: (topic, envelope, attempt) => { /* metrics */ },
  onDLQ: (topic, envelope, error) => { /* critical alert */ },
  onAck: (topic, envelope) => { /* success metric */ },
}
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      CORE (Broker-Agnostic Ports)      │
│  - MessageEnvelope                      │
│  - MessageBus (publish)                 │
│  - MessageConsumer (subscribe)          │
│  - DedupeStore (idempotency)            │
│  - TopicRegistry (type-safe)            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│       ADAPTERS (Implementations)        │
│  - RedisStreamsBus                      │
│  - RedisStreamsConsumer                 │
│  - RedisDedupeStore                     │
│  (Future: NATS, Kafka, RabbitMQ)        │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          ElysiaJS Plugin Layer          │
│  - messaging() - Publisher plugin       │
│  - messagingConsumers() - Consumer      │
│  - Type inference & validation          │
│  - Lifecycle management                 │
└─────────────────────────────────────────┘
```

---

## 📚 Documentation

- **[UPGRADE-GUIDE.md](./UPGRADE-GUIDE.md)** - Migrating from v0.1.0 to v0.2.0
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and changes
- **[PUBLISHING.md](./PUBLISHING.md)** - How to publish (maintainers)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Deep dive into design
- **[docs/DESIGN-DECISIONS.md](./docs/DESIGN-DECISIONS.md)** - Trade-offs explained

### Examples

Check `src/examples/` for complete examples:
- `shared-topics.ts` - Topic registry definition
- `complete-api.ts` - API server (publisher only)
- `complete-worker.ts` - Worker (consumer with class-based pattern)
- `advanced-usage.ts` - Multi-consumer patterns

---

## 🗺️ Roadmap

- **v0.1.0** - MVP with scaffolded Redis Streams adapter
- **v0.2.0** - Production-grade refactor (Current) ✅
  - TypeBox validation working
  - Enhanced handler context
  - OO consumer support
  - Subpath exports
- **v0.3.0** - Batch publishing + delayed messages
- **v0.4.0** - NATS, Kafka adapters
- **v0.5.0** - Testing tools + CLI
- **v1.0.0** - Stable release

See [docs/ROADMAP.md](./docs/ROADMAP.md) for details.

---

## 🤝 Contributing

Contributions welcome! Areas that need help:

1. **Adapters** - NATS, Kafka, RabbitMQ implementations
2. **Tests** - Unit, integration, e2e coverage
3. **Documentation** - More examples, guides, tutorials
4. **Validators** - Zod, Yup support (in addition to TypeBox)
5. **Features** - Batch processing, retry strategies, circuit breakers

---

## 📄 License

MIT © [carlos.eduardo.br@gmail.com](mailto:carlos.eduardo.br@gmail.com)

---

## 🙏 Credits

- Inspired by messaging patterns from distributed systems
- Built for the [Elysia](https://elysiajs.com) ecosystem
- Powered by [TypeBox](https://github.com/sinclairzx81/typebox) for validation

---

**Questions?** Open an issue or check the [UPGRADE-GUIDE.md](./UPGRADE-GUIDE.md)
