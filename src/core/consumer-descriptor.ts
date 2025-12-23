/**
 * Type-safe consumer descriptor
 */

import type { MessageEnvelope } from './message-envelope'
import type { TopicRegistry, TopicName, TopicPayload } from './registry.types'

/**
 * Consumer configuration options
 */
export interface ConsumerOptions {
  /** Maximum retry attempts before DLQ */
  maxRetries?: number
  
  /** Delay between retries (ms) */
  retryDelayMs?: number
  
  /** Block time when waiting for messages (ms) */
  blockMs?: number
  
  /** Skip invalid payloads (log + ack) instead of throwing */
  skipInvalidPayload?: boolean
  
  /** Enable idempotency checking via dedupe store */
  idempotency?: boolean
  
  /** Custom dedupe TTL (seconds, default 24h) */
  dedupeTtl?: number
  
  /** Start reading from this message ID */
  startId?: string
  
  /** Additional metadata for logging/metrics */
  metadata?: Record<string, any>
}

/**
 * Handler context with enhanced capabilities
 */
export interface HandlerContext<TPayload = any, TMessaging = any> {
  /** Message envelope */
  envelope: MessageEnvelope<TPayload>
  
  /** Current attempt number (1-based) */
  attempt: number
  
  /** Messaging client for publishing (if available) */
  messaging?: TMessaging
}

/**
 * Legacy handler signature (backwards compatible)
 */
export type LegacyConsumerHandler<TPayload = any> = (
  envelope: MessageEnvelope<TPayload>
) => Promise<void> | void

/**
 * Enhanced handler signature with context
 */
export type EnhancedConsumerHandler<TPayload = any, TMessaging = any> = (
  ctx: HandlerContext<TPayload, TMessaging>
) => Promise<void> | void

/**
 * Consumer handler function (typed by topic)
 * Supports both legacy and enhanced signatures
 */
export type ConsumerHandler<TPayload = any, TMessaging = any> = 
  | LegacyConsumerHandler<TPayload>
  | EnhancedConsumerHandler<TPayload, TMessaging>

/**
 * Consumer descriptor (before registration)
 */
export interface ConsumerDescriptor<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
> {
  /** Topic to consume from */
  topic: TTopic
  
  /** Consumer group name */
  group: string
  
  /** Unique consumer name within group */
  name: string
  
  /** Message handler (typed by topic payload) */
  handler: ConsumerHandler<TopicPayload<TRegistry, TTopic>>
  
  /** Consumer options */
  options?: ConsumerOptions
  
  /** Internal: reference to registry */
  __registry: TRegistry
}

/**
 * Create a type-safe consumer descriptor
 * 
 * @example
 * ```ts
 * const consumer = createConsumer(registry, {
 *   topic: 'video.jobs',
 *   group: 'video-workers',
 *   name: 'worker-1',
 *   async handler(envelope) {
 *     // envelope.payload is typed based on 'video.jobs' schema
 *     console.log(envelope.payload.videoId)
 *   },
 * })
 * ```
 */
export function createConsumer<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
>(
  registry: TRegistry,
  descriptor: Omit<ConsumerDescriptor<TRegistry, TTopic>, '__registry'>
): ConsumerDescriptor<TRegistry, TTopic> {
  return {
    ...descriptor,
    __registry: registry,
  } as ConsumerDescriptor<TRegistry, TTopic>
}

/**
 * OO-style consumer interface (recommended for production)
 */
export interface Consumer<TRegistry extends TopicRegistry<any>, TTopic extends TopicName<TRegistry>> {
  /** Topic to consume from */
  readonly topic: TTopic
  
  /** Consumer group name (can be dynamic) */
  readonly group: string | ((topic: TTopic) => string)
  
  /** Consumer name (can be dynamic) */
  readonly name: string | (() => string)
  
  /** Consumer options */
  readonly options?: ConsumerOptions
  
  /** Handle message */
  handle(ctx: HandlerContext<TopicPayload<TRegistry, TTopic>, any>): Promise<void> | void
}

/**
 * Create consumer descriptor from class instance (OO style)
 * 
 * @example
 * ```ts
 * class VideoJobConsumer implements Consumer<typeof registry, 'video.jobs'> {
 *   readonly topic = 'video.jobs' as const
 *   readonly group = 'video-workers'
 *   readonly name = () => `worker-${process.pid}`
 *   
 *   async handle({ envelope, messaging }) {
 *     // Process video...
 *     
 *     // Publish result
 *     await messaging.publish('video.results', { ... })
 *   }
 * }
 * 
 * const descriptor = createConsumerFromClass(registry, new VideoJobConsumer())
 * ```
 */
export function createConsumerFromClass<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
>(
  registry: TRegistry,
  consumer: Consumer<TRegistry, TTopic>
): ConsumerDescriptor<TRegistry, TTopic> {
  const group = typeof consumer.group === 'function' 
    ? consumer.group(consumer.topic)
    : consumer.group
    
  const name = typeof consumer.name === 'function'
    ? consumer.name()
    : consumer.name

  return {
    topic: consumer.topic,
    group,
    name,
    handler: consumer.handle.bind(consumer),
    options: consumer.options,
    __registry: registry,
  } as ConsumerDescriptor<TRegistry, TTopic>
}

/**
 * Type guard to check if value is a consumer descriptor
 */
export function isConsumerDescriptor(value: unknown): value is ConsumerDescriptor<any, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'topic' in value &&
    'group' in value &&
    'name' in value &&
    'handler' in value &&
    '__registry' in value
  )
}

