// Chat render binding. Core owns the durable materialized view; Elma renders
// ready-to-use DTOs and never replays or folds the durable event log.
import { readable, type Readable } from 'svelte/store'
import { notifyRenderInvalidation } from './renderInvalidation'

import type { TokenUsage, TransientFrame } from './catalog.gen'
import { initialChatSession, type ChatSessionView } from './view'

export interface ArbolStreamEvent { event: string; data: any }
export interface ArbolBridge {
  call(method: string, params?: any): Promise<any>
  subscribe(stream: string, params: any, onEvent: (e: ArbolStreamEvent) => void): () => void
  onCoreReconnect(handler: () => void): () => void
  diagnostic?(diagnostic: ProjectionDiagnostic): void
}

export interface ProjectionDiagnostic {
  stage: string
  session_id: string
  session_open_id?: string
  elapsed_ms?: number
  encoded_bytes?: number
  event?: string
  projection_seq?: number
  projected_status?: string
  detail?: string
  duration_ms?: number
  request_id?: string
  method?: string
  result_count?: number
  has_more?: boolean
  attempt?: number
  outcome?: string
}

export interface ToolOutputOverlay { stdout: string; stderr: string; updatedAt: number }
export interface NativeToolBoundary {
  toolUseId: string
  thinkingOffset: number
  textOffset: number
  ts: number
  seq?: number
}
export interface RateLimitWaitOverlay {
  retryAt: number
  ipName: string
  recoverySeconds: number
}
export interface StreamingOverlay {
  text: string
  thinking: string
  nativeToolBoundaries?: NativeToolBoundary[]
  toolOutputs: Record<string, ToolOutputOverlay>
  /** Core is waiting out a rate-limit ban before re-dialing the same IP. */
  rateLimitWait?: RateLimitWaitOverlay | null
  /** Cumulative usage reported for the currently running Turn. */
  usage?: TokenUsage | null
}
export interface ChatSessionRender {
  view: ChatSessionView
  streaming: StreamingOverlay
  historyHydrated: boolean
  hasMoreHistory: boolean
  loadingOlderHistory: boolean
  loadOlderHistory: () => Promise<void>
}

type RenderPage = {
  view?: unknown
  next_before_turn_seq?: unknown
  projection_seq?: unknown
  storage_generation?: unknown
}

const EMPTY_OVERLAY: StreamingOverlay = { text: '', thinking: '', nativeToolBoundaries: [], toolOutputs: {} }
const MAX_TOOL_OUTPUT_CHARS = 12 * 1024
const appendCapped = (existing: string, chunk: string): string => {
  const next = existing + chunk
  return next.length > MAX_TOOL_OUTPUT_CHARS ? next.slice(-MAX_TOOL_OUTPUT_CHARS) : next
}

function transientFrame(frame: ArbolStreamEvent): TransientFrame | null {
  const data = (frame.data || {}) as Record<string, any>
  switch (frame.event) {
    case 'assistant.text_delta':
      return typeof data.text === 'string'
        ? { type: 'assistant.text_delta', payload: { text: data.text } } as TransientFrame
        : null
    case 'assistant.thinking_delta':
      return typeof data.thinking === 'string'
        ? { type: 'assistant.thinking_delta', payload: { thinking: data.thinking } } as TransientFrame
        : null
    case 'usage.tick':
      return { type: 'usage.tick', payload: data } as TransientFrame
    case 'tool_request_output':
      return typeof data.request_id === 'string' && typeof data.text === 'string'
        ? { type: 'tool_request_output', payload: data } as TransientFrame
        : null
    case 'turn.rate_limit_wait':
      return { type: 'turn.rate_limit_wait', payload: data } as TransientFrame
    default:
      return null
  }
}

function validView(value: unknown, chatSessionId: string): ChatSessionView {
  if (!value || typeof value !== 'object') return initialChatSession(chatSessionId)
  const view = value as ChatSessionView
  return {
    ...initialChatSession(chatSessionId),
    ...view,
    chat_session_id: chatSessionId,
    toolRequests: view.toolRequests || {},
    toolRequestParams: view.toolRequestParams || {},
    toolRequestOpenedAt: view.toolRequestOpenedAt || {},
    messages: view.messages || [],
    toolResults: view.toolResults || [],
    nativeToolCalls: view.nativeToolCalls || [],
    turns: view.turns || {},
  }
}

