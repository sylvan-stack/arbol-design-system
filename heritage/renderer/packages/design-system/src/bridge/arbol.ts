import { providerCatalogDisplayNames } from '../providers'

/**
 * Bridge between the React renderer and the Swift host. Wraps the
 * webkit messageHandlers protocol: requests are callback-based, subscriptions
 * push events into a callback registered per sub_id.
 */

export type Reply =
  | { ok: true; result: any }
  | { ok: false; error: string }

export type StreamEvent = {
  kind?: 'event' | 'error'
  sub_id: string
  event: string
  data: any
}

type BridgeDiagnostic = {
  stage: string
  sub_id?: string
  stream?: string
  session_id?: string
  session_open_id?: string
  elapsed_ms?: number
  duration_ms?: number
  encoded_bytes?: number
  request_id?: string
  method?: string
  result_count?: number
  has_more?: boolean
  attempt?: number
  outcome?: string
  activated?: boolean
  launched?: boolean
  delivered?: boolean
  event?: string
  projection_seq?: number
  projected_status?: string
  detail?: string
  app?: string
  context?: string
  tool_use_id?: string
  reference_sha256?: string
  reference_encoded_bytes?: number
  requested_offset?: number
  returned_offset?: number
  returned_bytes?: number
  range_within_256_kib?: boolean
  continuation_offset?: number | null
}

const pending = new Map<string, (r: Reply) => void>()
const streams = new Map<string, (e: StreamEvent) => void>()
const streamDiagnostics = new Map<string, { stream: string; sessionId?: string; sessionOpenId?: string }>()
// The synthetic core lifecycle channels have MANY consumers per window (the
// global tail, live tails, page-level refreshers), so they need multicast
// registries. Storing them in `streams` under a fixed sub_id let the last
// registration silently clobber the others — and any consumer's cleanup
// deleted whoever was currently registered, leaving e.g. Willo with NO
// reconnect handler after a core restart (stale station cards).
const coreDisconnectHandlers = new Set<() => void>()
const coreReconnectHandlers = new Set<() => void>()

declare global {
  interface Window {
    __arbolReply?: (id: string, payload: Reply) => void
    __arbolEvent?: (event: StreamEvent) => void
    webkit?: any
  }
}

window.__arbolReply = (id, payload) => {
  const fn = pending.get(id)
  if (fn) {
    fn(payload)
    pending.delete(id)
  }
}

window.__arbolEvent = (event) => {
  if (event.sub_id === '__core__') {
    for (const h of [...coreDisconnectHandlers]) h()
    return
  }
  if (event.sub_id === '__core_reconnect__') {
    for (const h of [...coreReconnectHandlers]) h()
    return
  }
  const meta = streamDiagnostics.get(event.sub_id)
  if (event.kind === 'error') {
    // An error frame silently ends its stream unless the consumer handles it;
    // record it regardless so a dead subscription is visible in the log.
    bridgeDiagnostic({
      stage: 'renderer_stream_error',
      sub_id: event.sub_id,
      stream: meta?.stream,
      session_id: meta?.sessionId,
      session_open_id: meta?.sessionOpenId,
      event: event.event,
      detail: typeof event.data === 'string' ? event.data.slice(0, 2048) : undefined,
    })
  }
  if (meta?.stream === 'chat_session.render') {
    const page = event.data && typeof event.data === 'object' ? event.data : {}
    const view = page.view && typeof page.view === 'object' ? page.view : {}
    bridgeDiagnostic({
      stage: 'renderer_bridge_frame',
      sub_id: event.sub_id,
      stream: meta.stream,
      session_id: meta.sessionId,
      event: event.event,
      projection_seq: typeof page.projection_seq === 'number' ? page.projection_seq : undefined,
      projected_status: typeof view.status === 'string' ? view.status : undefined,
    })
  }
  const fn = streams.get(event.sub_id)
  if (fn) fn(event)
}

const uuid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
  Math.random().toString(36).slice(2) + Date.now().toString(36)

export function bridgeDiagnostic(diagnostic: BridgeDiagnostic) {
  postBridge({ kind: 'diagnostic', diagnostic })
}

/* ---- renderer error reporting ----------------------------------------- */
/* Renderer failures were previously visible only in the WebView console —
 * invisible without Web Inspector attached, so every UI incident turned into
 * log archaeology. Everything below lands in chat-render.log through the same
 * host diagnostic sink as the render-stream telemetry. */

const ERROR_DETAIL_MAX = 4096
// Token bucket so a render loop can't flood the diagnostic log: bursts of up
// to 20, refilled 1 per 3 s. One synthetic "suppressed" record marks each gap.
let errorTokens = 20
let errorLastRefill = Date.now()
let errorSuppressed = 0
let reportingError = false // re-entrancy guard (console.error is wrapped below)

function formatErrorDetail(value: unknown): string {
  let text: string
  if (value instanceof Error) {
    text = `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`
  } else if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return (text ?? '').slice(0, ERROR_DETAIL_MAX)
}

