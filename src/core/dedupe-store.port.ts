/**
 * Port for deduplication store (idempotency)
 * Prevents processing the same message multiple times
 */
export interface DedupeStore {
  /**
   * Check if an event ID has been processed
   * @param eventId Unique event identifier
   * @returns true if already processed
   */
  has(eventId: string): Promise<boolean>

  /**
   * Mark an event ID as processed
   * @param eventId Unique event identifier
   * @param ttlSeconds Time-to-live in seconds (default 24h)
   */
  mark(eventId: string, ttlSeconds?: number): Promise<void>

  /**
   * Remove an event ID from processed list (rarely needed)
   * @param eventId Unique event identifier
   */
  remove(eventId: string): Promise<void>

  /**
   * Close the store connection
   */
  close(): Promise<void>
}

