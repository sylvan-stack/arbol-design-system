import { ENTITIES, type EntityKind } from './data'

export const ENTITY_REPOS = {
  Arbol: 'arb',
  Mycel: 'myc',
  Universe: 'uni',
  Infer: 'inf',
  Blueprint: 'blue',
  Any: 'any',
} as const

export type EntityRepoName = keyof typeof ENTITY_REPOS
export type EntityRepoCode = (typeof ENTITY_REPOS)[EntityRepoName] | `repo-${string}`
export type EntityUri = string & { readonly __entityUri: unique symbol }

export type ParsedEntityUri = {
  uri: EntityUri
  repo: EntityRepoCode
  kind: EntityKind
  entityId: string
  title: string
}

export type EntityUriParts = {
  repo?: EntityRepoCode | EntityRepoName | null
  kind: EntityKind
  entityId: string
  title: string
}

export type EntityUriParseResult =
  | { ok: true; value: ParsedEntityUri }
  | { ok: false; error: string }

export type EntityUriTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'entity'; uri: EntityUri; entity: ParsedEntityUri }

const REPO_CODES = new Set<string>(Object.values(ENTITY_REPOS))
// Core emits reversible UTF-8 hex tags for configured/discovered repositories.
// The renderer validates the wire format; registration remains Core-owned.
export function isEntityRepoCode(value: string): value is EntityRepoCode {
  return REPO_CODES.has(value) || /^repo-(?:[0-9a-f]{2})+$/.test(value)
}
const KINDS_BY_TAG = new Map<string, EntityKind>(
  ENTITIES.ORDER.map((kind) => [ENTITIES.meta(kind).tag, kind]),
)

function decodeBase64Utf8(encoded: string): string {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('title is not valid Base64')
  }
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export function parseEntityUri(input: string): EntityUriParseResult {
  if (typeof input !== 'string' || !input.startsWith('[') || !input.endsWith(']')) {
    return { ok: false, error: 'Entity URI must be enclosed in square brackets' }
  }
  const parts = input.slice(1, -1).split(':')
  if ((parts.length !== 3 && parts.length !== 4) || parts.some((part) => part.length === 0)) {
    return { ok: false, error: 'Entity URI must contain three or four non-empty parts' }
  }
  const [repo, kindTag, entityId, encodedTitle] = parts.length === 4
    ? parts as [string, string, string, string]
    : ['any', ...parts] as [string, string, string, string]
  if (!isEntityRepoCode(repo)) return { ok: false, error: `Unknown Entity Repo code: ${repo}` }
  const kind = KINDS_BY_TAG.get(kindTag)
  if (!kind) return { ok: false, error: `Unknown Entity Kind tag: ${kindTag}` }
  try {
    return {
      ok: true,
      value: {
        uri: input as EntityUri,
        repo: repo as EntityRepoCode,
        kind,
        entityId,
        title: decodeBase64Utf8(encodedTitle),
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid Entity URI title' }
  }
}

export function formatEntityUri(parts: EntityUriParts): EntityUri {
  const repo = parts.repo == null ? null : parts.repo in ENTITY_REPOS
    ? ENTITY_REPOS[parts.repo as EntityRepoName]
    : parts.repo as EntityRepoCode
  if (repo !== null && !isEntityRepoCode(repo)) throw new Error(`Unknown Entity Repo: ${parts.repo}`)
  if (!parts.entityId || parts.entityId.includes(':')) throw new Error('Entity ID must be non-empty and cannot contain a colon')
  if (!parts.title) throw new Error('Entity title must be non-empty')
  const kindTag = ENTITIES.meta(parts.kind).tag
  const prefix = repo === null ? '' : `${repo}:`
  return `[${prefix}${kindTag}:${parts.entityId}:${encodeBase64Utf8(parts.title)}]` as EntityUri
}

export function entityIdentityKey(entity: ParsedEntityUri | EntityUri): string {
  const parsed = typeof entity === 'string' ? parseEntityUri(entity) : { ok: true as const, value: entity }
  if (parsed.ok === false) throw new Error(parsed.error)
  return `${parsed.value.kind}:${parsed.value.entityId}`
}


/** Split prose without changing it, lifting only complete, valid Entity URIs.
 * Invalid bracketed text stays plain text. This is shared by rich text surfaces
 * so the Composer and sent-message renderer recognize exactly the same syntax. */
export function splitEntityUris(text: string): EntityUriTextSegment[] {
  if (!text) return [{ kind: 'text', text }]
  const segments: EntityUriTextSegment[] = []
  const candidate = /\[[^\]\r\n]+\]/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = candidate.exec(text)) !== null) {
    const parsed = parseEntityUri(match[0])
    if (!parsed.ok) continue
    if (match.index > last) segments.push({ kind: 'text', text: text.slice(last, match.index) })
    segments.push({ kind: 'entity', uri: parsed.value.uri, entity: parsed.value })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments.length ? segments : [{ kind: 'text', text }]
}
