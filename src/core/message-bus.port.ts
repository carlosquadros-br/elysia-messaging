import type { MessageEnvelope } from './message-envelope'
import type { TopicName } from './topics'

/**
 * Port for publishing messages (Clean Architecture)
 * Implementation will be Redis Streams, NATS, etc.
 */
export interface MessageBus {
  /**
   * Publish a message to a topic
   * Fire-and-forget, no blocking
   */
  publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>): Promise<void>

  /**
   * Graceful shutdown
   */
  close(): Promise<void>
}

/**
 * Options for publishing
 */
export interface PublishOptions {
  /** Delay message delivery by N milliseconds */
  delayMs?: number

  /** Priority (if supported by transport) */
  priority?: number
}

