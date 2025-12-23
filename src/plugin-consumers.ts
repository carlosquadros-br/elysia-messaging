/**
 * Messaging consumers plugin (for workers)
 * Registers and manages consumer lifecycle
 */

import { Elysia } from 'elysia'
import type { MessageConsumer } from './core/message-consumer.port'
import type { DedupeStore } from './core/dedupe-store.port'
import type { ConsumerDescriptor, HandlerContext } from './core/consumer-descriptor'
import { createConsumer, createConsumerFromClass } from './core/consumer-descriptor'
import type { TopicRegistry, TopicName } from './core/registry.types'
import { validateTopicPayload } from './core/registry'
import type { MessageEnvelope } from './core/message-envelope'
import type { MessagingClient } from './plugin-client'

// Re-export createConsumer and createConsumerFromClass for convenience
export { createConsumer, createConsumerFromClass }

/**
 * Messaging consumers configuration
 */
export interface MessagingConsumersConfig<TRegistry extends TopicRegistry<any>> {
  /** List of consumer descriptors */
  consumers: ConsumerDescriptor<TRegistry, any>[]

  /** Message consumer adapter (or resolver) */
  consumer: MessageConsumer | ConsumerResolver<TRegistry>

  /** Optional dedupe store for idempotency */
  dedupe?: DedupeStore

  /** Hooks for observability */
  hooks?: {
    onMessage?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: MessageEnvelope<any>
    ) => Promise<void> | void

    onError?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: MessageEnvelope<any>,
      error: Error,
      attempt: number
    ) => Promise<void> | void

    onRetry?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: MessageEnvelope<any>,
      attempt: number
    ) => Promise<void> | void

    onDLQ?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: MessageEnvelope<any>,
      error: Error
    ) => Promise<void> | void

    onAck?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: MessageEnvelope<any>
    ) => Promise<void> | void
  }

  /** Plugin name */
  name?: string
}

/**
 * Consumer resolver (multi-client support)
 */
export type ConsumerResolver<TRegistry extends TopicRegistry<any>> = (
  topic: TopicName<TRegistry>
) => MessageConsumer

/**
 * Messaging consumers plugin
 * 
 * Registers consumers and manages their lifecycle (start/stop)
 * 
 * @example
 * ```ts
 * const consumer = createConsumer(registry, {
 *   topic: 'video.jobs',
 *   group: 'workers',
 *   name: 'worker-1',
 *   async handler(envelope) {
 *     console.log(envelope.payload.videoId)
 *   },
 * })
 * 
 * const app = new Elysia()
 *   .use(messagingConsumers({
 *     consumers: [consumer],
 *     consumer: redisStreamsConsumer,
 *   }))
 * ```
 */
