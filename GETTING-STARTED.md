# Getting Started with elysia-messaging Development

Welcome! This guide will help you complete the implementation of the ElysiaJS messaging plugin.

## 📁 Project Structure

```
elysia-messaging/
├── src/
│   ├── core/                    # Port interfaces (contracts)
│   │   ├── message-envelope.ts   # Message structure
│   │   ├── message-bus.port.ts   # Publish interface
│   │   ├── message-consumer.port.ts # Subscribe interface
│   │   ├── dedupe-store.port.ts  # Idempotency interface
│   │   └── topics.ts             # Topic definitions
│   │
│   ├── adapters/                # Implementations
│   │   └── redis-streams/
│   │       ├── redis-streams.bus.ts      # ⚠️ TODO: Implement XADD
│   │       ├── redis-streams.consumer.ts # ⚠️ TODO: Implement XREADGROUP
│   │       ├── redis-dedupe.store.ts     # ⚠️ TODO: Implement SET/GET
│   │       └── redis-streams.constants.ts # Configuration
│   │
│   ├── plugin.ts                # ⚠️ TODO: Wire up the implementations
│   ├── index.ts                 # Main entry point
│   │
│   └── examples/                # Usage examples
│       ├── basic-usage.ts       # Simple pub/sub example
│       └── advanced-usage.ts    # Multiple consumers example
│
├── package.json                 # ✅ Configured with versioning
├── tsconfig.json                # ✅ Strict TypeScript config
├── CHANGELOG.md                 # ✅ Version history
└── README.md                    # ✅ Complete documentation
```

## 🚀 Next Steps

### 1. Install Dependencies

```bash
cd elysia-messaging
npm install
# or
pnpm install
# or
bun install
```

### 2. Implement Redis Streams Bus (Priority 1)

**File:** `src/adapters/redis-streams/redis-streams.bus.ts`

**What to do:**
- Uncomment the `xadd` line in the `publish` method
- Test publishing messages to Redis Streams

**Redis Command:**
```typescript
await this.redis.xadd(
  streamKey, 
  RedisStreams.IDS.AUTO, 
  ...Object.entries(fields).flat()
)
```

**Test it:**
```bash
# In Redis CLI
XLEN stream:video.jobs
XRANGE stream:video.jobs - +
```

### 3. Implement Redis Dedupe Store (Priority 2)

**File:** `src/adapters/redis-streams/redis-dedupe.store.ts`

**What to do:**
- Implement `has()` - check if key exists
- Implement `mark()` - set key with TTL
- Implement `remove()` - delete key

**Redis Commands:**
```typescript
// has()
const exists = await this.redis.exists(key)
return exists === 1

// mark()
await this.redis.setex(key, ttlSeconds, '1')

// remove()
await this.redis.del(key)
```

### 4. Implement Redis Streams Consumer (Priority 3)

**File:** `src/adapters/redis-streams/redis-streams.consumer.ts`

**What to do:**
- Create consumer group with `XGROUP CREATE`
- Implement the consumption loop with `XREADGROUP`
- Handle retries and DLQ
- Acknowledge messages with `XACK`

**Redis Commands:**
```typescript
// Create consumer group (once)
try {
  await this.redis.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM')
} catch (error) {
  // Group already exists, ignore
}

// Read messages
const results = await this.redis.xreadgroup(
  'GROUP', consumerGroup, consumerName,
  'BLOCK', blockMs,
  'COUNT', 10,
  'STREAMS', streamKey, '>'
)

// Acknowledge message
await this.redis.xack(streamKey, consumerGroup, messageId)
```

**Consumption Loop:**
```typescript
this.isRunning = true
while (this.isRunning) {
  try {
    const results = await this.redis.xreadgroup(...)
    
    if (results && results.length > 0) {
      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          try {
            const envelope = this.parseMessage(fields)
            await handler(envelope)
            await this.redis.xack(streamKey, consumerGroup, messageId)
          } catch (error) {
            // Handle retry logic
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

### 5. Wire Up the Plugin (Priority 4)

**File:** `src/plugin.ts`

**What to do:**
- Instantiate `RedisStreamsBus`, `RedisStreamsConsumer`, and `RedisDedupeStore`
- Implement the `publish()` and `subscribe()` methods
- Implement the `close()` method to cleanup

**Example:**
```typescript
export const messaging = (config: MessagingConfig) => {
  const bus = new RedisStreamsBus(config.redis)
  const consumer = new RedisStreamsConsumer(config.redis, config.dlqTopic)
  const dedupe = new RedisDedupeStore(config.redis)

  return new Elysia({
    name: 'elysia-messaging',
    seed: config,
  })
    .decorate('messaging', {
      bus,
      consumer,
      dedupe,

      async publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>) {
        return bus.publish(topic, envelope)
      },

      async subscribe<T>(...args) {
        return consumer.subscribe(...args)
      },

      async close() {
        await Promise.all([
          bus.close(),
          consumer.close(),
          dedupe.close()
        ])
      }
    })
    .onStop(async ({ messaging }) => {
      await messaging.close()
    })
}
```

### 6. Test Your Implementation

**Run the basic example:**
```bash
npm run build
node dist/examples/basic-usage.js
```

**Test publishing:**
```bash
curl -X POST http://localhost:3000/video/process \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "video-123",
    "url": "https://example.com/video.mp4",
    "userId": "user-456"
  }'
```

**Check Redis:**
```bash
redis-cli

# Check if stream exists
XLEN stream:video.jobs

# Read messages
XRANGE stream:video.jobs - +

# Check consumer groups
XINFO GROUPS stream:video.results
```

### 7. Add Tests (Optional but Recommended)

Create a `tests/` folder and add:
- Unit tests for each adapter
- Integration tests with a test Redis instance
- End-to-end tests with the plugin

## 📚 Reference Implementation

You can refer to your original Clipify messaging package for implementation details:
- `clipify/packages/messaging/src/adapters/redis-streams/`

The structure is the same, you just need to adapt it for the ElysiaJS plugin system.

## 🔄 Version Management

Follow semantic versioning:
- **Patch (0.1.1)**: Bug fixes
- **Minor (0.2.0)**: New features, backward compatible
- **Major (1.0.0)**: Breaking changes

Update `CHANGELOG.md` for each release.

## 📦 Publishing

When ready to publish:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Build the package: `npm run build`
4. Test locally: `npm link`
5. Publish: `npm publish`

## 🆘 Need Help?

- ElysiaJS Docs: https://elysiajs.com/plugins/overview.html
- Redis Streams: https://redis.io/docs/data-types/streams/
- Your Clipify implementation: `clipify/packages/messaging/`

## ✅ Checklist

- [ ] Install dependencies
- [ ] Implement `RedisStreamsBus.publish()`
- [ ] Implement `RedisDedupeStore` methods
- [ ] Implement `RedisStreamsConsumer.subscribe()`
- [ ] Wire up plugin in `src/plugin.ts`
- [ ] Test with examples
- [ ] Add error handling
- [ ] Add DLQ support
- [ ] Write tests
- [ ] Update documentation
- [ ] Publish to npm

Good luck! 🚀

