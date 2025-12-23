/**
 * Complete Worker Example
 * Only consumes messages, doesn't serve HTTP
 * 
 * BEST PRACTICES DEMONSTRATED:
 * - Class-based consumers (recommended for production)
 * - Enhanced handler with messaging context
 * - Publishing from consumer handlers
 * - Dynamic consumer names
 * - Proper error handling and retries
 */

import { Elysia } from 'elysia'
import { messaging } from '../plugin-client'
import { messagingConsumers, createConsumer, createConsumerFromClass } from '../plugin-consumers'
import type { Consumer, HandlerContext } from '../core/consumer-descriptor'
import { videoTopics } from './shared-topics'
import { Redis } from 'ioredis'
// Or: import from 'elysia-messaging/redis-streams' when published
import { RedisStreamsBus, RedisStreamsConsumer, RedisDedupeStore } from '../adapters/redis-streams'

// Setup Redis connections
const redis = new Redis('redis://localhost:6379')
const bus = new RedisStreamsBus(redis)
const consumer = new RedisStreamsConsumer(redis, 'video.dlq')
const dedupe = new RedisDedupeStore(redis)

// ============================================================================
// APPROACH 1: Class-based Consumer (RECOMMENDED for production)
// ============================================================================

/**
 * Class-based consumer with dependency injection and state
 * This is the recommended approach for real applications
 */
class VideoJobsConsumer implements Consumer<typeof videoTopics, 'video.jobs'> {
  readonly topic = 'video.jobs' as const
  readonly group = 'video-processors'
  
  // Dynamic name based on environment
  readonly name = () => `worker-${process.env.WORKER_ID || process.pid}`
  
  readonly options = {
    maxRetries: 3,
    retryDelayMs: 5000,
    idempotency: true,
    skipInvalidPayload: false,
  }

  /**
   * Enhanced handler with messaging context
   * Can publish results without external dependencies
   */
  async handle({ envelope, attempt, messaging }: HandlerContext<any, any>) {
    const { videoId, url, userId, options } = envelope.payload

    console.log(`🎬 Processing video ${videoId} (attempt ${attempt})...`)

    try {
      // Simulate video processing
      const result = await processVideo(videoId, url, options)

      // Publish success result using injected messaging
      if (messaging) {
        await messaging.publish('video.results', {
          videoId,
          success: true,
          outputUrl: result.outputUrl,
          processingTime: result.duration,
        })
      }

      console.log(`✅ Video ${videoId} processed successfully`)
    } catch (error) {
      console.error(`❌ Failed to process video ${videoId}:`, error)
      
      // Publish failure result
      if (messaging && attempt >= 3) {
        await messaging.publish('video.results', {
          videoId,
          success: false,
          error: (error as Error).message,
        })
      }
      
      throw error // Will trigger retry/DLQ
    }
  }
}

// ============================================================================
// APPROACH 2: Functional Consumer (good for simple cases)
// ============================================================================

const videoResultsConsumer = createConsumer(videoTopics, {
  topic: 'video.results',
  group: 'backend-result-handlers',
  name: `worker-${process.env.WORKER_ID || '1'}`,

  // Enhanced handler signature with context
  async handler({ envelope, attempt, messaging }: HandlerContext<any, any>) {
    const { videoId, success, outputUrl, error } = envelope.payload

    console.log(`📊 Received result for video ${videoId} (attempt ${attempt})`)

    // Update database
    await updateVideoStatus(videoId, {
      status: success ? 'completed' : 'failed',
      outputUrl,
      error,
    })

    // Send notification to user
    if (success) {
      await sendNotification(videoId, 'Your video is ready!')
    }
  },

  options: {
    maxRetries: 5,
    idempotency: true,
  },
})

// Create worker app
const worker = new Elysia()
  // Install messaging client (for publishing results)
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
  // Install consumers
  .use(
    messagingConsumers({
      consumers: [
        // Class-based consumer (recommended)
        createConsumerFromClass(videoTopics, new VideoJobsConsumer()),
        // Functional consumer
        videoResultsConsumer,
      ],
      consumer,
      dedupe,
      hooks: {
        onMessage: async (topic, envelope) => {
          console.log(`📨 Received message from ${topic}:`, envelope.eventId)
        },
        onError: async (topic, envelope, error, attempt) => {
          console.error(
            `⚠️  Handler error on ${topic} (attempt ${attempt}):`,
            error
          )
        },
        onRetry: async (topic, envelope, attempt) => {
          console.log(`🔄 Retrying ${topic} (attempt ${attempt})`)
        },
        onDLQ: async (topic, envelope, error) => {
          console.error(`💀 Message sent to DLQ from ${topic}:`, envelope.eventId)
          // Alert via PagerDuty, Sentry, etc.
        },
        onAck: async (topic, envelope) => {
          console.log(`✓ Message acknowledged from ${topic}:`, envelope.eventId)
        },
      },
    })
  )
  .listen(3001) // Health check endpoint

console.log('👷 Worker running on port 3001')

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down worker...')
  await worker.stop()
  await redis.quit()
  process.exit(0)
})

// Helper functions (implementation would be actual video processing logic)
async function processVideo(
  videoId: string,
  url: string,
  options?: any
): Promise<{ outputUrl: string; duration: number }> {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // Actual implementation would:
  // - Download video
  // - Transcode
  // - Upload to storage
  // - Generate thumbnails
  // etc.
  
  return {
    outputUrl: `https://cdn.example.com/videos/${videoId}.mp4`,
    duration: 5000,
  }
}

async function updateVideoStatus(
  videoId: string,
  status: { status: string; outputUrl?: string; error?: string }
): Promise<void> {
  // Update database
  console.log(`Updating video ${videoId}:`, status)
}

async function sendNotification(videoId: string, message: string): Promise<void> {
  // Send email, push notification, etc.
  console.log(`Notification for ${videoId}:`, message)
}

