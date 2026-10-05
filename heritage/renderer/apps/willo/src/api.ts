import { visibleProviders } from '../../../packages/design-system/src/providers'
// renderer/apps/willo/src/api.ts
//
// Willo Station transport: materialized Chat Session reads and native handoffs.

import { bridgeDiagnostic, call, callNative } from '@arbol/design-system'
import { mergeDraftsIntoStations, type StationDraft, type StationSession } from './stations'
export type { StationSession } from './stations'

export type StationMessage = {
  id: string
  seq?: number
  role: string
  content: string
  meta?: unknown
  created_at?: number
  turn_id?: string | null
  parent_turn_id?: string | null
}

export type StationSessionDetails = StationSession & {
  messages?: StationMessage[]
}

export type IntelligenceProvider = {
  name: string
  label?: string
  provider?: string
  default_model?: string | null
  enabled_models?: string[] | null
  deprecated?: number | boolean
}

const FALLBACK_SESSIONS: StationSession[] = [
  {
    id: 'sesh_demo_architecture',
    title: 'Elma · Arbol',
    ip_name: 'glm',
    model: '',
    status: 'idle',
    created_at: Date.now() - 1000 * 60 * 80,
    updated_at: Date.now() - 1000 * 60 * 8,
    workspace_dirs: ['~/repo/sylvan-stack/Arbol'],
    last_usage: { model: 'claude-sonnet-4-6', tokens_in: 12840, tokens_out: 2940, cost_usd: 0.18, ts: Date.now() - 1000 * 60 * 8 },
    onGoing: true,
    isUnread: false,
    hasDraft: true,
  },
  {
    id: 'sesh_demo_willo_handoff',
    title: 'Willo → Elma handoff',
    ip_name: 'codex',
    model: 'claude-sonnet-4-6',
    status: 'running',
    created_at: Date.now() - 1000 * 60 * 180,
    updated_at: Date.now() - 1000 * 60 * 3,
    workspace_dirs: ['~/repo/sylvan-stack/Arbol/renderer'],
    last_usage: { model: 'gpt-5', tokens_in: 4210, tokens_out: 890, cost_usd: null, ts: Date.now() - 1000 * 60 * 3 },
    onGoing: true,
    isUnread: false,
    hasDraft: false,
  },
  {
    id: 'sesh_demo_draft_notes',
    title: 'Draft · release notes follow-up',
    ip_name: 'codex',
    model: '',
    status: 'draft',
    created_at: Date.now() - 1000 * 60 * 240,
    updated_at: Date.now() - 1000 * 60 * 18,
    workspace_dirs: ['~/repo/sylvan-stack/Arbol'],
    last_usage: null,
    onGoing: false,
    isUnread: false,
    hasDraft: true,
  },
]

const FALLBACK_IPS: IntelligenceProvider[] = [
  { name: 'glm', label: 'z.ai', provider: 'claude', default_model: '', enabled_models: [] },
  { name: 'codex', label: 'Codex', provider: 'codex', default_model: 'gpt-5.5', enabled_models: ['gpt-5.5'] },
]

export const SESSION_COLOR_PALETTE = [
  '#F87171',
  '#FB7185',
  '#F472B6',
  '#E879F9',
  '#C084FC',
  '#A78BFA',
  '#818CF8',
  '#60A5FA',
  '#38BDF8',
  '#22D3EE',
  '#2DD4BF',
  '#34D399',
  '#4ADE80',
  '#84CC16',
  '#A3E635',
  '#FACC15',
  '#FBBF24',
  '#FB923C',
  '#FF8A65',
  '#D4A373',
  '#E5989B',
  '#B5838D',
  '#9D8189',
  '#CDB4DB',
  '#BDE0FE',
  '#A2D2FF',
  '#8ECAE6',
  '#90E0EF',
  '#80ED99',
  '#B7E4C7',
  '#D8F3DC',
  '#E9C46A',
  '#F4A261',
  '#E76F51',
  '#EF476F',
  '#FFD166',
  '#06D6A0',
  '#118AB2',
  '#7BDFF2',
  '#B2F7EF',
  '#EFF7F6',
  '#F7D6E0',
  '#F2B5D4',
  '#C9BBCF',
  '#A8DADC',
  '#BAD7F2',
  '#F1C0E8',
  '#CFBAF0',
  '#A3C4F3',
  '#98F5E1',
] as const


