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
    const streamKey = `${REDIS_PREFIXES.STREAM}${topic}`
    const { 
      consumerGroup, 
      consumerName, 
      maxRetries = RedisStreams.DEFAULTS.MAX_RETRIES,
      blockMs = RedisStreams.DEFAULTS.BLOCK_MS,
      startId = '>'
    } = options

    console.log(`[RedisStreamsConsumer] Subscribing to ${streamKey}`)
    console.log(`  Consumer Group: ${consumerGroup}`)
    console.log(`  Consumer Name: ${consumerName}`)

    // Create consumer group if it doesn't exist
    try {
      await this.redis.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM')
      console.log(`[RedisStreamsConsumer] Created consumer group: ${consumerGroup}`)
    } catch (error: any) {
      if (error.message && !error.message.includes('BUSYGROUP')) {
        console.error(`[RedisStreamsConsumer] Error creating group:`, error)
      }
      // Group already exists, that's fine
    }

    // Start consuming loop in background
    this.isRunning = true
    this.consumeLoop(streamKey, consumerGroup, consumerName, handler, blockMs, maxRetries)
  }

  /**
   * Main consumer loop
   */
  private async consumeLoop<T>(
    streamKey: string,
    consumerGroup: string,
    consumerName: string,
    handler: MessageHandler<T>,
    blockMs: number,
    maxRetries: number
  ): Promise<void> {
    while (this.isRunning) {
      try {
        // Read from stream with XREADGROUP
        const results: any = await this.redis.xreadgroup(
          'GROUP',
          consumerGroup,
          consumerName,
          'COUNT',
          RedisStreams.DEFAULTS.BATCH_SIZE.toString(),
          'BLOCK',
          blockMs.toString(),
          'STREAMS',
          streamKey,
          '>'
        )

        if (!results || results.length === 0) {
          continue // No messages, loop again
        }

        // Process each message
        for (const streamData of results) {
          const [stream, messages] = streamData
          
          for (const messageData of messages) {
            const [messageId, fieldsArray] = messageData
            
            try {
              // Parse message
              const fieldsObj = this.fieldsToObject(fieldsArray as string[])
              const envelope = this.parseMessage<T>(fieldsObj)

              // Call handler
              await handler(envelope)

              // ACK message
              await this.redis.xack(streamKey, consumerGroup, messageId)
            } catch (error) {
              console.error(`[RedisStreamsConsumer] Handler error:`, error)
              
              // Check retry count
              const fieldsObj = this.fieldsToObject(fieldsArray as string[])
              const attempts = parseInt(fieldsObj.attempts || '0', 10)
              
              if (attempts >= maxRetries) {
                // Send to DLQ
                const envelope = this.parseMessage<T>(fieldsObj)
                await this.sendToDLQ(envelope, error as Error)
                
                // ACK to remove from pending
                await this.redis.xack(streamKey, consumerGroup, messageId)
              }
              // If not max retries, message stays in pending and will be redelivered
            }
          }
        }
      } catch (error) {
        console.error(`[RedisStreamsConsumer] Consumer loop error:`, error)
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait before retry
      }
    }
  }

  /**
   * Convert Redis fields array to object
   */
  private fieldsToObject(fields: string[]): Record<string, string> {
    const obj: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1]
    }
    return obj
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

