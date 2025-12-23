/**
 * Core message envelope - contract between all services
 * This is the single source of truth for message structure
 */
export interface MessageEnvelope<T = unknown> {
  /** Unique event identifier (UUID) for idempotency */
  eventId: string

  /** Event type (e.g., "video.processing.request", "video.status.update") */
  type: string

  /** Job identifier (business key) */
  jobId: string

  /** ISO timestamp when event occurred */
  occurredAt: string

  /** Correlation ID for tracing across services */
  correlationId?: string

  /** Causation ID (what caused this event) */
  causationId?: string

  /** Schema version for backward compatibility */
  version: number

  /** Retry attempt count */
  attempts: number

  /** Actual business payload */
  payload: T
}

/**
 * Factory to create envelopes with defaults
 */
export function createEnvelope<T>(
  type: string,
  jobId: string,
  payload: T,
  meta?: Partial<MessageEnvelope<T>>
): MessageEnvelope<T> {
  return {
    eventId: crypto.randomUUID(),
    type,
    jobId,
    occurredAt: new Date().toISOString(),
    version: 1,
    attempts: 0,
    ...meta,
    payload,
  }
}

