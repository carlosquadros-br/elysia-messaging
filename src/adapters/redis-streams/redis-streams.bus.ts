/**
 * Redis Streams implementation of MessageBus
 */

import type { Redis } from 'ioredis'
import type { MessageBus } from '../../core/message-bus.port'
import type { MessageEnvelope } from '../../core/message-envelope'
import type { TopicName } from '../../core/topics'
import { REDIS_PREFIXES, RedisStreams } from './redis-streams.constants'

export class RedisStreamsBus implements MessageBus {
  constructor(private readonly redis: Redis) {}

  async publish<T>(topic: TopicName | string, envelope: MessageEnvelope<T>): Promise<void> {
    const streamKey = `${REDIS_PREFIXES.STREAM}${topic}`

    // Serialize envelope to Redis fields
    const fields = {
      eventId: envelope.eventId,
      type: envelope.type,
      jobId: envelope.jobId,
      occurredAt: envelope.occurredAt,
      version: envelope.version.toString(),
      attempts: envelope.attempts.toString(),
      payload: JSON.stringify(envelope.payload),
      ...(envelope.correlationId && { correlationId: envelope.correlationId }),
      ...(envelope.causationId && { causationId: envelope.causationId }),
    }

    // Publish to Redis Stream with XADD
    await this.redis.xadd(
      streamKey,
      RedisStreams.IDS.AUTO,
      ...Object.entries(fields).flat()
    )

    console.log(`[RedisStreamsBus] Published to ${streamKey}:`, envelope.eventId)
  }

  async close(): Promise<void> {
    // Redis connection is managed externally, so we don't close it here
    console.log('[RedisStreamsBus] Closing...')
  }
}