function takeErrorToken(): boolean {
  const now = Date.now()
  errorTokens = Math.min(20, errorTokens + Math.floor((now - errorLastRefill) / 3_000))
  if (errorTokens > 0) errorLastRefill = now
  if (errorTokens <= 0) {
    errorSuppressed += 1
    return false
  }
  errorTokens -= 1
  if (errorSuppressed > 0) {
    const skipped = errorSuppressed
    errorSuppressed = 0
    postBridge({
      kind: 'diagnostic',
      diagnostic: { stage: 'renderer_error_suppressed', detail: `${skipped} error reports rate-limited` },
    })
  }
  return true
}

/** Report a renderer-side failure into the host diagnostic log (chat-render.log).
 * Safe to call from anywhere; bounded, rate-limited, and re-entrancy-guarded. */
export function reportRendererError(
  context: string,
  error: unknown,
  extra?: Pick<BridgeDiagnostic, 'app' | 'session_id' | 'stream' | 'sub_id'>,
): void {
  if (reportingError) return
  reportingError = true
  try {
    if (!takeErrorToken()) return
    postBridge({
      kind: 'diagnostic',
      diagnostic: { stage: 'renderer_error', context, detail: formatErrorDetail(error), ...extra },
    })
  } catch {
    // Reporting must never take the app down with it.
  } finally {
    reportingError = false
  }
}

/** Install window-level capture: uncaught errors, unhandled promise
 * rejections, and console.error. Call once from each app's main.ts. */
export function installGlobalErrorReporting(app: string): void {
  window.addEventListener('error', (event) => {
    reportRendererError('window_error', event.error ?? event.message, { app })
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportRendererError('unhandled_rejection', event.reason, { app })
  })
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    original(...args)
    if (reportingError) return
    reportRendererError('console_error', args.map(formatErrorDetail).join(' '), { app })
  }
}

function postBridge(msg: Record<string, unknown>) {
  if (!window.webkit?.messageHandlers?.arbol) {
    console.warn('arbol bridge missing; running outside Swift host')
    return
  }
  // WKWebView's postMessage serialization silently DROPS any value that is a
  // JS Proxy — including Svelte 5 $state arrays/objects passed as params — so
  // the Swift host would receive the dict with those keys missing entirely.
  // Everything crossing the bridge is JSON-bound anyway (Swift re-encodes it
  // for the core socket), so a JSON round-trip here is lossless and unwraps
  // proxies before WebKit can eat them.
  window.webkit.messageHandlers.arbol.postMessage(JSON.parse(JSON.stringify(msg)))
}

export function call(method: string, params: any = {}): Promise<any> {
  const id = uuid()
  return new Promise<any>((resolve, reject) => {
    pending.set(id, (r) =>
      r.ok ? resolve(providerCatalogDisplayNames(method, r.result)) : reject(new Error(r.error))
    )
    postBridge({ kind: 'request', callbackId: id, method, params })
  })
}

/** Call a NATIVE handler in the Swift host (not arbol-core) — e.g. the Claude
 * web-session usage/login. Same reply channel as `call`. */
export function callNative(method: string, params: any = {}): Promise<any> {
  const id = uuid()
  return new Promise<any>((resolve, reject) => {
    pending.set(id, (r) =>
      r.ok ? resolve(r.result) : reject(new Error(r.error))
    )
    postBridge({ kind: 'native', callbackId: id, method, params })
  })
}

export function subscribe(
  stream: string,
  params: any,
  onEvent: (e: StreamEvent) => void
): () => void {
  const subId = uuid()
  streams.set(subId, onEvent)
  const sessionId = typeof params?.chat_session_id === 'string' ? params.chat_session_id : undefined
  const sessionOpenId = typeof params?.session_open_id === 'string' ? params.session_open_id : undefined
  streamDiagnostics.set(subId, { stream, sessionId, sessionOpenId })
  bridgeDiagnostic({ stage: 'renderer_subscribe', sub_id: subId, stream, session_id: sessionId, session_open_id: sessionOpenId })
  postBridge({ kind: 'subscribe', subId, stream, params })
  return () => {
    bridgeDiagnostic({ stage: 'renderer_unsubscribe', sub_id: subId, stream, session_id: sessionId, session_open_id: sessionOpenId })
    postBridge({ kind: 'unsubscribe', sub_id: subId })
    streams.delete(subId)
    streamDiagnostics.delete(subId)
  }
}

// Always-on subscription for the synthetic "__core__" disconnect channel.
// Multicast: every registered handler fires; the cleanup removes only its own.
export function onCoreDisconnect(handler: () => void): () => void {
  coreDisconnectHandlers.add(handler)
  return () => {
    coreDisconnectHandlers.delete(handler)
  }
}

// Always-on subscription for the synthetic "__core_reconnect__" channel — the
// Swift host fires this when the socket reconnects after a drop (subscriptions
// were dropped, so the renderer must reattach). Consumers resubscribe with
// `since_session_seq` for seq-based catch-up (event-sourcing.md §12) instead of
// guessing with a timer.
// Multicast: every registered handler fires; the cleanup removes only its own.
export function onCoreReconnect(handler: () => void): () => void {
  coreReconnectHandlers.add(handler)
  return () => {
    coreReconnectHandlers.delete(handler)
  }
}