export const messagingConsumers = <TRegistry extends TopicRegistry<any>>(
  config: MessagingConsumersConfig<TRegistry>
) => {
  const { consumers, consumer: consumerAdapter, dedupe, hooks, name = 'consumers' } = config

  // Resolve consumer adapter
  const getConsumer = (topic: TopicName<TRegistry>): MessageConsumer => {
    if (typeof consumerAdapter === 'function') {
      return consumerAdapter(topic)
    }
    return consumerAdapter
  }

  // Wrap handler with validation, hooks, and idempotency
  const wrapHandler = <TTopic extends TopicName<TRegistry>>(
    descriptor: ConsumerDescriptor<TRegistry, TTopic>,
    messagingClient?: MessagingClient<TRegistry>
  ) => {
    const { topic, handler, options = {}, __registry: registry } = descriptor

    return async (envelope: MessageEnvelope<any>) => {
      // Hook: onMessage
      if (hooks?.onMessage) {
        await hooks.onMessage(topic, envelope)
      }

      // Idempotency check
      if (options.idempotency && dedupe) {
        if (await dedupe.has(envelope.eventId)) {
          console.log(`[Consumer] Duplicate message skipped: ${envelope.eventId}`)
          
          // Hook: onAck (already processed)
          if (hooks?.onAck) {
            await hooks.onAck(topic, envelope)
          }
          
          return
        }
      }

      // Validate payload
      try {
        validateTopicPayload(registry, topic, envelope.payload)
      } catch (error) {
        if (options.skipInvalidPayload) {
          console.error(`[Consumer] Invalid payload, skipping:`, error)
          
          // Hook: onAck (skipped)
          if (hooks?.onAck) {
            await hooks.onAck(topic, envelope)
          }
          
          return
        }
        throw error
      }

      // Execute handler with retry logic
      // Safely handle undefined attempts (default to 0)
      const baseAttempts = envelope.attempts ?? 0
      let attempt = baseAttempts + 1
      const maxRetries = options.maxRetries ?? 3

      while (attempt <= maxRetries) {
        try {
          // Update envelope attempts for this iteration (for hooks)
          const envelopeWithAttempt = { ...envelope, attempts: attempt }

          // Detect handler signature and call appropriately
          const handlerContext: HandlerContext<any, typeof messagingClient> = {
            envelope: envelopeWithAttempt,
            attempt,
            messaging: messagingClient,
          }

          // Try to detect signature by checking handler.length or just calling with context
          // If handler expects single param (legacy), pass envelope; otherwise pass context
          if (handler.length === 1) {
            // Legacy signature: handler(envelope)
            await (handler as any)(envelopeWithAttempt)
          } else {
            // Enhanced signature: handler({ envelope, attempt, messaging })
            await (handler as any)(handlerContext)
          }

          // Mark as processed
          if (options.idempotency && dedupe) {
            await dedupe.mark(envelope.eventId, options.dedupeTtl)
          }

          // Hook: onAck
          if (hooks?.onAck) {
            await hooks.onAck(topic, envelopeWithAttempt)
          }

          return
        } catch (error) {
          console.error(`[Consumer] Handler failed (attempt ${attempt}/${maxRetries}):`, error)

          // Hook: onError (with current attempt in envelope)
          if (hooks?.onError) {
            await hooks.onError(topic, { ...envelope, attempts: attempt }, error as Error, attempt)
          }

          if (attempt < maxRetries) {
            // Hook: onRetry
            if (hooks?.onRetry) {
              await hooks.onRetry(topic, { ...envelope, attempts: attempt }, attempt)
            }

            // Delay before retry (can be enhanced with backoff strategy later)
            if (options.retryDelayMs) {
              await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs))
            }

            attempt++
          } else {
            // Max retries exceeded, send to DLQ
            console.error(`[Consumer] Max retries exceeded, sending to DLQ`)

            // Hook: onDLQ
            if (hooks?.onDLQ) {
              await hooks.onDLQ(topic, { ...envelope, attempts: attempt }, error as Error)
            }

            throw error
          }
        }
      }
    }
  }

  return new Elysia({
    name: `elysia-messaging:consumers${name !== 'consumers' ? `:${name}` : ''}`,
    seed: config,
  })
    .onStart(async (ctx) => {
      console.log(`[Messaging Consumers] Starting ${consumers.length} consumer(s)...`)

      // Try to get messaging client from context (if available)
      const messagingClient = (ctx as any).messaging

      // Register all consumers
      for (const descriptor of consumers) {
        const { topic, group, name: consumerName, options = {} } = descriptor
        const adapter = getConsumer(topic)
        const wrappedHandler = wrapHandler(descriptor, messagingClient)

        console.log(`[Messaging Consumers] Registering: ${topic} (${group}/${consumerName})`)

        await adapter.subscribe(topic, wrappedHandler, {
          consumerGroup: group,
          consumerName,
          maxRetries: options.maxRetries,
          blockMs: options.blockMs,
          startId: options.startId,
        })
      }

      console.log(`[Messaging Consumers] All consumers started`)
    })
    .onStop(async () => {
      console.log(`[Messaging Consumers] Stopping...`)

      // Close consumer adapter
      if (typeof consumerAdapter !== 'function') {
        await consumerAdapter.close()
      }

      // Close dedupe store
      if (dedupe) {
        await dedupe.close()
      }

      console.log(`[Messaging Consumers] Stopped`)
    })
}

