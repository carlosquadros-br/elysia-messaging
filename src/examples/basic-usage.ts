/**
 * Basic usage example of elysia-messaging
 * 
 * Run this after implementing the plugin to test functionality
 */

import { Elysia } from 'elysia'
import { messaging } from '../plugin'
import { createEnvelope, Topics, MessageTypes } from '../index'
import { Redis } from 'ioredis'

// Create Redis connection
const redis = new Redis('redis://localhost:6379')

// Create Elysia app with messaging plugin
const app = new Elysia()
  .use(
    messaging({
      redis,
      dlqTopic: Topics.VIDEO_DLQ,
      consumer: {
        maxRetries: 3,
        blockMs: 5000,
      },
      dedupeTtl: 86400, // 24 hours
    })
  )
  .post('/video/process', async ({ messaging, body }) => {
    // Create and publish a video processing request
    const envelope = createEnvelope(
      MessageTypes.VIDEO_PROCESSING_REQUEST,
      body.videoId,
      {
        videoId: body.videoId,
        url: body.url,
        userId: body.userId,
      }
    )

    await messaging.publish(Topics.VIDEO_JOBS, envelope)

    return {
      success: true,
      eventId: envelope.eventId,
      message: 'Video processing started',
    }
  })
  .get('/health', () => ({
    status: 'ok',
    messaging: 'connected',
  }))
  .listen(3000)

console.log('🚀 Server running on http://localhost:3000')

// Set up consumer (typically in a separate worker process)
app.messaging
  .subscribe(
    Topics.VIDEO_RESULTS,
    async (envelope) => {
      console.log('📦 Received video result:', envelope)

      // Check for duplicates
      if (await app.messaging.dedupe.has(envelope.eventId)) {
        console.log('⏭️  Already processed, skipping')
        return
      }

      // Process the message
      try {
        console.log('✅ Processing video result:', envelope.payload)

        // TODO: Update database, send notification, etc.

        // Mark as processed
        await app.messaging.dedupe.mark(envelope.eventId)
      } catch (error) {
        console.error('❌ Error processing message:', error)
        throw error // Will trigger retry/DLQ
      }
    },
    {
      consumerGroup: 'backend-workers',
      consumerName: 'worker-1',
      maxRetries: 3,
    }
  )
  .catch((error) => {
    console.error('Failed to start consumer:', error)
  })

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...')
  await app.messaging.close()
  await redis.quit()
  process.exit(0)
})

