import type { ParsedEntityUri } from './entityUri'

export type EntityCardResolver = (
  entity: ParsedEntityUri,
  context: { signal: AbortSignal },
) => Promise<string> | string

export type EntityCardContentFormat = 'plain' | 'markdown'
