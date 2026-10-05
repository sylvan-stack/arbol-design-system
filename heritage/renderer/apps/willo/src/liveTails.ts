// renderer/apps/willo/src/liveTails.ts
//
// Live agent-response tails and rolling generation speed for station cards.
// Each running chat session gets its own UI-facing `chat_session.render`
// subscription. Core exposes transient assistant deltas on that stream while
// durable state remains behind materialized projection invalidations. The UI accumulates the last few
// generated characters, live Provider usage, and rolling per-session samples
// from those transient frames. Generation rates still use the common display
// estimate of four generated characters per token because usage ticks arrive
// only at Provider cycle boundaries.

import { subscribe, onCoreReconnect, type StreamEvent } from '@arbol/design-system'
import type { TokenUsage } from './stations'

export const TAIL_MAX_CHARS = 180
export const ONE_MINUTE_MS = 60_000
export const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
export const ESTIMATED_CHARACTERS_PER_TOKEN = 4

export type GenerationSample = {
  at: number
  characters: number
}

export type GenerationActivity = {
  /** When this UI began observing the current running turn. */
  startedAt: number
  samples: GenerationSample[]
}

export type GenerationSpeed = {
  /** Estimated generated tokens per minute during the last minute. */
  oneMinute: number
  /** Estimated generated tokens per minute during the last five minutes. */
  fiveMinutes: number
}

export type LiveSessionUpdate = {
  tail?: string
  chunk?: string
  usage?: TokenUsage
  /** A projected idle/error terminal snapshot is ready for authoritative refresh. */
  terminal?: boolean
  /** Re-read status after a projection invalidation or missed live delivery. */
  refresh?: boolean
  at: number
}

export const ZERO_GENERATION_SPEED: GenerationSpeed = Object.freeze({
  oneMinute: 0,
  fiveMinutes: 0,
})

export function beginGenerationActivity(at = Date.now()): GenerationActivity {
  return { startedAt: at, samples: [] }
}

/** Unicode code-point count for a generated chunk (rather than UTF-16 units). */
export function generatedCharacterCount(chunk: string): number {
  return Array.from(chunk).length
}

/** Add one generated chunk and discard samples outside the longest window. */
export function recordGeneratedChunk(
  activity: GenerationActivity,
  chunk: string,
  at = Date.now(),
): GenerationActivity {
  const characters = generatedCharacterCount(chunk)
  if (characters === 0) return activity
  const cutoff = at - FIVE_MINUTES_MS
  return {
    startedAt: activity.startedAt,
    samples: [
      ...activity.samples.filter((sample) => sample.at > cutoff),
      { at, characters },
    ],
  }
}

function averageEstimatedTokensPerMinute(
  activity: GenerationActivity,
  now: number,
  windowMs: number,
): number {
  const windowStart = Math.max(activity.startedAt, now - windowMs)
  const characters = activity.samples.reduce(
    (total, sample) => sample.at > windowStart && sample.at <= now
      ? total + sample.characters
      : total,
    0,
  )
  if (characters === 0) return 0
  // Before a complete window has elapsed, average over the observed portion of
  // the turn. A one-second floor avoids an unbounded first-frame rate. Token
  // counts are estimated because transient provider frames expose text only.
  const elapsedMinutes = Math.max(1_000, now - windowStart) / ONE_MINUTE_MS
  const estimatedTokens = characters / ESTIMATED_CHARACTERS_PER_TOKEN
  return estimatedTokens / elapsedMinutes
}

/** Rolling estimated-token rates. Calling this on a timer naturally decays a
 * quiet running session to 0 for 1m and, eventually, for 5m. */
export function generationSpeeds(
  activity: GenerationActivity | undefined,
  now = Date.now(),
): GenerationSpeed {
  if (!activity) return ZERO_GENERATION_SPEED
  return {
    oneMinute: averageEstimatedTokensPerMinute(activity, now, ONE_MINUTE_MS),
    fiveMinutes: averageEstimatedTokensPerMinute(activity, now, FIVE_MINUTES_MS),
  }
}

