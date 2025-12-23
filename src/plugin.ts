/**
 * ElysiaJS Messaging Plugin
 * 
 * Adds event-driven messaging capabilities to Elysia applications
 * with Redis Streams support.
 */

import { Elysia } from 'elysia'
import type { Redis } from 'ioredis'
import type { MessageBus } from './core/message-bus.port'
import type { MessageConsumer, ConsumerOptions } from './core/message-consumer.port'
import type { DedupeStore } from './core/dedupe-store.port'
import type { MessageEnvelope } from './core/message-envelope'
import type { TopicName } from './core/topics'

/**
 * Plugin configuration options
 */
export interface MessagingConfig {
  /** Redis client instance */
  redis: Redis

  /** Topic definitions (optional, for type safety) */
  topics?: Record<string, string>

  /** Dead Letter Queue topic name */
  dlqTopic?: string

  /** Consumer configuration */
  consumer?: {
    /** Maximum retry attempts before sending to DLQ */
    maxRetries?: number
    /** Delay between retries in milliseconds */
    retryDelayMs?: number
    /** Block time when waiting for messages (ms) */
    blockMs?: number
  }

  /** Deduplication TTL in seconds */
  dedupeTtl?: number

  /** Plugin name (for multiple instances) */
  name?: string
}

/**
 * Messaging service interface exposed via decorator
 */
export interface MessagingService {
  /** Message bus for publishing */
  bus: MessageBus

  /** Message consumer for subscribing */
  consumer: MessageConsumer

  /** Deduplication store for idempotency */
  dedupe: DedupeStore

  /** Publish a message to a topic */
  publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>): Promise<void>

  /** Subscribe to messages from a topic */
  subscribe<T>(
    topic: TopicName | string,
    handler: (envelope: MessageEnvelope<T>) => Promise<void>,
    options?: ConsumerOptions
  ): Promise<void>

  /** Close all connections gracefully */
  close(): Promise<void>
}

/**
 * ElysiaJS Messaging Plugin
 * 
 * @example
 * ```ts
 * import { Elysia } from 'elysia'
 * import { messaging } from 'elysia-messaging'
 * import { Redis } from 'ioredis'
 * 
 * const app = new Elysia()
 *   .use(messaging({
 *     redis: new Redis('redis://localhost:6379')
 *   }))
 *   .post('/publish', async ({ messaging }) => {
 *     await messaging.publish('my-topic', envelope)
 *     return { success: true }
 *   })
 * ```
 */
export const messaging = (config: MessagingConfig) => {
  const pluginName = config.name || 'messaging'

  return new Elysia({
    name: `elysia-messaging${config.name ? `:${config.name}` : ''}`,
    seed: config,
  })
    .decorate(pluginName, {
      // TODO: Implement these services
      bus: null as unknown as MessageBus,
      consumer: null as unknown as MessageConsumer,
      dedupe: null as unknown as DedupeStore,

      async publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>) {
        // TODO: Implement publish logic
        throw new Error('Not implemented yet')
      },

      async subscribe<T>(
        topic: TopicName | string,
        handler: (envelope: MessageEnvelope<T>) => Promise<void>,
        options?: ConsumerOptions
      ) {
        // TODO: Implement subscribe logic
        throw new Error('Not implemented yet')
      },

      async close() {
        // TODO: Implement cleanup logic
        throw new Error('Not implemented yet')
      },
    } as MessagingService)
    .onStop(async (ctx) => {
      // Graceful shutdown
      try {
        const messaging = (ctx as any)[pluginName] as MessagingService
        await messaging.close()
      } catch (error) {
        console.error('Error closing messaging service:', error)
      }
    })
}

/**
 * Type helper for inferring messaging decorator
 */
export type MessagingDecorator = {
  messaging: MessagingService
}

// Re-export for convenience
export default messaging