const SESSION_COLOR_KEY = 'arbol-willo-session-colors'

function readStoredSessionColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SESSION_COLOR_KEY) || '{}') as Record<string, string> } catch { return {} }
}

function writeStoredSessionColors(colors: Record<string, string>) {
  try { localStorage.setItem(SESSION_COLOR_KEY, JSON.stringify(colors)) } catch {}
}

export function randomSessionColor(): string {
  return SESSION_COLOR_PALETTE[Math.floor(Math.random() * SESSION_COLOR_PALETTE.length)]
}

export function ensureSessionColor(session: StationSession): StationSession {
  if (session.color) return session
  return ensureSessionColors([session])[0]
}

/** Assign stable colors to a whole station snapshot with one localStorage read
 * and, at most, one write. Calling ensureSessionColor for every row repeatedly
 * parsed and serialized the growing color map, making large Willo snapshots
 * quadratic in practice before Svelte could render the Drafted section. */
export function ensureSessionColors(sessions: readonly StationSession[]): StationSession[] {
  const colors = readStoredSessionColors()
  let changed = false
  const colored = sessions.map((session) => {
    if (session.color) return session
    let color = colors[session.id]
    if (!color) {
      color = randomSessionColor()
      colors[session.id] = color
      changed = true
    }
    return { ...session, color }
  })
  if (changed) writeStoredSessionColors(colors)
  return colored
}


function hasBridge(): boolean {
  return !!window.webkit?.messageHandlers?.arbol
}

export async function listSessions(limit = 100): Promise<StationSession[]> {
  if (!hasBridge()) return ensureSessionColors(FALLBACK_SESSIONS)
  try {
    // Chat Sessions and Drafts are independent entities but share Willo's card
    // presentation. Fetch both snapshots in parallel, then project every Draft
    // into a draft-only station card. Core returns only a bounded title preview,
    // not the complete composer content; the card never becomes a Chat Session row.
    const [r, ar, dr] = await Promise.all([
      call('chat_session.list', { limit, initiator_kind: 'leather_bag' }),
      call('chat_session.list', { limit, agentic: true }),
      call('draft.list', { limit, summary_only: true }).catch(() => null),
    ])
    // Bound each collection independently: a busy human station list must not
    // push every older agent-created chat beyond the shared snapshot limit.
    const sessions = [...((r?.chat_sessions as StationSession[]) || []),
      ...((ar?.chat_sessions as StationSession[]) || [])]
      .filter((session) => !!session?.id && session.status !== 'imported_readonly')
      .map((session) => ({ ...session, entityKind: 'chat_session' as const }))
    const drafts = ((dr?.drafts as StationDraft[]) || [])
      .filter((draft) => !!draft?.draft_id)
    // Reply Drafts decorate their owning Chat Session; only standalone/new-chat
    // Drafts are separate cards. No per-card hydration is required.
    return ensureSessionColors(mergeDraftsIntoStations(sessions, drafts))
  } catch (error) {
    // An RPC failure is not an empty station. Let the page retain its last good
    // snapshot and retry; collapsing transport errors to [] made a Willo launch
    // during a Core restart look permanently empty until another event happened.
    throw error
  }
}

export async function listStewardSessions(limit = 1000): Promise<StationSession[]> {
  if (!hasBridge()) return ensureSessionColors(FALLBACK_SESSIONS.filter((session) => session.initiator_kind === 'steward'))
  const r = await call('chat_session.list', { limit, initiator_kind: 'steward', include_archived: true })
  return ensureSessionColors(((r?.chat_sessions as StationSession[]) || [])
    .filter((session) => !!session?.id && session.status !== 'imported_readonly')
    .map((session) => ({ ...session, entityKind: 'chat_session' as const })))
}

export async function listIntelligenceProviders(): Promise<IntelligenceProvider[]> {
  if (!hasBridge()) return FALLBACK_IPS
  try {
    const r = await call('ip.list')
    return visibleProviders((r?.ips as IntelligenceProvider[]) || []).filter((ip) => !!ip?.name && !ip.deprecated)
  } catch {
    return []
  }
}