function mergeViews(older: ChatSessionView, newer: ChatSessionView): ChatSessionView {
  const by = <T>(items: T[], key: (item: T) => string): T[] => {
    const values = new Map<string, T>()
    for (const item of items) values.set(key(item), item)
    return [...values.values()]
  }
  return {
    ...newer,
    messages: by([...older.messages, ...newer.messages], (m) => m.id)
      .sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0))),
    nativeToolCalls: by([...older.nativeToolCalls, ...newer.nativeToolCalls], (c) => JSON.stringify([c.turn_id, c.tool_use_id]))
      .sort((a, b) => (a.invoked_ts - b.invoked_ts) || ((a.seq || 0) - (b.seq || 0))),
    toolResults: by([...older.toolResults, ...newer.toolResults], (r) => r.request_id),
    turns: { ...older.turns, ...newer.turns },
  }
}

function pageCursor(page: RenderPage): number | null {
  const raw = page?.next_before_turn_seq
  return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null
}

function projectionSeq(page: RenderPage): number {
  const raw = Number(page?.projection_seq)
  return Number.isFinite(raw) && raw >= 0 ? raw : 0
}

// Live invalidations are the fast path, but WebKit stream delivery is not a
// durable acknowledgement. Revalidate every visible attached session at a low
// cadence: a stream can go quiet before the renderer observes that an idle
// session became running, in which case a running-only watchdog never starts.
// Poll running sessions more quickly so terminal state still settles promptly.
export const RUNNING_PROJECTION_REVALIDATE_MS = 750
export const IDLE_PROJECTION_REVALIDATE_MS = 2_000
const PROJECTION_READ_TIMEOUT_MS = 5_000

class ChatSessionStore {
  private state: ChatSessionRender
  private listeners = new Set<() => void>()
  private latestProjectionSeq = -1
  private storageGeneration = 'legacy'
  private retiredGenerations = new Set<string>()
  // A snapshot is accepted before its initial read commonly returns.  That
  // read may describe the same projection revision but carry a more terminal
  // status (Core commits its event rows before the fanout reaches WebKit).
  // Keep a small fingerprint alongside the sequence so equal-sequence pages
  // are not unconditionally discarded as stale.
  private latestProjectionFingerprint = ''
  private nextBeforeTurnSeq: number | null = null
  private pageLoader: null | ((before: number) => Promise<void>) = null
  private refreshRunning = false
  private refreshRequested = false
  private transcriptRequestedReported = false
  private firstHistoryReceivedReported = false

