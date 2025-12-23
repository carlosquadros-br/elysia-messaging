import type { MessageEnvelope } from './message-envelope'
import type { TopicName } from './topics'

/**
 * Message handler function
 */
export type MessageHandler<T = unknown> = (
  envelope: MessageEnvelope<T>
) => Promise<void>

/**
 * Consumer options
 */
export interface ConsumerOptions {
  /** Consumer group name for load balancing */
  consumerGroup: string

  /** Unique consumer name within the group */
  consumerName: string

  /** Maximum retry attempts before sending to DLQ */
  maxRetries?: number

  /** Block time when waiting for messages (ms) */
  blockMs?: number

  /** Start reading from this message ID */
  startId?: string
}

/**
 * Port for consuming messages (Clean Architecture)
 */
export interface MessageConsumer {
  /**
   * Subscribe to a topic and process messages
   * @param topic Topic to subscribe to
   * @param handler Function to handle each message
   * @param options Consumer configuration
   */
  subscribe<T>(
    topic: TopicName | string,
    handler: MessageHandler<T>,
    options: ConsumerOptions
  ): Promise<void>

  /**
   * Stop consuming messages gracefully
   */
  close(): Promise<void>
}

