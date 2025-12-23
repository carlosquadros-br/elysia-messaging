/**
 * Topic registry creation and management
 */

import type { TSchema } from '@sinclair/typebox'
import type {
  TopicDefinition,
  TopicRegistry,
  SchemaValidator,
} from './registry.types'
import { typeBoxValidator } from './registry.types'

/**
 * Options for creating a topic registry
 */
export interface CreateTopicRegistryOptions {
  /** Custom schema validator (default: TypeBox) */
  validator?: SchemaValidator
  
  /** Strict mode: throw if topic not found (default: true) */
  strict?: boolean
}

/**
 * Create a type-safe topic registry
 * 
 * @example
 * ```ts
 * const registry = createTopicRegistry({
 *   'video.jobs': {
 *     schema: t.Object({ videoId: t.String() }),
 *     messageType: 'video.processing.request',
 *   },
 *   'user.events': {
 *     schema: t.Object({ userId: t.String() }),
 *   },
 * })
 * ```
 */
export function createTopicRegistry<
  TTopics extends Record<string, TopicDefinition<TSchema>>
>(
  topics: TTopics,
  options: CreateTopicRegistryOptions = {}
): TopicRegistry<TTopics> {
  const {
    validator = typeBoxValidator,
    strict = true,
  } = options

  return {
    topics: Object.freeze(topics) as TTopics,
    validator,
  }
}

/**
 * Get topic definition from registry (with type checking)
 */
export function getTopicDefinition<
  TRegistry extends TopicRegistry<any>,
  TTopic extends keyof TRegistry['topics'] & string
>(
  registry: TRegistry,
  topic: TTopic
): TRegistry['topics'][TTopic] {
  const definition = registry.topics[topic]
  
  if (!definition) {
    throw new Error(`Topic "${topic}" not found in registry`)
  }
  
  return definition
}

/**
 * Validate payload against topic schema
 */
export function validateTopicPayload<
  TRegistry extends TopicRegistry<any>,
  TTopic extends keyof TRegistry['topics'] & string
>(
  registry: TRegistry,
  topic: TTopic,
  payload: unknown
): asserts payload is any {
  const definition = getTopicDefinition(registry, topic)
  registry.validator.validate(definition.schema, payload)
}

/**
 * Check if topic exists in registry
 */
export function hasTopicInRegistry<TRegistry extends TopicRegistry<any>>(
  registry: TRegistry,
  topic: string
): topic is keyof TRegistry['topics'] & string {
  return topic in registry.topics
}

