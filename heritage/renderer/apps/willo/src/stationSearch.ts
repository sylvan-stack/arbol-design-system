// renderer/apps/willo/src/stationSearch.ts
//
// Station full-text search — the pure core (no bridge, no clock), restored
// from the pre-Svelte-port Willo. App.svelte fetches the page's transcripts
// via `chat_session.get` and feeds the rows here; hits carry the turn/role
// occurrence coordinates Elma needs to scroll to and highlight the exact
// match on open (the search handoff in `openSessionInElma`).

import type { StationMessage, StationSessionDetails } from './api'
import type { StationSession } from './stations'
import { primaryRepo } from './helpers'

export type SearchRole = 'user' | 'assistant'

export type StationSearchHit = {
  key: string
  sessionId: string
  sessionTitle: string
  repo: string
  role: SearchRole
  messageId: string
  turnId?: string
  /** N-th match of this role within the turn — Elma's highlight coordinate. */
  occurrenceIndex: number
  messageOccurrenceIndex: number
  absoluteIndex: number
  snippet: string
  snippetStart: number
  matchStart: number
}

export type StationSearchGroup = {
  sessionId: string
  sessionTitle: string
  repo: string
  hits: StationSearchHit[]
}

export const MAX_SEARCH_HITS = 300

/** Preserve station/transcript order while collecting occurrences by Chat Session. */
export function groupSearchHits(hits: readonly StationSearchHit[]): StationSearchGroup[] {
  const groups: StationSearchGroup[] = []
  const bySession = new Map<string, StationSearchGroup>()
  for (const hit of hits) {
    let group = bySession.get(hit.sessionId)
    if (!group) {
      group = {
        sessionId: hit.sessionId,
        sessionTitle: hit.sessionTitle,
        repo: hit.repo,
        hits: [],
      }
      bySession.set(hit.sessionId, group)
      groups.push(group)
    }
    group.hits.push(hit)
  }
  return groups
}

/** message_id → turn_id read directly from the materialized message rows. */
export function messageTurnMapFromMessages(rows: readonly SearchRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { detail } of rows) {
    for (const message of detail?.messages || []) {
      if (message.id && message.turn_id) out[message.id] = message.turn_id
    }
  }
  return out
}

/** Start indexes of every case-insensitive occurrence of `query` in `text`. */
export function findMatchIndexes(text: string, query: string): number[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hay = text.toLowerCase()
  const out: number[] = []
  let from = 0
  while (from <= hay.length) {
    const i = hay.indexOf(q, from)
    if (i < 0) break
    out.push(i)
    from = i + Math.max(1, q.length)
  }
  return out
}

export function makeSnippet(text: string, index: number, queryLength: number): { snippet: string; snippetStart: number; matchStart: number } {
  const radius = 72
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + queryLength + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return { snippet: `${prefix}${text.slice(start, end)}${suffix}`, snippetStart: start, matchStart: prefix.length + index - start }
}

/** Split `text` around the highlighted match for template rendering. */
export function splitHighlight(text: string, query: string, matchStart?: number): { before: string; match: string; after: string } {
  const q = query.trim()
  const idx = q ? (typeof matchStart === 'number' ? matchStart : text.toLowerCase().indexOf(q.toLowerCase())) : -1
  if (!q || idx < 0) return { before: text, match: '', after: '' }
  return { before: text.slice(0, idx), match: text.slice(idx, idx + q.length), after: text.slice(idx + q.length) }
}

export type SearchRow = { session: StationSession; detail: StationSessionDetails | null }

/** All occurrences of `query` across the fetched transcripts, in transcript
 *  order, with per-turn role occurrence indexes (Elma's highlight target). */
export function buildSearchHits(
  rows: readonly SearchRow[],
  query: string,
  messageTurns: Record<string, string>,
): StationSearchHit[] {
  const q = query.trim()
  if (!q) return []
  const next: StationSearchHit[] = []
  let absolute = 0
  for (const { session, detail } of rows) {
    const messages = [...((detail?.messages || []) as StationMessage[])].sort((a, b) => (a.seq || 0) - (b.seq || 0))
    const perTurnRoleCount: Record<string, Record<SearchRole, number>> = {}
    for (const message of messages) {
      const role: SearchRole = message.role === 'user' ? 'user' : 'assistant'
      const content = message.content || ''
      const indexes = findMatchIndexes(content, q)
      if (!indexes.length) continue
      const turnId = messageTurns[message.id]
      const bucketKey = turnId || `${message.id}:${role}`
      const roleCounts = perTurnRoleCount[bucketKey] || { user: 0, assistant: 0 }
      perTurnRoleCount[bucketKey] = roleCounts
      indexes.forEach((idx, inMessageIndex) => {
        const occurrenceIndex = roleCounts[role]++
        const snip = makeSnippet(content, idx, q.length)
        next.push({
          key: `${session.id}:${message.id}:${idx}:${absolute}`,
          sessionId: session.id,
          sessionTitle: session.title || 'Untitled chat',
          repo: primaryRepo({ ...session, ...(detail || {}) }) || 'Unknown repo',
          role,
          messageId: message.id,
          turnId,
          occurrenceIndex,
          messageOccurrenceIndex: inMessageIndex,
          absoluteIndex: absolute++,
          ...snip,
        })
      })
    }
  }
  return next.slice(0, MAX_SEARCH_HITS)
}