export function generationIsStale(speed: GenerationSpeed): boolean {
  return speed.oneMinute === 0 && speed.fiveMinutes === 0
}

export function formatGenerationSpeed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return String(Math.max(1, Math.round(value)))
}

/** Append a streamed chunk, keeping only the last `maxChars` of the tail. */
export function appendTail(existing: string, chunk: string, maxChars = TAIL_MAX_CHARS): string {
  const next = (existing + chunk).replace(/\s+/g, ' ').trimStart()
  return next.length > maxChars ? next.slice(-maxChars) : next
}

/** The generated-text chunk carried by a live frame, or '' for non-text frames. */
export function textChunkFromLiveEvent(e: Pick<StreamEvent, 'event' | 'data'>): string {
  const data = (e.data || {}) as Record<string, unknown>
  if (e.event === 'assistant.text_delta' && typeof data.text === 'string') return data.text
  if (e.event === 'assistant.thinking_delta' && typeof data.thinking === 'string') return data.thinking
  return ''
}

/** Cumulative usage carried by Core's transient usage.tick frame. */
export function usageFromLiveEvent(e: Pick<StreamEvent, 'event' | 'data'>): TokenUsage | null {
  if (e.event !== 'usage.tick') return null
  const data = (e.data || {}) as Record<string, unknown>
  const partial = data.partial
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return null
  const raw = partial as Record<string, unknown>
  const usage: TokenUsage = {}
  if (typeof raw.model === 'string' && raw.model) usage.model = raw.model
  if (typeof raw.tokens_in === 'number' && Number.isFinite(raw.tokens_in)) usage.tokens_in = raw.tokens_in
  if (typeof raw.tokens_out === 'number' && Number.isFinite(raw.tokens_out)) usage.tokens_out = raw.tokens_out
  if (typeof raw.cost_usd === 'number' && Number.isFinite(raw.cost_usd)) usage.cost_usd = raw.cost_usd
  return Object.keys(usage).length ? usage : null
}

/** Open live overlays for `ids`: one `chat_session.render` subscription per
 * session, re-opened on core reconnect. Reports accumulated tails for text
 * frames and cumulative token usage for usage.tick frames. */
export function openLiveTails(
  ids: readonly string[],
  onUpdate: (id: string, update: LiveSessionUpdate) => void,
): () => void {
  const tails: Record<string, string> = {}
  let cancelled = false
  let unsubs: Array<() => void> = []

  const open = () => {
    unsubs.forEach((u) => u())
    unsubs = ids.map((id) =>
      subscribe('chat_session.render', { chat_session_id: id }, (e: StreamEvent) => {
        if (cancelled) return
        const at = Date.now()
        if (e.event === 'chat_session.render_changed') {
          onUpdate(id, { refresh: true, at })
          return
        }
        if (e.event === 'chat_session.render_snapshot') {
          const view = e.data && typeof e.data === 'object'
            ? (e.data as Record<string, unknown>).view
            : null
          const status = view && typeof view === 'object'
            ? (view as Record<string, unknown>).status
            : null
          onUpdate(id, { refresh: true, terminal: status === 'idle' || status === 'error', at })
          return
        }
        const usage = usageFromLiveEvent(e)
        if (usage) {
          onUpdate(id, { usage, at })
          return
        }
        const chunk = textChunkFromLiveEvent(e)
        if (!chunk) return
        tails[id] = appendTail(tails[id] || '', chunk)
        onUpdate(id, { tail: tails[id], chunk, at })
      }),
    )
  }

  open()
  // Only running sessions are observed. The Trunk's durable event can arrive
  // before Root's read projection catches up, and its process-local dirty
  // signal never reaches this window. Reconcile even when the stream is quiet
  // or failed, without requiring the user to focus Willo.
  const reconcileTimer = setInterval(() => {
    if (!cancelled) ids.forEach((id) => onUpdate(id, { refresh: true, at: Date.now() }))
  }, 1_000)
  const offReconnect = onCoreReconnect(() => { if (!cancelled) open() })
  return () => {
    cancelled = true
    clearInterval(reconcileTimer)
    offReconnect()
    unsubs.forEach((u) => u())
    unsubs = []
  }
}
