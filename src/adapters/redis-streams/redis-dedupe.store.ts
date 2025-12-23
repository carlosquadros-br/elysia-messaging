/**
 * Redis implementation of DedupeStore
 * Uses Redis SET with TTL for idempotency tracking
 */

import type { Redis } from 'ioredis'
import type { DedupeStore } from '../../core/dedupe-store.port'
import { REDIS_PREFIXES, RedisStreams } from './redis-streams.constants'

export class RedisDedupeStore implements DedupeStore {
  constructor(private readonly redis: Redis) {}

  async has(eventId: string): Promise<boolean> {
    // TODO: Check if key exists in Redis
    const key = this.getKey(eventId)
    // const exists = await this.redis.exists(key)
    // return exists === 1

    console.log(`[RedisDedupeStore] Checking if ${eventId} exists`)
    throw new Error('Not implemented yet')
  }

  async mark(eventId: string, ttlSeconds = RedisStreams.DEFAULTS.DEDUPE_TTL_SECONDS): Promise<void> {
    // TODO: Set key with TTL
    const key = this.getKey(eventId)
    // await this.redis.setex(key, ttlSeconds, '1')

    console.log(`[RedisDedupeStore] Marking ${eventId} as processed (TTL: ${ttlSeconds}s)`)
    throw new Error('Not implemented yet')
  }

  async remove(eventId: string): Promise<void> {
    // TODO: Delete key from Redis
    const key = this.getKey(eventId)
    // await this.redis.del(key)

    console.log(`[RedisDedupeStore] Removing ${eventId}`)
    throw new Error('Not implemented yet')
  }

  async close(): Promise<void> {
    // Redis connection is managed externally
    console.log('[RedisDedupeStore] Closing...')
  }

  private getKey(eventId: string): string {
    return `${REDIS_PREFIXES.DEDUPE}${eventId}`
  }
}

