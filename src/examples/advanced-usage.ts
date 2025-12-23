/**
 * Advanced usage example with custom topics and multiple consumers
 */

import { Elysia } from 'elysia'
import { messaging } from '../plugin'
import { createEnvelope } from '../core/message-envelope'
import { Redis } from 'ioredis'

// Custom topics for your application
const MyTopics = {
  USER_EVENTS: 'user.events',
  PAYMENT_EVENTS: 'payment.events',
  NOTIFICATION_JOBS: 'notification.jobs',
  DLQ: 'my-app.dlq',
} as const

// Custom message types
const MyMessageTypes = {
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
  PAYMENT_COMPLETED: 'payment.completed',
  SEND_EMAIL: 'notification.email',
} as const

const redis = new Redis('redis://localhost:6379')

const app = new Elysia()
  .use(
    messaging({
      redis,
      topics: MyTopics,
      dlqTopic: MyTopics.DLQ,
    })
  )
  .post('/users', async ({ messaging, body }) => {
    // Create user in database first
    const userId = 'user-123'

    // Publish user registration event
    await messaging.publish(
      MyTopics.USER_EVENTS,
      createEnvelope(MyMessageTypes.USER_REGISTERED, userId, {
        userId,
        email: body.email,
        name: body.name,
        registeredAt: new Date().toISOString(),
      })
    )

    return { userId }
  })
  .post('/payments/webhook', async ({ messaging, body }) => {
    // Verify webhook signature here...

    // Publish payment completion event
    await messaging.publish(
      MyTopics.PAYMENT_EVENTS,
      createEnvelope(MyMessageTypes.PAYMENT_COMPLETED, body.paymentId, {
        paymentId: body.paymentId,
        userId: body.userId,
        amount: body.amount,
        currency: body.currency,
      })
    )

    return { received: true }
  })
  .listen(3000)

// Consumer 1: Send welcome email on user registration
app.messaging.subscribe(
  MyTopics.USER_EVENTS,
  async (envelope) => {
    if (envelope.type === MyMessageTypes.USER_REGISTERED) {
      const { email, name } = envelope.payload

      // Queue email notification
      await app.messaging.publish(
        MyTopics.NOTIFICATION_JOBS,
        createEnvelope(MyMessageTypes.SEND_EMAIL, envelope.jobId, {
          to: email,
          template: 'welcome',
          data: { name },
        })
      )
    }
  },
  {
    consumerGroup: 'user-event-processors',
    consumerName: 'email-sender-1',
  }
)

// Consumer 2: Update user stats on registration
app.messaging.subscribe(
  MyTopics.USER_EVENTS,
  async (envelope) => {
    if (envelope.type === MyMessageTypes.USER_REGISTERED) {
      // Update analytics, metrics, etc.
      console.log('📊 Updating user stats for:', envelope.payload.userId)
    }
  },
  {
    consumerGroup: 'analytics-processors',
    consumerName: 'stats-updater-1',
  }
)

// Consumer 3: Process payments
app.messaging.subscribe(
  MyTopics.PAYMENT_EVENTS,
  async (envelope) => {
    if (envelope.type === MyMessageTypes.PAYMENT_COMPLETED) {
      // Update user subscription, send receipt, etc.
      console.log('💳 Processing payment:', envelope.payload)
    }
  },
  {
    consumerGroup: 'payment-processors',
    consumerName: 'payment-worker-1',
  }
)

// Consumer 4: Email sender worker (can scale independently)
app.messaging.subscribe(
  MyTopics.NOTIFICATION_JOBS,
  async (envelope) => {
    if (envelope.type === MyMessageTypes.SEND_EMAIL) {
      const { to, template, data } = envelope.payload

      // Send email with your email service
      console.log(`📧 Sending email to ${to} with template ${template}`)

      // Simulate email sending
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  },
  {
    consumerGroup: 'email-workers',
    consumerName: 'email-worker-1',
  }
)

console.log('🚀 Advanced messaging example running on http://localhost:3000')

