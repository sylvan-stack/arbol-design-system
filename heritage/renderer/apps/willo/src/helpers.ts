import { isHiddenProvider, providerDisplayName } from '../../../packages/design-system/src/providers'
/* Willo pure helpers (first-cut subset, extracted from App.tsx — framework-
 * agnostic). The full station-card model/provider resolution is the next
 * increment; these cover the card summary + monitor row. */
import type { StationSession } from './stations'

export function fmtRelativeTime(ts?: number): string {
  if (!ts) return ''
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** Compact duration since the last durable agent progress signal. Unlike
 * `updated_at`, this is not reset by user actions such as a rename or pin. */
export function fmtAgentInactivity(ts?: number | null, now = Date.now()): string {
  if (!ts) return ''
  const seconds = Math.max(0, Math.round((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export const AGENT_STALE_AFTER_MS = 5 * 60_000

export function agentActivityIsStale(ts?: number | null, now = Date.now(), thresholdMs = AGENT_STALE_AFTER_MS): boolean {
  return !!ts && now - ts >= thresholdMs
}

/** Duration for which the inactivity threshold has been exceeded. */
export function fmtAgentStaleDuration(ts?: number | null, now = Date.now(), thresholdMs = AGENT_STALE_AFTER_MS): string {
  if (!ts || now - ts < thresholdMs) return ''
  return fmtAgentInactivity(ts + thresholdMs, now)
}

export function fmtClockTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return '' }
}

export function formatTokenCount(n: number | null | undefined): string {
  if (n == null) return '—'
  const count = Math.trunc(n)
  const absolute = Math.abs(count)
  const compact = (value: number, suffix: string): string => `${Number(value.toFixed(2))}${suffix}`
  if (absolute >= 1_000_000) return compact(count / 1_000_000, 'm')
  if (absolute >= 1_000) {
    const thousands = count / 1_000
    // Avoid displaying a rounded-up value at the `1000k` boundary.
    if (Math.abs(Number(thousands.toFixed(2))) >= 1_000) return compact(count / 1_000_000, 'm')
    return compact(thousands, 'k')
  }
  return String(count)
}

/** Add the current turn's cumulative live usage to the durable total from
 * completed turns. Replacing the durable value here would make a running,
 * multi-turn session temporarily look like it only contained its latest turn. */
export function withLiveUsage(s: StationSession, live?: StationSession['last_usage']): StationSession {
  if (!live) return s
  const recorded = s.last_usage
  return {
    ...s,
    last_usage: {
      ...recorded,
      ...live,
      tokens_in: (recorded?.tokens_in || 0) + (live.tokens_in || 0),
      tokens_out: (recorded?.tokens_out || 0) + (live.tokens_out || 0),
      cost_usd: recorded?.cost_usd == null && live.cost_usd == null
        ? null
        : (recorded?.cost_usd || 0) + (live.cost_usd || 0),
    },
  }
}

export function usageSummary(s: StationSession): string | null {
  const u = s.last_usage
  if (!u) return null

  // Token counts are the important part of this row. Put them first so a long
  // model name can never push them past a card's clipped right edge, and only
  // render actual usage (a missing/zero side should not produce a misleading
  // dash or `0`). The row may wrap in the card as a second line when needed.
  const input = Number.isFinite(u.tokens_in) && (u.tokens_in ?? 0) > 0 ? Math.trunc(u.tokens_in!) : 0
  const output = Number.isFinite(u.tokens_out) && (u.tokens_out ?? 0) > 0 ? Math.trunc(u.tokens_out!) : 0
  if (!input && !output) return null
  const parts: string[] = []
  if (input) parts.push(`${formatTokenCount(input)} input`)
  if (output) parts.push(`${formatTokenCount(output)} output`)
  parts.push(`${formatTokenCount(input + output)} total`)
  return parts.join(' · ')
}

export function primaryRepo(s: StationSession): string | null {
  const raw = s.repo || s.repo_name || s.repository || s.repo_path || s.workspace_path || s.cwd
    || (s.workspace_dirs && s.workspace_dirs[0]) || null
  if (!raw) return null
  const parts = String(raw).replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || raw
}

export type SessionFailureKind = 'overload' | 'authentication' | 'rate_limit' | 'unknown'

export type SessionFailureCue = {
  kind: SessionFailureKind
  label: string
  description: string
  icon: 'server' | 'user' | 'arrow-down' | 'question'
}

/** Ordered, deliberately small failure taxonomy for card cues. Add new entries
 * here as provider failure contracts expand; card components stay generic. */
const SESSION_FAILURE_CUES: Array<{
  kind: Exclude<SessionFailureKind, 'unknown'>
  markers: RegExp
  cue: Omit<SessionFailureCue, 'kind'>
}> = [
  {
    kind: 'authentication',
    markers: /(?:unauthori[sz]ed|authentication(?:_error| failed| failure)?|failed to authenticate|invalid[_ ]api[_ ]key|token[_ ]expired|http 401|\b401\b|forbidden|http 403|\b403\b)/i,
    cue: { label: 'Authentication failure', description: 'The provider rejected or could not verify the account credentials.', icon: 'user' },
  },
  {
    kind: 'overload',
    markers: /(?:overload(?:ed)?|server(?:s)? (?:is |are )?(?:busy|at capacity)|service unavailable|temporarily unavailable|capacity|http 503|\b503\b)/i,
    cue: { label: 'Server overload', description: 'The provider is temporarily overloaded or unavailable.', icon: 'server' },
  },
  {
    kind: 'rate_limit',
    markers: /(?:rate[_ -]?limit(?:ed)?|too many requests|usage limit|quota exceeded|cooldown|http 429|\b429\b)/i,
    cue: { label: 'Rate limit', description: 'The provider rate limit or usage quota was reached.', icon: 'arrow-down' },
  },
]

export function sessionFailureCue(s: Pick<StationSession, 'status' | 'last_error'>): SessionFailureCue | null {
  if (String(s.status || '').toLowerCase() !== 'error') return null
  const error = String(s.last_error || '').trim()
  const match = SESSION_FAILURE_CUES.find((entry) => entry.markers.test(error))
  if (match) return { kind: match.kind, ...match.cue }
  return { kind: 'unknown', label: 'Unknown failure', description: error || 'No detailed failure cause was recorded.', icon: 'question' }
}

export function sessionFailureTitle(s: Pick<StationSession, 'status' | 'last_error'>): string {
  const cue = sessionFailureCue(s)
  if (!cue) return ''
  const detail = String(s.last_error || '').trim()
  return detail ? `${cue.label}: ${detail}` : `${cue.label}: ${cue.description}`
}

export const stationIsRunning = (s: StationSession): boolean => s.status === 'running'
export const stationOnGoing = (s: StationSession): boolean => !!s.onGoing
export const stationIsUnread = (s: StationSession): boolean => !!s.isUnread
export const stationHasDraft = (s: StationSession): boolean => !!s.hasDraft
export const stationIsDraftOnly = (s: StationSession): boolean => s.entityKind === 'draft'
/** A running Chat Session can briefly retain its just-sent Draft decoration
 * until the discard signal arrives. Keep it in Running rather than presenting
 * the accepted message as a recoverable Draft; standalone Draft cards remain
 * in Drafted. */
export const stationAppearsDrafted = (s: StationSession): boolean =>
  stationIsDraftOnly(s) || (stationHasDraft(s) && !stationIsRunning(s))

// ── Compact-mode activity grouping ──────────────────────────────────────────
//
// The Keep-on-Top list groups cards visually by time-since-activity: a growing
// gap opens before the first card of each older bucket (<20m / <1h / <4h /
// <8h / older), so recency reads at a glance without section labels.

export const COMPACT_ACTIVITY_GROUP_GAP_PX = [0, 24, 36, 48, 56] as const

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

export function compactActivityGroup(activityAt?: number, now = Date.now()): number {
  if (!activityAt) return 4
  const age = Math.max(0, now - activityAt)
  if (age < 20 * MINUTE_MS) return 0
  if (age < HOUR_MS) return 1
  if (age < 4 * HOUR_MS) return 2
  if (age < 8 * HOUR_MS) return 3
  return 4
}

/** Extra pixels before a card whose activity bucket is older than its
 *  predecessor's — 0 when both sit in the same bucket. */
export function compactActivityGroupSpacingPx(previousActivityAt?: number, activityAt?: number, now = Date.now()): number {
  const previousGroup = compactActivityGroup(previousActivityAt, now)
  const group = compactActivityGroup(activityAt, now)
  return group > previousGroup ? COMPACT_ACTIVITY_GROUP_GAP_PX[group] ?? 0 : 0
}

// ── Provider / model resolution for the card meta line ─────────────────────
//
// `chat_session.list` rows often carry an empty `model` (the chat uses its
// IP's default), so the meta line resolves through `ip.list` the way the
// pre-Svelte-port card did: session value → IP default_model → first enabled
// model. Structural IP shape so these helpers stay dependency-free.

export type IpInfo = {
  name: string
  label?: string
  provider?: string
  default_model?: string | null
  enabled_models?: string[] | null
}
export type IpByName = Record<string, IpInfo>

/** True for the "use the IP default" placeholder spellings, and for blank. */
export function isDefaultModelValue(value: string | null | undefined): boolean {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/^\((.*)\)$/, '$1')
  return !normalized
    || normalized === 'default'
    || normalized === 'ip default'
    || normalized === 'default model'
    || normalized === 'model default'
    || normalized === 'provider default'
    || normalized === 'system default'
    || normalized === 'use default'
    || normalized === 'use ip default'
}

type ModelOption = { value: string; label: string }

const CLAUDE_MODELS: ModelOption[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

const CODEX_MODELS: ModelOption[] = [
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
  { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
]

function modelOptions(provider: string | null | undefined): ModelOption[] {
  switch ((provider || '').toLowerCase()) {
    case 'codex': return CODEX_MODELS
    case 'claude': return CLAUDE_MODELS
    default: return []
  }
}

function modelLabel(value: string | null | undefined, provider?: string | null): string {
  if (!value) return ''
  return modelOptions(provider).find((m) => m.value === value)?.label || value
}

function ipForSession(s: StationSession, ipByName: IpByName): IpInfo | undefined {
  const ipName = (s.ip_name || '').trim()
  if (ipByName[ipName]) return ipByName[ipName]
  const normalized = ipName.toLowerCase()
  if (!normalized) return undefined
  return Object.values(ipByName).find((ip) =>
    ip.name.toLowerCase() === normalized || (ip.label || '').toLowerCase() === normalized)
}

/** Display name of the chat's Intelligence Provider (label > provider > raw name). */
export function sessionProviderLabel(s: StationSession, ipByName: IpByName): string {
  if (isHiddenProvider(s.ip_name)) return providerDisplayName(s.ip_name || '');
  const ip = ipForSession(s, ipByName)
  return ip?.label || ip?.provider || (s.ip_name || '').trim()
}

/** Friendly model for the card: the session's own model, else the IP's
 *  default, else the IP's first concretely-named enabled model. */
export function sessionModelLabel(s: StationSession, ipByName: IpByName): string {
  const ip = ipForSession(s, ipByName)
  const provider = ip?.provider || ''
  if (!isDefaultModelValue(s.model)) return modelLabel((s.model || '').trim(), provider)
  if (!isDefaultModelValue(ip?.default_model)) return modelLabel((ip?.default_model || '').trim(), provider)
  const enabled = (ip?.enabled_models || []).find((m) => !isDefaultModelValue(m)) || ''
  return modelLabel(enabled, provider)
}
