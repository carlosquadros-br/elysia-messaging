/**
 * Type-safe publisher helpers
 */

import type { MessageEnvelope } from './message-envelope'
import { createEnvelope } from './message-envelope'
import type { TopicRegistry, TopicName, TopicPayload, TopicMessageType } from './registry.types'
import type { MessageBus } from './message-bus.port'
import { validateTopicPayload, getTopicDefinition } from './registry'

/**
 * Publisher options
 */
export interface PublisherOptions {
  /** Validate payload before publishing (default: true) */
  validate?: boolean
  
  /** Custom correlation ID */
  correlationId?: string
  
  /** Custom causation ID */
  causationId?: string
  
  /** Delay delivery (if supported by broker) */
  delayMs?: number
}

/**
 * Type-safe publisher function for a specific topic
 */
export type Publisher<TPayload = any> = (
  payload: TPayload,
  meta?: {
    jobId?: string
    correlationId?: string
    causationId?: string
  }
) => Promise<void>

/**
 * Publisher descriptor (configuration)
 */
export interface PublisherDescriptor<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
> {
  /** Topic to publish to */
  topic: TTopic
  
  /** Message bus adapter */
  bus: MessageBus
  
  /** Registry reference */
  __registry: TRegistry
  
  /** Default options */
  defaultOptions?: PublisherOptions
}

/**
 * Create a type-safe publisher for a specific topic
 * 
 * @example
 * ```ts
 * const publishVideoJob = createPublisher(registry, {
 *   topic: 'video.jobs',
 *   bus: redisStreamsBus,
 * })
 * 
 * // Usage: fully typed
 * await publishVideoJob({
 *   videoId: '123',
 *   url: 'https://...',
 *   userId: 'user-456',
 * })
 * ```
 */
export function createPublisher<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
>(
  registry: TRegistry,
  config: Omit<PublisherDescriptor<TRegistry, TTopic>, '__registry'>
): Publisher<TopicPayload<TRegistry, TTopic>> {
  const { topic, bus, defaultOptions = {} } = config
  const definition = getTopicDefinition(registry, topic)

  return async (
    payload: TopicPayload<TRegistry, TTopic>,
    meta?: {
      jobId?: string
      correlationId?: string
      causationId?: string
    }
  ) => {
    // Validate payload if enabled
    if (defaultOptions.validate !== false) {
      validateTopicPayload(registry, topic, payload)
    }

    // Create envelope with proper messageType from registry
    const envelope = createEnvelope(
      definition.messageType || topic,
      meta?.jobId || crypto.randomUUID(),
      payload,
      {
        correlationId: meta?.correlationId || defaultOptions.correlationId,
        causationId: meta?.causationId || defaultOptions.causationId,
      }
    )

    // Publish via bus
    await bus.publish(topic, envelope)
  }
}

/**
 * Create a generic publish function bound to a registry
 * (used internally by the plugin decorator)
 */
export function createPublishFunction<TRegistry extends TopicRegistry<any>>(
  registry: TRegistry,
  bus: MessageBus,
  options: PublisherOptions = {}
) {
  return async <TTopic extends TopicName<TRegistry>>(
    topic: TTopic,
    payload: TopicPayload<TRegistry, TTopic>,
    meta?: {
      jobId?: string
      correlationId?: string
      causationId?: string
    }
  ): Promise<MessageEnvelope<TopicPayload<TRegistry, TTopic>>> => {
    // Validate payload if enabled
    if (options.validate !== false) {
      validateTopicPayload(registry, topic, payload)
    }

    // Get topic definition for messageType
    const definition = getTopicDefinition(registry, topic)

    // Create envelope with proper messageType from registry
    const envelope = createEnvelope(
      definition.messageType || topic,
      meta?.jobId || crypto.randomUUID(),
      payload,
      {
        correlationId: meta?.correlationId || options.correlationId,
        causationId: meta?.causationId || options.causationId,
      }
    )

    // Publish via bus
    await bus.publish(topic, envelope)
    
    // Return envelope for hooks
    return envelope
  }
}

