/**
 * Centralized topic names for messaging
 * Keeps naming consistent across services
 * 
 * You can extend this with your own topics or pass custom topics to the plugin
 */
export const Topics = {
  // Video processing pipeline
  VIDEO_JOBS: 'video.jobs',
  VIDEO_STATUS: 'video.status',
  VIDEO_RESULTS: 'video.results',
  VIDEO_DLQ: 'video.dlq',

  // Captions fetching pipeline
  CAPTIONS_JOBS: 'captions.jobs',
  CAPTIONS_RESULTS: 'captions.results',
  CAPTIONS_DLQ: 'captions.dlq',

  // Clip rendering pipeline
  CLIP_JOBS: 'clip.jobs',
  CLIP_STATUS: 'clip.status',
  CLIP_RESULTS: 'clip.results',
  CLIP_DLQ: 'clip.dlq',
} as const

export type TopicName = (typeof Topics)[keyof typeof Topics]

/**
 * Message types (for envelope.type field)
 */
export const MessageTypes = {
  // Video processing
  VIDEO_PROCESSING_REQUEST: 'video.processing.request',
  VIDEO_STATUS_UPDATE: 'video.status.update',
  VIDEO_PROCESSING_RESULT: 'video.processing.result',

  // Captions fetching
  CAPTIONS_FETCH_REQUEST: 'captions.fetch.request',
  CAPTIONS_FETCH_RESULT: 'captions.fetch.result',

  // Clip rendering
  CLIP_RENDER_REQUEST: 'clip.render.request',
  CLIP_STATUS_UPDATE: 'clip.status.update',
  CLIP_RENDER_RESULT: 'clip.render.result',
} as const

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes]

