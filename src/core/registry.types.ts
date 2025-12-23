/**
 * Type system for generic topic registry with full type inference
 */

import type { TSchema } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

/**
 * Topic definition with schema and optional metadata
 */
export interface TopicDefinition<TPayloadSchema extends TSchema = TSchema> {
  /** Payload schema (TypeBox, Zod, or custom) */
  schema: TPayloadSchema
  
  /** Optional message type for envelope.type field */
  messageType?: string
  
  /** Optional description for documentation */
  description?: string
}

/**
 * Registry of topics mapping topic names to their definitions
 * This is the core type that enables all type inference
 */
export type TopicRegistry<TTopics extends Record<string, TopicDefinition>> = {
  readonly topics: TTopics
  readonly validator: SchemaValidator
}

/**
 * Extract topic names from registry (union type)
 */
export type TopicName<TRegistry extends TopicRegistry<any>> = 
  keyof TRegistry['topics'] & string

/**
 * Extract payload type from a specific topic in registry
 */
export type TopicPayload<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
> = TRegistry['topics'][TTopic]['schema'] extends TSchema
  ? Static<TRegistry['topics'][TTopic]['schema']>
  : never

/**
 * Extract message type from a specific topic (if defined)
 */
export type TopicMessageType<
  TRegistry extends TopicRegistry<any>,
  TTopic extends TopicName<TRegistry>
> = TRegistry['topics'][TTopic]['messageType']

/**
 * Schema validator abstraction (supports TypeBox, Zod, etc.)
 */
export interface SchemaValidator {
  /**
   * Validate data against schema synchronously
   * @throws ValidationError if invalid
   */
  validate<S extends TSchema>(schema: S, data: unknown): asserts data is Static<S>
  
  /**
   * Validate data against schema asynchronously
   * @throws ValidationError if invalid
   */
  validateAsync?<S extends TSchema>(schema: S, data: unknown): Promise<void>
  
  /**
   * Check if data is valid (doesn't throw)
   */
  isValid?<S extends TSchema>(schema: S, data: unknown): boolean
}

/**
 * Default TypeBox validator
 */
export const typeBoxValidator: SchemaValidator = {
  validate: <S extends TSchema>(schema: S, data: unknown) => {
    // Check if data is valid
    if (!Value.Check(schema, data)) {
      // Collect all validation errors
      const errors = [...Value.Errors(schema, data)]
      
      // Format errors for better debugging
      const formattedErrors = errors.map(error => ({
        path: error.path,
        message: error.message,
      }))
      
      // Throw ValidationError with details
      const summary = formattedErrors
        .map(e => `${e.path}: ${e.message}`)
        .join(', ')
      
      throw new ValidationError(
        `Validation failed: ${summary}`,
        formattedErrors
      )
    }
  },
  
  validateAsync: async <S extends TSchema>(schema: S, data: unknown) => {
    // TypeBox validation is synchronous, but we support async interface
    return typeBoxValidator.validate(schema, data)
  },
  
  isValid: <S extends TSchema>(schema: S, data: unknown): boolean => {
    return Value.Check(schema, data)
  },
}

/**
 * Validation error with details
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

