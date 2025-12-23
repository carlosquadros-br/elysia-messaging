/**
 * Complete API Server Example
 * Only publishes messages, doesn't consume
 * 
 * BEST PRACTICES DEMONSTRATED:
 * - Type-safe message publishing
 * - Auto-picked messageType from registry
 * - Publishing hooks for observability
 * - Proper error handling
 */

import { Elysia, t } from 'elysia'
import { messaging } from '../plugin-client'
import { videoTopics } from './shared-topics'
import { Redis } from 'ioredis'
import { RedisStreamsBus } from '../adapters/redis-streams' // Or: 'elysia-messaging/redis-streams' when published

// Setup Redis connection
const redis = new Redis('redis://localhost:6379')
const bus = new RedisStreamsBus(redis)

// Create API server
const app = new Elysia()
  // Install messaging plugin
  .use(
    messaging({
      registry: videoTopics,
      bus,
      hooks: {
        onPublish: async (topic, envelope) => {
          console.log(`📤 Published to ${topic}:`, envelope.eventId)
        },
        onPublishError: async (topic, envelope, error) => {
          console.error(`❌ Publish failed to ${topic}:`, error)
        },
      },
    })
  )

  // Routes
  .post(
    '/videos',
    async ({ messaging, body }) => {
      const videoId = crypto.randomUUID()

      // Publish video processing job (type-safe!)
      await messaging.publish('video.jobs', {
        videoId,
        url: body.url,
        userId: body.userId,
        options: body.options,
      })

      return {
        videoId,
        status: 'queued',
        message: 'Video processing started',
      }
    },
    {
      body: t.Object({
        url: t.String({ format: 'uri' }),
        userId: t.String(),
        options: t.Optional(
          t.Object({
            quality: t.Union([t.Literal('1080p'), t.Literal('720p'), t.Literal('480p')]),
            codec: t.Optional(t.String()),
          })
        ),
      }),
    }
  )

  .get('/videos/:id', async ({ params: { id }, db }) => {
    // Fetch video status from database
    const video = await db.videos.findById(id)
    return video
  })

  .listen(3000)

console.log('🚀 API Server running on http://localhost:3000')