export async function getSessionDetails(sessionId: string): Promise<StationSessionDetails | null> {
  if (!hasBridge()) {
    const found = FALLBACK_SESSIONS.find((s) => s.id === sessionId)
    if (!found) return null
    return {
      ...ensureSessionColor(found),
      messages: [
        { id: `${sessionId}-m1`, seq: 0, role: 'user', content: `What is happening in ${found.title || sessionId}?`, created_at: found.created_at },
        { id: `${sessionId}-m2`, seq: 1, role: 'assistant', content: `This demo Willo station is indexed for search. It belongs to ${found.workspace_dirs?.[0] || 'a repository'} and can be opened in Elma.`, created_at: found.updated_at },
      ],
    }
  }
  try {
    const r = await call('chat_session.get', { id: sessionId })
    const session = r?.chat_session as StationSessionDetails | undefined
    return session?.id ? ensureSessionColor(session) as StationSessionDetails : null
  } catch {
    return null
  }
}

export async function getLightSession(sessionId: string): Promise<StationSession> {
  if (!hasBridge()) {
    const found = FALLBACK_SESSIONS.find((session) => session.id === sessionId)
    if (!found) throw new Error(`Chat Session not found: ${sessionId}`)
    return ensureSessionColor(found)
  }
  const r = await call('chat_session.get', { id: sessionId, light: true })
  const session = r?.chat_session as StationSession | undefined
  if (!session?.id) throw new Error(`Chat Session not found: ${sessionId}`)
  return ensureSessionColor(session)
}

export async function setSessionUnread(sessionId: string, isUnread: boolean): Promise<StationSession> {
  if (!hasBridge()) {
    const found = FALLBACK_SESSIONS.find((s) => s.id === sessionId)
    if (found) found.isUnread = isUnread
    return { ...(found || { id: sessionId }), isUnread }
  }
  const r = await call('chat_session.set_unread', { id: sessionId, isUnread })
  const session = r?.chat_session as StationSession | undefined
  if (!session?.id) throw new Error('Could not update unread flag')
  return session
}

export async function setSessionOnGoing(sessionId: string, onGoing: boolean): Promise<StationSession> {
  if (!hasBridge()) {
    const found = FALLBACK_SESSIONS.find((s) => s.id === sessionId)
    if (found) found.onGoing = onGoing
    return { ...(found || { id: sessionId }), onGoing }
  }
  const r = await call('chat_session.set_on_going', { id: sessionId, onGoing })
  const session = r?.chat_session as StationSession | undefined
  if (!session?.id) throw new Error('Could not update ongoing flag')
  return session
}


export async function renameSession(sessionId: string, title: string): Promise<StationSession> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Title cannot be empty')
  if (!hasBridge()) {
    const found = FALLBACK_SESSIONS.find((s) => s.id === sessionId)
    if (found) found.title = trimmed
    return { ...(found || { id: sessionId }), title: trimmed }
  }
  const r = await call('chat_session.rename', { id: sessionId, title: trimmed })
  const session = r?.chat_session as StationSession | undefined
  if (!session?.id) throw new Error('Could not rename session')
  return session
}

/** Open a chat session in Elma. The Swift host activates/launches Elma and passes
 *  the `session_id` as a one-shot query payload. Outside the host, this is a
 *  no-op except for logging (so Storybook/Vite previews remain harmless). */
export async function setAlwaysOnTop(on: boolean, minimal = false): Promise<void> {
  if (!hasBridge()) return
  const r = await callNative('app.setAlwaysOnTop', { on, minimal })
  if (!r?.ok) throw new Error(r?.error || 'Could not update window level')
}

export async function beginWindowDrag(): Promise<void> {
  if (!hasBridge()) return
  await callNative('app.beginWindowDrag', {})
}

/** Ensure the current Willo window is the key/active window before programmatic
 * focus. Compact Willo is a floating window, and Cmd-click can dispatch the
 * React click without giving the WebView key focus, so text input receives no
 * keyboard events until the user clicks the field manually. */
export async function focusCurrentWindow(): Promise<void> {
  if (!hasBridge()) return
  await callNative('app.focusWindow', {})
}

export type ElmaSearchHandoff = {
  query: string
  turnId?: string
  role?: 'user' | 'assistant'
  occurrenceIndex?: number
}

