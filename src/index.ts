/**
 * elysia-messaging
 * Production-grade, type-safe messaging plugin for ElysiaJS (broker-agnostic)
 * 
 * Features:
 * - Broker-agnostic design (implement MessageBus/MessageConsumer ports)
 * - Full TypeScript type inference
 * - TypeBox schema validation
 * - Idempotency & retries
 * - Observability hooks
 * - Both functional and OO consumer styles
 * - Enhanced handler context with messaging injection
 * 
 * @version 0.2.0
 * @author carlos.eduardo.br@gmail.com
 * @license MIT
 */

// Core exports - Message structure
export * from './core/message-envelope'

// Core exports - Ports (interfaces)
export * from './core/message-bus.port'
export * from './core/message-consumer.port'
export * from './core/dedupe-store.port'

// Core exports - Topics (backward compatibility)
export * from './core/topics'

// Core exports - Registry system
export * from './core/registry'
export * from './core/consumer-descriptor'
export * from './core/publisher-helper'

// Explicit exports for most commonly used items
export { 
  typeBoxValidator, 
  ValidationError,
  type SchemaValidator,
  type TopicRegistry,
  type TopicDefinition,
} from './core/registry.types'

export {
  createTopicRegistry,
  validateTopicPayload,
  getTopicDefinition,
} from './core/registry'

export {
  createConsumer,
  createConsumerFromClass,
  type Consumer,
  type ConsumerDescriptor,
  type ConsumerHandler,
  type ConsumerOptions,
  type HandlerContext,
} from './core/consumer-descriptor'

// Plugins
export { messaging } from './plugin-client'
export { messagingConsumers } from './plugin-consumers'

// Type helpers
export type {
  MessagingClient,
  MessagingClientConfig,
  BusResolver,
} from './plugin-client'

export type {
  MessagingConsumersConfig,
  ConsumerResolver,
} from './plugin-consumers'

// Note: Redis Streams adapter is available via subpath export:
// import { RedisStreamsBus, ... } from 'elysia-messaging/redis-streams'

