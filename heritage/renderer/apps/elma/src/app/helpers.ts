/* Pure, stateless helpers extracted from App.svelte (Elma chat root). No
 * component state — just constants, types, and functions over plain inputs.
 * Keeping these out of App.svelte keeps the root focused on reactive wiring. */

export const ELMA_ACTIVE_CHAT_SESSION_KEY = 'arbol:elma:active-chat-session-id'
export const ELMA_LAST_CHAT_SESSION_KEY = 'arbol:elma:last-chat-session-id'
export const ELMA_ACTIVE_CHAT_SESSION_CHANNEL = 'arbol:elma:active-chat-session'

export type ElmaOpenPayload = {
  page?: 'chat' | 'change-walkthrough'
  session_id?: string
  session_open_id?: string
  draft_id?: string
  cmd_number?: string
  archive_current_session?: boolean
  stop_current_agent?: boolean
  insert_entity_uri?: string
  restore_draft?: boolean | string | number
  search?: string
  q?: string
  turn_id?: string
  role?: string
  occurrence_index?: number | string
}
export type ElmaSearchTarget = { query?: string; turnId?: string; role?: 'user' | 'assistant'; occurrenceIndex?: number }

// A page-view history entry: a file plus an optional in-document locator.
export type PreviewEntry = { path: string; anchor?: string; line?: number }

export function loadElmaLastChatSessionId(): string | null {
  try { return localStorage.getItem(ELMA_LAST_CHAT_SESSION_KEY) || null } catch { return null }
}
export function clearElmaLastChatSessionId(): void {
  try { localStorage.removeItem(ELMA_LAST_CHAT_SESSION_KEY) } catch {}
}
export function publishElmaActiveChatSessionId(sessionId: string | null | undefined) {
  const normalized = sessionId ? String(sessionId) : ''
  try {
    if (normalized) {
      localStorage.setItem(ELMA_ACTIVE_CHAT_SESSION_KEY, normalized)
      localStorage.setItem(ELMA_LAST_CHAT_SESSION_KEY, normalized)
    } else {
      localStorage.removeItem(ELMA_ACTIVE_CHAT_SESSION_KEY)
    }
  } catch {}
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(ELMA_ACTIVE_CHAT_SESSION_CHANNEL)
    channel.postMessage({ sessionId: normalized })
    channel.close()
  }
}

export function restoreDraftRequested(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'y'
  }
  return false
}

export function searchTargetFromOpenPayload(payload: { search?: unknown; q?: unknown; turn_id?: unknown; role?: unknown; occurrence_index?: unknown } | null | undefined): ElmaSearchTarget | null {
  const query = typeof payload?.search === 'string' ? payload.search : typeof payload?.q === 'string' ? payload.q : ''
  const trimmed = query.trim()
  const turnId = typeof payload?.turn_id === 'string' && payload.turn_id.trim() ? payload.turn_id : undefined
  if (!trimmed && !turnId) return null
  const role = payload?.role === 'user' || payload?.role === 'assistant' ? payload.role : undefined
  const rawOccurrence = payload?.occurrence_index
  const occurrenceIndex = typeof rawOccurrence === 'number'
    ? rawOccurrence
    : typeof rawOccurrence === 'string' && rawOccurrence.trim() !== '' && Number.isFinite(Number(rawOccurrence))
      ? Number(rawOccurrence)
      : undefined
  return { ...(trimmed ? { query: trimmed } : {}), turnId, role, occurrenceIndex }
}

export function sameEntry(a: PreviewEntry | undefined, b: PreviewEntry): boolean {
  return !!a && a.path === b.path && (a.anchor || undefined) === (b.anchor || undefined) && (a.line ?? undefined) === (b.line ?? undefined)
}

// Split a local-file link target into the file path and an optional in-document
// locator. Supports `path:line`, `path#L51` / `path#51` and `path#anchor`.
export function parseFileLocator(raw: string): { path: string; line?: number; anchor?: string } {
  const t = (raw || '').trim()
  const colon = t.match(/^(.*?):(\d+)$/)
  if (colon && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return { path: colon[1], line: Number(colon[2]) }
  const hash = t.indexOf('#')
  if (hash >= 0) {
    const path = t.slice(0, hash)
    const frag = t.slice(hash + 1)
    const lineMatch = frag.match(/^L?(\d+)$/)
    if (lineMatch) return { path, line: Number(lineMatch[1]) }
    return { path, anchor: frag }
  }
  return { path: t }
}

export function parseLeadingTitleBlock(raw: string): { title: string | null; text: string } {
  const match = raw.match(/^-\r?\n([^\r\n]+)\r?\n-\r?\n?/)
  if (!match) return { title: null, text: raw }
  const title = match[1].trim()
  if (!title) return { title: null, text: raw }
  return { title, text: raw.slice(match[0].length) }
}

// ── Durable-transcript slicing (this turn's assistant text/cycles) ───────────
export const turnAssistantCycles = (
  msgs: { role: string; turn_id: string; content: string; thinking?: string; ts?: number; seq?: number }[],
  turnId: string,
) => msgs
  .filter((m) => Boolean(turnId) && m.role === 'assistant' && m.turn_id === turnId)
  .map((m) => ({ content: m.content, thinking: m.thinking, ts: m.ts, seq: m.seq }))
