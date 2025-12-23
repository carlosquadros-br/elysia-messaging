/**
 * Redis Streams constants and configuration
 */

/**
 * Consumer group naming conventions
 */
export const RedisStreams = {
  GROUPS: {
    BACKEND_STATUS_RELAY: 'cg:backend-status-relay',
    BACKEND_RESULTS: 'cg:backend-results',
    PYTHON_VIDEO_WORKERS: 'cg:python-video-workers',
    PYTHON_CAPTIONS_WORKERS: 'cg:python-captions-workers',
    PYTHON_CLIP_WORKERS: 'cg:python-clip-workers',
  },

  /** Special stream IDs */
  IDS: {
    /** Start reading from the beginning */
    START: '0',
    /** Start reading from now (only new messages) */
    NOW: '$',
    /** Used for new messages in XADD */
    AUTO: '*',
    /** Pending messages (not acknowledged yet) */
    PENDING: '>',
  },

  /** Default configuration */
  DEFAULTS: {
    /** Maximum retry attempts before DLQ */
    MAX_RETRIES: 5,
    /** Block time when waiting for messages (ms) */
    BLOCK_MS: 5000,
    /** Deduplication TTL (24 hours) */
    DEDUPE_TTL_SECONDS: 86400,
  },
} as const

/**
 * Key prefixes for Redis
 */
export const REDIS_PREFIXES = {
  STREAM: 'stream:',
  DEDUPE: 'dedupe:',
  DLQ: 'dlq:',
} as const

