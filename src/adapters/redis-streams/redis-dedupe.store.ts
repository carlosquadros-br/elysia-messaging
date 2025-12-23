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
    const key = this.getKey(eventId)
    const exists = await this.redis.exists(key)
    return exists === 1
  }

  async mark(eventId: string, ttlSeconds = RedisStreams.DEFAULTS.DEDUPE_TTL_SECONDS): Promise<void> {
    const key = this.getKey(eventId)
    await this.redis.setex(key, ttlSeconds, '1')
    console.log(`[RedisDedupeStore] Marked ${eventId} as processed (TTL: ${ttlSeconds}s)`)
  }

  async remove(eventId: string): Promise<void> {
    const key = this.getKey(eventId)
    await this.redis.del(key)
    console.log(`[RedisDedupeStore] Removed ${eventId}`)
  }

  async close(): Promise<void> {
    // Redis connection is managed externally
    console.log('[RedisDedupeStore] Closing...')
  }

  private getKey(eventId: string): string {
    return `${REDIS_PREFIXES.DEDUPE}${eventId}`
  }
}

