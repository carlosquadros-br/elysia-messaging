/**
 * Messaging client plugin (for publishers)
 * Injects bus/publisher into Elysia context
 */

import { Elysia } from 'elysia'
import type { MessageBus } from './core/message-bus.port'
import type { DedupeStore } from './core/dedupe-store.port'
import type { TopicRegistry, TopicName, TopicPayload } from './core/registry.types'
import { createPublishFunction } from './core/publisher-helper'

/**
 * Messaging client configuration
 */
export interface MessagingClientConfig<TRegistry extends TopicRegistry<any>> {
  /** Topic registry */
  registry: TRegistry

  /** Message bus adapter (or resolver) */
  bus: MessageBus | BusResolver<TRegistry>

  /** Optional dedupe store for idempotency */
  dedupe?: DedupeStore

  /** Hooks for observability */
  hooks?: {
    onPublish?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: any
    ) => Promise<void> | void

    onPublishError?: <TTopic extends TopicName<TRegistry>>(
      topic: TTopic,
      envelope: any,
      error: Error
    ) => Promise<void> | void
  }

  /** Plugin name (for multiple instances) */
  name?: string
}

/**
 * Bus resolver function (multi-broker support)
 */
export type BusResolver<TRegistry extends TopicRegistry<any>> = (
  topic: TopicName<TRegistry>
) => MessageBus

/**
 * Messaging service interface (exposed via decorator)
 */
export interface MessagingClient<TRegistry extends TopicRegistry<any>> {
  /** Topic registry */
  registry: TRegistry

  /** Publish a message to a topic (type-safe) */
  publish<TTopic extends TopicName<TRegistry>>(
    topic: TTopic,
    payload: TopicPayload<TRegistry, TTopic>,
    meta?: {
      jobId?: string
      correlationId?: string
      causationId?: string
    }
  ): Promise<void>

  /** Get the bus for a topic */
  getBus(topic: TopicName<TRegistry>): MessageBus

  /** Optional dedupe store */
  dedupe?: DedupeStore
}

/**
 * Messaging client plugin
 * 
 * Provides type-safe message publishing via decorator
 * 
 * @example
 * ```ts
 * const app = new Elysia()
 *   .use(messaging({ registry: myTopics, bus: redisStreamsBus }))
 *   .post('/publish', async ({ messaging }) => {
 *     await messaging.publish('video.jobs', { videoId: '123' })
 *   })
 * ```
 */
export const messaging = <TRegistry extends TopicRegistry<any>>(
  config: MessagingClientConfig<TRegistry>
) => {
  const { registry, bus, dedupe, hooks, name = 'messaging' } = config

  // Resolve bus (single or resolver)
  const getBus = (topic: TopicName<TRegistry>): MessageBus => {
    if (typeof bus === 'function') {
      return bus(topic)
    }
    return bus
  }

  // Create publish function with hooks
  const publishWithHooks = async <TTopic extends TopicName<TRegistry>>(
    topic: TTopic,
    payload: TopicPayload<TRegistry, TTopic>,
    meta?: {
      jobId?: string
      correlationId?: string
      causationId?: string
    }
  ): Promise<void> => {
    const selectedBus = getBus(topic)
    const publish = createPublishFunction(registry, selectedBus, {
      validate: true,
    })

    let envelope: any
    try {
      // Call publish and capture envelope
      envelope = await publish(topic, payload, meta)

      // Hook: onPublish (receives the real envelope)
      if (hooks?.onPublish) {
        await hooks.onPublish(topic, envelope)
      }
    } catch (error) {
      // Hook: onPublishError (receives envelope if available, or fallback context)
      if (hooks?.onPublishError) {
        const errorContext = envelope || {
          topic,
          payload,
          meta,
          error: error as Error,
        }
        await hooks.onPublishError(topic, errorContext, error as Error)
      }
      throw error
    }
  }

  // Create messaging client
  const client: MessagingClient<TRegistry> = {
    registry,
    publish: publishWithHooks as any,
    getBus,
    dedupe,
  }

  return new Elysia({
    name: `elysia-messaging:client${name !== 'messaging' ? `:${name}` : ''}`,
    seed: config,
  })
    .decorate(name, client)
    .onStop(async (ctx) => {
      // Graceful shutdown
      console.log('[Messaging Client] Shutting down...')
      
      // Close bus connections
      if (typeof bus === 'function') {
        // Can't close all, user manages lifecycle
      } else {
        await bus.close()
      }
      
      // Close dedupe store
      if (dedupe) {
        await dedupe.close()
      }
    })
}

/**
 * Type helper for inferring messaging decorator
 */
export type MessagingDecorator<TRegistry extends TopicRegistry<any>> = {
  messaging: MessagingClient<TRegistry>
}

