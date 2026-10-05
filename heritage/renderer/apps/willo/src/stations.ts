// renderer/apps/willo/src/stations.ts
//
// Station read-model types and Draft decoration for Willo. Chat Session cards
// come only from authoritative current-state RPC snapshots.

export type StationTag = {
  name: string
  value?: string
  /** Configured 3–4 character badge shown beneath Willo Station cards. */
  symbol?: string
}

export type TokenUsage = {
  model?: string
  tokens_in?: number | null
  tokens_out?: number | null
  cost_usd?: number | null
  ts?: number
}

export type StationSession = {
  id: string
  /** Presentation source. Draft cards look like stations but are not Chat Sessions. */
  entityKind?: 'chat_session' | 'draft'
  /** Opaque content-only Draft identity used only for Elma restore handoff. */
  draftId?: string
  /** The first sent user message contains image attachments. */
  first_message_has_images?: boolean
  title?: string
  ip_name?: string
  model?: string
  /** Extensible Chat Session metadata returned by Core. */
  metadata?: { tags?: StationTag[]; [key: string]: unknown }
  /** Cumulative recorded token usage for this entire chat session. */
  last_usage?: TokenUsage | null
  created_at?: number
  updated_at?: number
  /** Most recent durable progress signal from the agent (not user metadata). */
  last_agent_activity_at?: number | null
  status?: string
  /** Latest terminal Turn error, projected for failure cues on list cards. */
  last_error?: string | null
  initiator_kind?: 'leather_bag' | 'agent' | 'delegate' | 'steward'
  initiator_id?: string | null
  parent_chat_session_id?: string | null
  parent_chat_session?: {
    id: string
    title?: string
    status?: string
    onGoing: boolean
    isUnread: boolean
    ongoing_chat_session_id: string
  }
  initiating_mandate_id?: string | null
  initiating_mandate_version_id?: string | null
  workspace_dirs?: string[]
  repo?: string
  repo_name?: string
  repository?: string
  repository_name?: string
  repo_path?: string
  repo_root?: string
  workspace_path?: string
  cwd?: string
  project_path?: string
  color?: string
  /** User-curated radar flag: keep this chat in the ongoing section. */
  onGoing?: boolean
  /** True when the latest agent response has not been read in Elma yet. */
  isUnread?: boolean
  /** True when Elma's composer has unsent text or image attachments. */
  hasDraft?: boolean
  /** Persisted draft composer text, when present. */
  draftText?: string
  /** Persisted draft image attachments JSON, when present. */
  draftAttachmentsJson?: string
  /** Number of persisted Draft attachments, including draft-only cards. */
  draftAttachmentCount?: number
  /** Client-side live sort hint: set immediately when this Willo instance sees
   *  USER_SENT_MESSAGE so an old chat jumps to the top without waiting for the
   *  debounced agent-activity sort key. Not persisted by Core. */
  last_user_message_at?: number
}

export function stationIsAgentic(session: StationSession): boolean {
  return session.entityKind !== 'draft'
    && ['agent', 'delegate', 'steward'].includes(session.initiator_kind || '')
}

/** Inherit only card chrome. Raw execution state still drives live streams and
 * completion sounds. Snapshot parents cover ancestors outside the list limit. */
export function withParentStationState(sessions: readonly StationSession[]): StationSession[] {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  function project(session: StationSession, seen = new Set<string>()): StationSession | null {
    if (seen.has(session.id)) return null
    if (!stationIsAgentic(session)) return session
    seen.add(session.id)
    const parent = byId.get(session.parent_chat_session_id || '')
    const state = parent ? project(parent, seen) : session.parent_chat_session
    if (state === null) return null
    if (!state) return session
    return { ...session, onGoing: !!state.onGoing, isUnread: !!state.isUnread,
      status: state.status === 'running' ? 'running' : 'idle', last_error: null }
  }
  return sessions.map((session) => project(session) || session)
}


export type PendingSessionPatch = {
  mutation: number
  patch: Partial<StationSession>
}

/** Preserve an unacknowledged optimistic command while an older authoritative
 * snapshot is in flight. This prevents a surface invalidation emitted during
 * the durable append from visually reverting a card before the command reply. */
export function applyPendingSessionPatches(
  sessions: readonly StationSession[],
  pending: ReadonlyMap<string, PendingSessionPatch>,
): StationSession[] {
  if (pending.size === 0) return [...sessions]
  return sessions.map((session) => {
    const optimistic = pending.get(session.id)
    return optimistic ? { ...session, ...optimistic.patch } : session
  })
}

export type StationOrderActivityMap = Record<string, number>

/** Sort-key helper for station cards. `orderActivity` is intentionally debounced
 *  by App to prevent running agents from constantly reshuffling the list while
 *  they stream. A user's own new message is different: it should immediately
 *  promote that existing chat to the top, so `last_user_message_at` bypasses the
 *  debounce. */
