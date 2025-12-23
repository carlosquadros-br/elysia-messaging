/**
 * Shared topic registry for video processing pipeline
 * Used by both API and Worker
 */

import { t } from 'elysia'
import { createTopicRegistry } from 'elysia-messaging'

export const videoTopics = createTopicRegistry({
  // Job submission from API
  'video.jobs': {
    schema: t.Object({
      videoId: t.String({ minLength: 1 }),
      url: t.String({ format: 'uri' }),
      userId: t.String(),
      options: t.Optional(t.Object({
        quality: t.Union([t.Literal('1080p'), t.Literal('720p'), t.Literal('480p')]),
        codec: t.Optional(t.String()),
      })),
    }),
    messageType: 'video.processing.request',
    description: 'Video processing job submission',
  },

  // Status updates from worker
  'video.status': {
    schema: t.Object({
      videoId: t.String(),
      status: t.Union([
        t.Literal('queued'),
        t.Literal('processing'),
        t.Literal('completed'),
        t.Literal('failed'),
      ]),
      progress: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
      message: t.Optional(t.String()),
    }),
    messageType: 'video.status.update',
    description: 'Real-time status updates',
  },

  // Final result from worker
  'video.results': {
    schema: t.Object({
      videoId: t.String(),
      success: t.Boolean(),
      outputUrl: t.Optional(t.String()),
      error: t.Optional(t.String()),
      metadata: t.Optional(t.Object({
        duration: t.Number(),
        size: t.Number(),
        format: t.String(),
      })),
    }),
    messageType: 'video.processing.result',
    description: 'Final processing result',
  },

  // DLQ for failed messages
  'video.dlq': {
    schema: t.Unknown(),
    description: 'Dead letter queue',
  },
})

export type VideoTopicsRegistry = typeof videoTopics

