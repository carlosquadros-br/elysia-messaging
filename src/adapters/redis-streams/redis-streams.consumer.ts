/**
 * Redis Streams implementation of MessageConsumer
 */

import type { Redis } from 'ioredis'
import type { MessageConsumer, MessageHandler, ConsumerOptions } from '../../core/message-consumer.port'
import type { MessageEnvelope } from '../../core/message-envelope'
import type { TopicName } from '../../core/topics'
import { REDIS_PREFIXES, RedisStreams } from './redis-streams.constants'

export class RedisStreamsConsumer implements MessageConsumer {
  private isRunning = false
  private dlqTopic: string

  constructor(
    private readonly redis: Redis,
    dlqTopic?: string
  ) {
    this.dlqTopic = dlqTopic || 'default.dlq'
  }

  async subscribe<T>(
    topic: TopicName | string,
    handler: MessageHandler<T>,
    options: ConsumerOptions
  ): Promise<void> {
    // TODO: Implement Redis Streams XREADGROUP consumer
    const streamKey = `${REDIS_PREFIXES.STREAM}${topic}`
    const { consumerGroup, consumerName, maxRetries = RedisStreams.DEFAULTS.MAX_RETRIES } = options

    console.log(`[RedisStreamsConsumer] Subscribing to ${streamKey}`)
    console.log(`  Consumer Group: ${consumerGroup}`)
    console.log(`  Consumer Name: ${consumerName}`)

    // TODO: Create consumer group if it doesn't exist
    // try {
    //   await this.redis.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM')
    // } catch (error) {
    //   // Group already exists, that's fine
    // }

    // TODO: Start consuming loop
    // this.isRunning = true
    // while (this.isRunning) {
    //   // Read from stream with XREADGROUP
    //   // Parse messages and call handler
    //   // Handle retries and DLQ
    //   // ACK successful messages with XACK
    // }

    throw new Error('Not implemented yet')
  }

  async close(): Promise<void> {
    console.log('[RedisStreamsConsumer] Stopping...')
    this.isRunning = false
  }

  /**
   * Helper to parse Redis Stream message to MessageEnvelope
   */
  private parseMessage<T>(fields: Record<string, string>): MessageEnvelope<T> {
    return {
      eventId: fields.eventId,
      type: fields.type,
      jobId: fields.jobId,
      occurredAt: fields.occurredAt,
      version: parseInt(fields.version, 10),
      attempts: parseInt(fields.attempts, 10),
      correlationId: fields.correlationId,
      causationId: fields.causationId,
      payload: JSON.parse(fields.payload) as T,
    }
  }

  /**
   * Send message to Dead Letter Queue
   */
  private async sendToDLQ<T>(envelope: MessageEnvelope<T>, error: Error): Promise<void> {
    // TODO: Implement DLQ logic
    console.error('[RedisStreamsConsumer] Sending to DLQ:', envelope.eventId, error.message)
  }
}