export function stationOrderActivity(
  session: StationSession,
  orderActivity: StationOrderActivityMap,
): number {
  const debounced = orderActivity[session.id]
  const fallback = Math.max(session.updated_at || 0, session.created_at || 0)
  const immediateUserMessage = session.last_user_message_at || 0
  return debounced === undefined
    ? Math.max(fallback, immediateUserMessage)
    : Math.max(debounced || 0, immediateUserMessage)
}

export type StationDraft = {
  draft_id: string
  chat_session_id?: string | null
  text?: string
  text_preview?: string
  attachments?: unknown[]
  attachment_count?: number
  chat_notes?: unknown[]
  chat_note_count?: number
  revision?: number
  created_at?: number
  updated_at?: number
}

/** Whether a Draft contains anything the user can recover. Core normally
 * excludes empty rows from `draft.list`; keeping the same invariant at the
 * presentation boundary prevents historical/pre-migration rows or a mixed
 * runtime response from turning storage artifacts into user-visible cards. */
function hasRecoverableDraftContent(draft: StationDraft): boolean {
  const text = typeof draft.text === 'string'
    ? draft.text
    : typeof draft.text_preview === 'string' ? draft.text_preview : ''
  const attachmentCount = typeof draft.attachment_count === 'number'
    ? draft.attachment_count
    : Array.isArray(draft.attachments) ? draft.attachments.length : 0
  const chatNoteCount = typeof draft.chat_note_count === 'number'
    ? draft.chat_note_count
    : Array.isArray(draft.chat_notes) ? draft.chat_notes.length : 0
  return text.trim().length > 0 || attachmentCount > 0 || chatNoteCount > 0
}

function draftTitle(text: string, attachmentCount: number): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() || ''
  const preview = firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine
  if (preview) return `Draft · ${preview}`
  if (attachmentCount === 1) return 'Draft · 1 attachment'
  if (attachmentCount > 1) return `Draft · ${attachmentCount} attachments`
  return 'Draft'
}


/** Apply an authoritative Draft discard directly to the current station
 * snapshot. The dirty-stream event carries the identity of the deleted Draft,
 * so Willo does not need to leave a stale card visible while a multi-RPC
 * snapshot refresh is in flight. The following refresh still reconciles all
 * other state from Core. */
export function removeDraftFromStations(
  sessions: readonly StationSession[],
  draftId: string,
): StationSession[] {
  if (!draftId) return [...sessions]
  const syntheticId = `draft:${draftId}`
  return sessions
    .filter((session) => session.id !== syntheticId)
    .map((session) => {
      if (session.draftId !== draftId) return session
      const {
        draftId: _draftId,
        draftText: _draftText,
        draftAttachmentsJson: _draftAttachmentsJson,
        draftAttachmentCount: _draftAttachmentCount,
        hasDraft: _hasDraft,
        ...withoutDraft
      } = session
      return withoutDraft
    })
}

/** Session-owned Drafts decorate their Chat Session card. Only standalone/new-chat
 * Drafts become synthetic Draft cards. This keeps a reply Draft locked to the
 * conversation where it was typed. */
export function mergeDraftsIntoStations(
  sessions: readonly StationSession[],
  drafts: readonly StationDraft[],
): StationSession[] {
  const byId = new Map(sessions.map((session) => [session.id, { ...session }]))
  const standalone: StationSession[] = []
  for (const draft of drafts) {
    if (!hasRecoverableDraftContent(draft)) continue
    const sessionId = draft.chat_session_id || ''
    const owner = sessionId ? byId.get(sessionId) : undefined
    if (owner) {
      const attachments = Array.isArray(draft.attachments) ? draft.attachments : []
      owner.hasDraft = true
      owner.draftId = draft.draft_id
      owner.draftText = typeof draft.text === 'string'
        ? draft.text
        : typeof draft.text_preview === 'string' ? draft.text_preview : ''
      owner.draftAttachmentCount = typeof draft.attachment_count === 'number'
        ? draft.attachment_count
        : attachments.length
      owner.updated_at = Math.max(owner.updated_at || 0, draft.updated_at || 0)
      byId.set(sessionId, owner)
    } else if (!sessionId) {
      standalone.push(draftToStation(draft))
    }
  }
  return [...byId.values(), ...standalone]
}

/** Project a content-only Draft into Willo's station-card presentation model.
 * The synthetic card is navigation, not a Chat Session projection. */
export function draftToStation(draft: StationDraft): StationSession {
  const attachments = Array.isArray(draft.attachments) ? draft.attachments : []
  const attachmentCount = typeof draft.attachment_count === 'number' ? draft.attachment_count : attachments.length
  const text = typeof draft.text === 'string'
    ? draft.text
    : typeof draft.text_preview === 'string' ? draft.text_preview : ''
  return {
    id: `draft:${draft.draft_id}`,
    entityKind: 'draft',
    draftId: draft.draft_id,
    title: draftTitle(text, attachmentCount),
    status: 'draft',
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    hasDraft: true,
    draftText: text,
    draftAttachmentCount: attachmentCount,
    onGoing: false,
    isUnread: false,
  }
}
