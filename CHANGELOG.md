# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-12-23

### 🎉 Major Release: Redis Streams Adapters Fully Implemented

This release completes the Redis Streams implementation, making the plugin **production-ready**!

### Added

- ✅ **Redis Streams Adapter Complete**
  - `RedisStreamsBus.publish()` - Fully implemented with `XADD`
  - `RedisStreamsConsumer.subscribe()` - Fully implemented with `XREADGROUP`
  - `RedisDedupeStore` - Fully implemented with Redis `SET` + TTL
  - Consumer group auto-creation with `XGROUP CREATE`
  - Automatic ACK with `XACK` after successful processing
  - Batch processing (10 messages per batch)
  - Background consumer loop with configurable block time
  - Proper message parsing from Redis fields to MessageEnvelope
  - Retry logic (messages stay in pending on failure)
  - DLQ support for messages exceeding max retries

### Implementation Details

**RedisStreamsBus:**
```typescript
// Publishes to Redis Streams with XADD
await bus.publish(topic, envelope)
// → XADD stream:topic * eventId ... payload ...
```

**RedisStreamsConsumer:**
```typescript
// Consumes with XREADGROUP in background loop
await consumer.subscribe(topic, handler, { consumerGroup, consumerName })
// → XREADGROUP GROUP group consumer COUNT 10 BLOCK 5000 STREAMS stream:topic >
// → Processes messages
// → XACK stream:topic group messageId
```

**RedisDedupeStore:**
```typescript
// Idempotency with Redis SET
await dedupe.mark(eventId, ttl)
// → SETEX dedupe:eventId ttl 1
```

### Changed

- Updated version to 0.3.0
- No breaking changes from 0.2.0

---

## [0.2.0] - 2025-12-23

### 🎉 Major Release: Production-Grade Refactor

This release transforms `elysia-messaging` into a senior-level, production-ready OSS plugin.

### Added

- ✅ **TypeBox Validation**: Properly implemented using `Value.Check()` and `Value.Errors()`
  - Throws `ValidationError` with detailed path/message information
  - No more "not implemented" placeholder errors

- ✅ **Enhanced Handler Context**: New handler signature with messaging injection
  - Handlers can now publish messages directly via `messaging` context
  - Access to current `attempt` number
  - Backwards compatible with legacy `handler(envelope)` signature

- ✅ **OO Consumer Support**: Class-based consumers for production apps
  - New `Consumer<TRegistry, TTopic>` interface
  - `createConsumerFromClass()` helper function
  - Supports dependency injection and state management

- ✅ **Dynamic Group/Name Resolution**: Runtime flexibility
  - `group` can be `string | (topic) => string`
  - `name` can be `string | () => string`
  - Perfect for multi-instance deployments

- ✅ **Auto-Pick MessageType**: Automatic from registry
  - Define `messageType` once in topic definition
  - Automatically used on publish
  - No manual envelope creation needed

### Fixed

- 🐛 **onPublishError Hook**: Now receives envelope instead of payload
  - `createPublishFunction()` returns the envelope
  - `onPublish` receives the real envelope
  - `onPublishError` receives envelope (or fallback context)

- 🐛 **Safe Attempt Handling**: Defaults to 0 if undefined
  - `envelope.attempts ?? 0` prevents NaN
  - Envelope attempts updated per retry for accurate hook reporting

### Changed

- ⚠️ **BREAKING**: Redis Streams adapters moved to subpath export
  ```diff
  - import { RedisStreamsBus } from 'elysia-messaging'
  + import { RedisStreamsBus } from 'elysia-messaging/redis-streams'
  ```
  - **Why**: Keeps core broker-agnostic
  - **Migration**: One-line import change (see UPGRADE-GUIDE.md)

- 📦 **Package Structure**: ESM-only, cleaner exports
  - Version bumped to 0.2.0
  - Description updated: "broker-agnostic"
  - Only ships `dist/` (not `src/`)
  - Simplified exports (no CJS)

- 📝 **Documentation**: Updated and improved
  - Description now emphasizes broker-agnostic nature
  - Keywords updated
  - Examples show best practices

### Improved

- 🎯 **Developer Experience**
  - Full type inference preserved
  - Better error messages
  - Easier to publish from handlers
  - More flexible consumer patterns

- 📊 **Observability**
  - All hooks have correct, stable parameters
  - Envelope state tracked per attempt
  - Better error context

- 🏗️ **Architecture**
  - Clean separation: core vs adapters
  - Broker-agnostic design
  - No global singletons
  - Explicit dependency injection

### Documentation

- Added `UPGRADE-GUIDE.md` - Comprehensive migration guide
- Added `PUBLISHING.md` - Publishing checklist and commands
- Updated examples to show best practices
- Added inline documentation throughout

### Internal

- Handler signature detection via `handler.length`
- Messaging client injection from Elysia context
- Topic definition lookup for messageType
- Registry types refactored for clarity

---

## [0.1.0] - 2024-01-XX

### Initial Release

- Basic messaging plugin for Elysia
- Redis Streams adapter
- Topic registry with TypeBox schemas
- Consumer registration
- Idempotency support
- Retry logic
- Observability hooks

[0.2.0]: https://github.com/carlosquadros-br/elysia-messaging/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/carlosquadros-br/elysia-messaging/releases/tag/v0.1.0