  constructor(private readonly chatSessionId: string, private readonly sessionOpenId?: string) {
    this.state = {
      view: initialChatSession(chatSessionId), streaming: EMPTY_OVERLAY,
      historyHydrated: false, hasMoreHistory: false, loadingOlderHistory: false,
      loadOlderHistory: async () => this.loadOlderHistory(),
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): ChatSessionRender => this.state
  private set(next: ChatSessionRender): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  private applyTransient(frame: TransientFrame): void {
    if (frame.type === 'assistant.text_delta') {
      this.set({ ...this.state, streaming: { ...this.state.streaming, text: this.state.streaming.text + frame.payload.text } })
    } else if (frame.type === 'assistant.thinking_delta') {
      this.set({ ...this.state, streaming: { ...this.state.streaming, thinking: this.state.streaming.thinking + frame.payload.thinking } })
    } else if (frame.type === 'usage.tick') {
      const partial = frame.payload.partial
      this.set({
        ...this.state,
        streaming: {
          ...this.state.streaming,
          usage: {
            model: typeof partial?.model === 'string' ? partial.model : '',
            tokens_in: Number.isFinite(Number(partial?.tokens_in)) ? Number(partial.tokens_in) : 0,
            tokens_out: Number.isFinite(Number(partial?.tokens_out)) ? Number(partial.tokens_out) : 0,
            cost_usd: Number.isFinite(Number(partial?.cost_usd)) ? Number(partial.cost_usd) : 0,
          },
        },
      })
    } else if (frame.type === 'turn.rate_limit_wait') {
      const retryAt = Number(frame.payload.retry_at) || 0
      this.set({
        ...this.state,
        streaming: {
          ...this.state.streaming,
          rateLimitWait: retryAt > 0
            ? {
                retryAt,
                ipName: String(frame.payload.ip_name || ''),
                recoverySeconds: Number(frame.payload.recovery_seconds) || 0,
              }
            : null,
        },
      })
    } else if (frame.type === 'tool_request_output') {
      const requestId = frame.payload.request_id
      const stream = frame.payload.stream === 'stderr' ? 'stderr' : 'stdout'
      const existing = this.state.streaming.toolOutputs[requestId] || { stdout: '', stderr: '', updatedAt: 0 }
      this.set({
        ...this.state,
        streaming: { ...this.state.streaming, toolOutputs: {
          ...this.state.streaming.toolOutputs,
          [requestId]: { ...existing, [stream]: appendCapped(existing[stream], frame.payload.text), updatedAt: Date.now() },
        } },
      })
    }
  }

  private applyLatestPage(page: RenderPage): void {
    const storageGeneration = typeof page.storage_generation === 'string' ? page.storage_generation : 'legacy'
    if (this.retiredGenerations.has(storageGeneration)) return
    if (storageGeneration !== this.storageGeneration) {
      this.retiredGenerations.add(this.storageGeneration)
      this.storageGeneration = storageGeneration
      this.latestProjectionSeq = -1
      this.latestProjectionFingerprint = ''
      this.nextBeforeTurnSeq = null
      this.set({ ...this.state, view: initialChatSession(this.chatSessionId), streaming: EMPTY_OVERLAY,
        historyHydrated: false, hasMoreHistory: false, loadingOlderHistory: false })
    }
    const seq = projectionSeq(page)
    const view = validView(page?.view, this.chatSessionId)
    const fingerprint = JSON.stringify({
      status: view.status,
      // Session chrome is part of the materialized DTO too. Without this, an
      // ongoing-only update at an equal projection revision is discarded.
      onGoing: view.onGoing,
      turn: view.turn,
      lastTurnTerminal: view.lastTurnTerminal,
      messageCount: view.messages.length,
      toolResultCount: view.toolResults.length,
      nativeToolCallCount: view.nativeToolCalls.length,
    })
    if (seq < this.latestProjectionSeq) return
    if (seq === this.latestProjectionSeq && fingerprint === this.latestProjectionFingerprint) return
    const previous = this.state.view
    const previousToolIds = new Set(previous.nativeToolCalls.map((call) => JSON.stringify([call.turn_id, call.tool_use_id])))
    const newCalls = view.nativeToolCalls.filter((call) => !previousToolIds.has(JSON.stringify([call.turn_id, call.tool_use_id])))
    const previousLastMessageSeq = Math.max(0, ...previous.messages.map((message) => message.seq || 0))
    const nextLastMessageSeq = Math.max(0, ...view.messages.map((message) => message.seq || 0))
    // The Turn in flight continues across tool-boundary seals; only a terminal
    // status or a genuinely new Turn invalidates its transient overlay.
    const turnContinues = view.status === 'running'
      && view.turn != null
      && previous.turn != null
      && view.turn.turn_id === previous.turn.turn_id
    const phaseSealed = !turnContinues
      || view.turn?.phase === 'awaiting_tools'
      || nextLastMessageSeq > previousLastMessageSeq
    let streaming = phaseSealed ? EMPTY_OVERLAY : this.state.streaming
    if (phaseSealed && turnContinues) {
      // Text/thinking are folded into durable messages at tool boundaries, but
      // the usage tick is cumulative Turn state, not a stream fragment. Wiping
      // it with the text overlay reset the token cockpit to zero between
      // cycles and double-counted the transferred total once the tick resumed.
      streaming = { ...EMPTY_OVERLAY, usage: this.state.streaming.usage }
    }
    if (!phaseSealed && newCalls.length) {
      streaming = {
        ...streaming,
        nativeToolBoundaries: [
          ...(streaming.nativeToolBoundaries || []),
          ...newCalls.map((call) => ({
            toolUseId: call.tool_use_id,
            thinkingOffset: streaming.thinking.length,
            textOffset: streaming.text.length,
            ts: call.invoked_ts,
            seq: call.seq,
          })),
        ],
      }
    }
    this.latestProjectionSeq = seq
    this.latestProjectionFingerprint = fingerprint
    this.nextBeforeTurnSeq = pageCursor(page)
    this.set({
      ...this.state,
      view,
      streaming,
      historyHydrated: true,
      hasMoreHistory: this.nextBeforeTurnSeq !== null,
      loadingOlderHistory: false,
    })
  }

  private async loadOlderHistory(): Promise<void> {
    if (this.state.loadingOlderHistory || this.nextBeforeTurnSeq === null || !this.pageLoader) return
    this.set({ ...this.state, loadingOlderHistory: true })
    try { await this.pageLoader(this.nextBeforeTurnSeq) }
    catch { this.set({ ...this.state, loadingOlderHistory: false }) }
  }

  connect(bridge: ArbolBridge): () => void {
    let cancelled = false
    let liveUnsub: null | (() => void) = null
    let generation = 0
    let refreshRetryTimer: ReturnType<typeof setTimeout> | null = null
    let projectionRevalidateTimer: ReturnType<typeof setTimeout> | null = null
    let refreshRetryDelayMs = 100
    const diagnostic = (stage: string, details: Omit<ProjectionDiagnostic, 'stage' | 'session_id' | 'session_open_id'> = {}) => {
      bridge.diagnostic?.({ stage, session_id: this.chatSessionId, ...(this.sessionOpenId ? { session_open_id: this.sessionOpenId } : {}), ...details })
    }

    const clearRefreshRetry = () => {
      if (refreshRetryTimer !== null) clearTimeout(refreshRetryTimer)
      refreshRetryTimer = null
    }

    const clearProjectionRevalidate = () => {
      if (projectionRevalidateTimer !== null) clearTimeout(projectionRevalidateTimer)
      projectionRevalidateTimer = null
    }

    const readPage = async (params: Record<string, unknown>): Promise<RenderPage> => {
      const started = performance.now()
      const requestId = this.sessionOpenId ? crypto.randomUUID() : undefined
      const rpcParams = {
        ...params,
        ...(this.sessionOpenId ? { session_open_id: this.sessionOpenId } : {}),
        ...(requestId ? { session_open_request_id: requestId } : {}),
      }
      diagnostic('transcript_rpc_started', { request_id: requestId })
      let timeout: ReturnType<typeof setTimeout> | null = null
      try {
        const page = await Promise.race([
          bridge.call('chat_session.transcript_page', rpcParams) as Promise<RenderPage>,
          new Promise<RenderPage>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('projection read timed out')), PROJECTION_READ_TIMEOUT_MS)
          }),
        ])
        diagnostic('transcript_rpc_completed', {
          request_id: requestId, duration_ms: performance.now() - started,
          result_count: Object.keys((page?.view as ChatSessionView | undefined)?.turns || {}).length,
          has_more: pageCursor(page) !== null,
        })
        return page
      } catch (error) {
        diagnostic('transcript_rpc_failed', {
          request_id: requestId, duration_ms: performance.now() - started,
          detail: error instanceof Error ? error.message : String(error),
        })
        throw error
      } finally {
        if (timeout !== null) clearTimeout(timeout)
      }
    }

    const installPageLoader = (attempt: number) => {
      this.pageLoader = async (before: number) => {
        const requestedGeneration = this.storageGeneration
        const requestedRevision = this.latestProjectionSeq
        const olderPage = await readPage({
          chat_session_id: this.chatSessionId, before_turn_seq: before, limit: 12,
          ...(requestedGeneration !== 'legacy' ? { storage_generation: requestedGeneration } : {}),
        })
        if (cancelled || attempt !== generation) return
        const receivedGeneration = typeof olderPage.storage_generation === 'string' ? olderPage.storage_generation : 'legacy'
        if (receivedGeneration !== this.storageGeneration || requestedGeneration !== this.storageGeneration
            || requestedRevision !== this.latestProjectionSeq || projectionSeq(olderPage) !== this.latestProjectionSeq) {
          this.set({ ...this.state, loadingOlderHistory: false })
          void refresh(attempt)
          return
        }
        const older = validView(olderPage?.view, this.chatSessionId)
        this.nextBeforeTurnSeq = pageCursor(olderPage)
        this.set({
          ...this.state,
          view: mergeViews(older, this.state.view),
          hasMoreHistory: this.nextBeforeTurnSeq !== null,
          loadingOlderHistory: false,
        })
      }
    }

    let refresh: (attempt: number) => Promise<void>

    const scheduleProjectionRevalidate = (attempt: number) => {
      clearProjectionRevalidate()
      if (cancelled || attempt !== generation) return
      const delay = this.state.view.status === 'running'
        ? RUNNING_PROJECTION_REVALIDATE_MS
        : IDLE_PROJECTION_REVALIDATE_MS
      projectionRevalidateTimer = setTimeout(() => {
        projectionRevalidateTimer = null
        void refresh(attempt)
      }, delay)
    }

    refresh = async (attempt: number) => {
      this.refreshRequested = true
      if (this.refreshRunning) return
      this.refreshRunning = true
      try {
        while (this.refreshRequested && !cancelled && attempt === generation) {
          this.refreshRequested = false
          if (!this.transcriptRequestedReported) {
            this.transcriptRequestedReported = true
            diagnostic('transcript_requested')
          }
          const page = await readPage({
            chat_session_id: this.chatSessionId, limit: 12,
          })
          let encodedBytes: number | undefined
          try { encodedBytes = new TextEncoder().encode(JSON.stringify(page)).byteLength } catch {}
          if (!this.firstHistoryReceivedReported) {
            this.firstHistoryReceivedReported = true
            diagnostic('first_usable_history_received', {
              encoded_bytes: encodedBytes,
              result_count: Object.keys((page?.view as ChatSessionView | undefined)?.turns || {}).length,
              has_more: pageCursor(page) !== null,
            })
          }
          const pageView = validView(page?.view, this.chatSessionId)
          diagnostic('renderer_projection_read', {
            projection_seq: projectionSeq(page), projected_status: pageView.status ?? undefined,
          })
          if (!cancelled && attempt === generation) {
            this.applyLatestPage(page)
            installPageLoader(attempt)
            refreshRetryDelayMs = 100
            clearRefreshRetry()
            scheduleProjectionRevalidate(attempt)
          }
        }
      } catch (error) {
        diagnostic('renderer_projection_read_failed', { detail: error instanceof Error ? error.message : String(error) })
        // Keep the invalidation pending. A terminal event may be the final frame
        // on this stream, so waiting for another event can otherwise leave the
        // last successful `running` projection visible forever after one
        // transient RPC failure.
        if (!cancelled && attempt === generation) {
          this.refreshRequested = true
          if (refreshRetryTimer === null) {
            const delay = refreshRetryDelayMs
            refreshRetryDelayMs = Math.min(refreshRetryDelayMs * 2, 2_000)
            diagnostic('renderer_projection_retry', { detail: `retrying in ${delay}ms` })
            refreshRetryTimer = setTimeout(() => {
              refreshRetryTimer = null
              void refresh(attempt)
            }, delay)
          }
        }
      } finally {
        this.refreshRunning = false
      }
    }

    const open = () => {
      const attempt = ++generation
      this.refreshRequested = false
      refreshRetryDelayMs = 100
      clearRefreshRetry()
      clearProjectionRevalidate()
      liveUnsub?.()
      diagnostic('renderer_projection_open')
      notifyRenderInvalidation(bridge, this.chatSessionId)
      liveUnsub = bridge.subscribe('chat_session.render', {
        chat_session_id: this.chatSessionId,
        ...(this.sessionOpenId ? { session_open_id: this.sessionOpenId } : {}),
      }, (frame) => {
        if (cancelled || attempt !== generation) return
        const framePage = (frame.data || {}) as RenderPage
        const frameView = frame.event === 'chat_session.render_snapshot'
          ? validView(framePage.view, this.chatSessionId) : null
        diagnostic('renderer_stream_frame', {
          event: frame.event,
          projection_seq: frame.event === 'chat_session.render_snapshot' ? projectionSeq(framePage) : undefined,
          projected_status: frameView?.status ?? undefined,
        })
        if (frame.event === 'chat_session.render_snapshot') {
          notifyRenderInvalidation(bridge, this.chatSessionId)
          this.applyLatestPage((frame.data || {}) as RenderPage)
          installPageLoader(attempt)
          scheduleProjectionRevalidate(attempt)
          return
        }
        if (frame.event === 'chat_session.render_changed') {
          notifyRenderInvalidation(bridge, this.chatSessionId)
          void refresh(attempt)
          return
        }
        const transient = transientFrame(frame)
        if (transient) this.applyTransient(transient)
      })
      // Also issue one bounded read. It gives a useful static view against an
      // older Core that does not yet expose chat_session.render, without ever
      // asking Core for historical facts. Projection ordering prevents a
      // late response from overwriting a newer stream snapshot.
      void refresh(attempt)
    }

    open()
    const offReconnect = bridge.onCoreReconnect(() => { if (!cancelled) open() })
    return () => {
      cancelled = true
      ++generation
      clearRefreshRetry()
      clearProjectionRevalidate()
      offReconnect()
      liveUnsub?.()
      this.pageLoader = null
    }
  }
}

export function chatSessionView(
  bridge: ArbolBridge, chatSessionId: string | null, sessionOpenId?: string,
): Readable<ChatSessionRender> {
  if (!chatSessionId) return readable({
    view: initialChatSession(''), streaming: EMPTY_OVERLAY, historyHydrated: true,
    hasMoreHistory: false, loadingOlderHistory: false, loadOlderHistory: async () => {},
  })
  const store = new ChatSessionStore(chatSessionId, sessionOpenId)
  return readable(store.getSnapshot(), (set) => {
    const unsub = store.subscribe(() => set(store.getSnapshot()))
    const disconnect = store.connect(bridge)
    return () => { unsub(); disconnect() }
  })
}