export async function openDraftInElma(draftId: string): Promise<void> {
  if (!draftId) throw new Error('Draft identity is missing')
  if (!hasBridge()) {
    console.info('Open Elma draft', draftId)
    return
  }
  const r = await callNative('app.open', { ui: 'elma', query: { draft_id: draftId } })
  if (!r?.ok) throw new Error(r?.error || 'Could not open Draft in Elma')
}

export async function openSessionInElma(sessionId: string, search?: ElmaSearchHandoff, restoreDraft = false): Promise<void> {
  const query: Record<string, unknown> = {
    session_id: sessionId,
    ...(restoreDraft ? { restore_draft: true } : {}),
  }
  if (search?.query) {
    query.search = search.query
    if (search.turnId) query.turn_id = search.turnId
    if (search.role) query.role = search.role
    if (typeof search.occurrenceIndex === 'number') query.occurrence_index = search.occurrenceIndex
  }
  if (!hasBridge()) {
    console.info('Open Elma session', sessionId, search || '')
    return
  }
  const openId = crypto.randomUUID()
  query.session_open_id = openId
  const started = performance.now()
  bridgeDiagnostic({ stage: 'open_click', app: 'willo', session_id: sessionId, session_open_id: openId, elapsed_ms: 0 })
  try {
    const r = await callNative('app.open', { ui: 'elma', query })
    bridgeDiagnostic({
      stage: 'native_open_returned', app: 'willo', session_id: sessionId, session_open_id: openId,
      elapsed_ms: performance.now() - started, outcome: r?.ok ? 'ok' : 'error',
      activated: Boolean(r?.activated), launched: Boolean(r?.launched), delivered: Boolean(r?.delivered),
      ...(r?.ok ? {} : { detail: String(r?.error || 'Could not open Elma').slice(0, 2048) }),
    })
    if (!r?.ok) return Promise.reject(new Error(r?.error || 'Could not open Elma'))
  } catch (error) {
    bridgeDiagnostic({
      stage: 'native_open_failed', app: 'willo', session_id: sessionId, session_open_id: openId,
      elapsed_ms: performance.now() - started, outcome: 'error',
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 2048),
    })
    throw error
  }
}

export type BlueprintRun = {
  id: string
  kind: 'blueprint' | 'chain'
  name: string
  status: string
  started_at?: string
  ended_at?: string
  recipe?: string
  model?: string
  inputs?: Record<string, unknown>
  run_key?: string
  total_steps?: number
  completed_steps?: number[]
  num_turns?: number
}

export type BlueprintRunEvent = import('./runPagination').RunEvent
export type BlueprintRunDetails = { run: BlueprintRun; events: BlueprintRunEvent[] }

const FALLBACK_RUNS: BlueprintRun[] = [
  { id: 'demo-blueprint', kind: 'blueprint', name: 'scout-codebase', status: 'done', started_at: new Date(Date.now() - 12 * 60_000).toISOString(), recipe: 'bro-opus-low', model: 'claude-opus-4-8', inputs: { repo: 'Arbol' }, num_turns: 8 },
  { id: 'demo-chain', kind: 'chain', name: 'prepare-ticket', status: 'running', started_at: new Date(Date.now() - 48 * 60_000).toISOString(), run_key: 'DEMO-10014', total_steps: 6, completed_steps: [1, 2, 3] },
]

export async function listBlueprintRuns(limit = 200): Promise<BlueprintRun[]> {
  if (!hasBridge()) return FALLBACK_RUNS
  try {
    const result = await call('blueprint_run.list', { limit })
    return (result?.runs as BlueprintRun[]) || []
  } catch { return [] }
}

export async function getBlueprintRun(id: string): Promise<BlueprintRunDetails | null> {
  if (!hasBridge()) {
    const run = FALLBACK_RUNS.find((item) => item.id === id)
    if (!run) return null
    return { run, events: [
      { id: '1', kind: 'user', role: 'user', text: 'Execute this blueprint run with the bound inputs.' },
      { id: '2', kind: 'assistant', role: 'assistant', text: 'I inspected the requested context and completed the run.\n\n## Result\nThe demo transcript is ready for review.' },
      { id: '3', kind: 'permission', role: 'system', text: 'Allowed: Read' },
    ] }
  }
  try {
    const result = await call('blueprint_run.get', { id })
    return result as BlueprintRunDetails
  } catch { return null }
}
