/* Framework-agnostic helpers extracted from ResponseView.tsx — pure functions
 * for tool lifecycle cues, native-tool formatting, the native
 * fallback merge, and lifecycle-event grouping. Kept identical to the React
 * originals. */
import type { NativeToolCallView } from '@arbol/events'
import type { AnswerBlock } from '../constants'
import type { ToolOutputPreview, ToolOutputPreviewMap } from './ResponseView.types'

/** Normalize a completed response around its semantic activity → answer boundary.
 *
 * A completed response has a stronger display invariant than either timestamp or
 * persistence order can provide: every thinking/tool activity row belongs above
 * the Answer Threshold, and every authored answer block belongs below it. Native
 * invocation events and provider cycles are persisted independently, so either
 * track can arrive or hydrate out of order. Stable partitioning makes that race
 * irrelevant while preserving order within the activity and answer tracks. */
export function normalizeSettledAnswerOrder(blocks: AnswerBlock[]): AnswerBlock[] {
  const isActivity = (block: AnswerBlock) => block.t === 'thinking' || block.t === 'native'
  return [
    ...blocks.filter(isActivity),
    ...blocks.filter((block) => !isActivity(block)),
  ]
}

/** Locate the deterministic activity → answer transition. The first ordinary
 * response block after the final tool/thinking item begins the user-facing answer.
 * A direct response is entirely final answer, so its boundary is index zero. */
export function finalAnswerStartIndex(blocks: AnswerBlock[]): number {
  const lastActivity = blocks.reduce(
    (last, block, index) => block.t === 'thinking' || block.t === 'native' ? index : last,
    -1,
  )
  // A completed direct response is entirely final answer. It still needs the
  // Answer Threshold: opening a historical chat must have the same deterministic
  // destination whether or not the agent exposed thinking/tool activity.
  if (lastActivity < 0) return blocks.length > 0 ? 0 : -1
  const answer = blocks.findIndex((block, index) => index > lastActivity && block.t !== 'thinking' && block.t !== 'native')
  return answer >= 0 ? answer : blocks.length
}

/** Reconstruct the authored markdown represented by render blocks. This is used
 * only for the whole-response Copy action: reasoning and native tool activity
 * are intentionally omitted, leaving the agent's final answer alone. */
export function finalAnswerText(blocks: AnswerBlock[]): string {
  return blocks
    .filter((block) => block.t !== 'thinking' && block.t !== 'native' && block.t !== 'sources')
    .map((block) => {
      switch (block.t) {
        case 'p': return block.v
        case 'h': return `# ${block.v}`
        case 'quote': return block.v.split('\n').map((line) => `> ${line}`).join('\n')
        case 'separator': return '---'
        case 'code': return `\`\`\`\n${block.v}\n\`\`\``
        case 'ul': return block.v.map((item) => `- ${item}`).join('\n')
        case 'ol': return block.v.map((item, index) => `${(block.start ?? 1) + index}. ${item}`).join('\n')
        case 'table': return [
          `| ${block.header.join(' | ')} |`,
          `| ${block.header.map(() => '---').join(' | ')} |`,
          ...block.rows.map((row) => `| ${row.join(' | ')} |`),
        ].join('\n')
      }
    })
    .join('\n\n')
    .trim()
}

export function normalizeThinking(thinking?: string | string[]): string[] {
  if (Array.isArray(thinking)) return thinking.filter((t) => t.trim().length > 0)
  return thinking && thinking.trim() ? [thinking] : []
}

/** Prepare reasoning for markdown display without changing its stored text.
 * Some providers stream consecutive bold status lines as `**one****two**`; the
 * shared markdown parser correctly sees the marks, but without a separator they
 * render as one dense run. Add a paragraph boundary only between those adjacent
 * closing/opening marks so each generated status remains readable. */
export function formatThinkingMarkdown(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\*\*([ \t]*)\*\*/g, '**\n\n**')
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/** Human-friendly precision for the expanded execution timeline. The compact
 * row keeps its intentionally quiet minute-based timer, while details make even
 * sub-minute calls inspectable. */
export function formatToolCallDuration(ms: number): string {
  const elapsed = Math.max(0, ms)
  if (elapsed < 1_000) return `${Math.round(elapsed)}ms`
  if (elapsed < 60_000) return `${(elapsed / 1_000).toFixed(1).replace(/\.0$/, '')}s`
  return formatElapsed(elapsed)
}

/* The one-line summary per native tool — the thing the CLI is running. */
/** Match a native execution card to the decision-track preview that carries
 * live Bash stdout/stderr. Universe calls expose the request id in `input.id`;
 * Claude permission-bridged calls carry `request_id` directly. The summary
 * alias is a rolling-upgrade/backfill fallback used by buildToolOutputPreviews. */
export function nativeToolOutputPreview(
  call: NativeToolCallView,
  previews: ToolOutputPreviewMap,
): ToolOutputPreview | undefined {
  const inputId = typeof call.input?.id === 'string' ? call.input.id.trim() : ''
  const command = typeof call.input?.command === 'string' ? call.input.command.trim() : ''
  const candidates = [
    call.request_id,
    inputId,
    call.tool_name === 'Bash' && command ? `bash:${command}` : undefined,
  ]
  for (const key of candidates) {
    if (key && previews[key]) return previews[key]
  }
  return undefined
}

export function nativeToolSummary(call: NativeToolCallView): string {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const input = call.input || {}
  if (call.tool_name === 'Bash') return s(input.command)
  if (call.tool_name === 'Read' || call.tool_name === 'Write' || call.tool_name === 'Edit') return s(input.file_path)
  if (call.tool_name === 'List') return s(input.path)
  if (call.tool_name === 'Glob' || call.tool_name === 'Grep') return [s(input.pattern), s(input.path)].filter(Boolean).join('  ')
  return call.tool_name
}

/** Pretty-print JSON objects/arrays while leaving ordinary terminal text alone. */
export function prettyJsonText(value: unknown): string {
  if (typeof value !== 'string') {
    if (value !== null && typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return value == null ? '' : String(value)
  }

  const trimmed = value.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return value.replace(/\s+$/g, '')
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2)
    }
  } catch {
    // Tool output often begins with braces without being valid JSON. Preserve it.
  }
  return value.replace(/\s+$/g, '')
}

/* IP_SETTLED_NATIVE_TOOL.result mirrors the CLI tool_result: usually
 * {content: string | block[]} (+ truncated:true when the 200 KB durable cap
 * cut it). Flatten to displayable text. */
export function nativeResultText(result: Record<string, unknown> | undefined): string {
  if (!result) return ''
  const content = result.content
  if (typeof content === 'string') return prettyJsonText(content)
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : typeof (b as { text?: unknown })?.text === 'string' ? (b as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n')
      .replace(/\s+$/g, '')
  }
  const j = JSON.stringify(result, null, 2)
  return j === '{}' ? '' : j
}

export const NATIVE_RESULT_CAP = 200 * 1024

export function nativeResultTruncated(call: NativeToolCallView): boolean {
  if (call.result && (call.result as { truncated?: unknown }).truncated === true) return true
  return nativeResultText(call.result).length >= NATIVE_RESULT_CAP
}

export type NativeCallState = 'running' | 'completed' | 'checkpoint' | 'failed'

/** A Bash feedback checkpoint returns through the CLI's error channel so the
 * agent can decide whether to wait or stop, but the underlying process is still
 * running. Keep that control-flow signal visually distinct from a real failure. */
export function isBashFeedbackCheckpoint(call: NativeToolCallView): boolean {
  return call.tool_name === 'Bash'
    && call.ok === false
    && /feedback checkpoint[\s\S]*command is still running/i.test(call.error || nativeResultText(call.result))
}

export function nativeCallState(call: NativeToolCallView): NativeCallState {
  if (call.ok === null) return 'running'
  if (isBashFeedbackCheckpoint(call)) return 'checkpoint'
  return call.ok ? 'completed' : 'failed'
}

export const NATIVE_TOOL_TIMER_THRESHOLD_MS = 60_000

/** Elapsed native-tool runtime. Running calls use `now`; settled calls freeze at
 * their settlement event timestamp. */
export function nativeCallElapsedMs(call: NativeToolCallView, now: number): number {
  // Be defensive during rolling upgrades and against malformed historical rows:
  // an absent start must hide the timer, never turn into NaN or a huge duration.
  const invokedAt = Number.isFinite(call.invoked_ts) ? call.invoked_ts : now
  const endedAt = Number.isFinite(call.settled_ts) ? (call.settled_ts as number) : now
  return Math.max(0, endedAt - invokedAt)
}

/** Keep all native-tool runtimes visually quiet through one minute. Longer calls
 * use `now` while running and freeze at their settlement timestamp afterward. */
export function nativeCallTimerLabel(call: NativeToolCallView, now: number): string | null {
  const elapsed = nativeCallElapsedMs(call, now)
  if (elapsed <= NATIVE_TOOL_TIMER_THRESHOLD_MS) return null
  return formatElapsed(elapsed)
}

/* Compatibility path for callers that still pass native tool calls separately:
 * merge them into the visible stream by invocation timestamp instead of rendering
 * one native-tools group at the end. Durable fold paths prefer true per-cycle
 * timestamps via inline `native` blocks produced by assistantBlocks(). */
export function mergeNativeFallback(
  blocks: AnswerBlock[],
  nativeToolCalls: NativeToolCallView[],
  sentAt?: number,
  startedAt?: number,
  respondedAt?: number | null,
): AnswerBlock[] {
  if (!nativeToolCalls.length || blocks.some((b) => b.t === 'native')) return blocks
  // A settled turn's prose is the final answer. When inline native blocks are
  // absent (notably during projection/live-fold handoff), timestamp synthesis
  // is not authoritative: invocation clocks can be later than respondedAt and
  // would place tools below the answer. Preserve the semantic activity → answer
  // boundary instead. In-flight turns still need timestamp interleaving.
  if (respondedAt != null) {
    return [
      ...nativeToolCalls.map((call) => ({ t: 'native' as const, call })),
      ...blocks,
    ]
  }
  const start = startedAt || sentAt || nativeToolCalls[0]?.invoked_ts || 0
  const nativeMax = nativeToolCalls.reduce((m, c) => Math.max(m, c.invoked_ts || 0), start)
  const end = respondedAt ?? Math.max(nativeMax, start + Math.max(1, blocks.length) * 1000)
  const span = Math.max(1, end - start)
  const withBlocks = blocks.map((block, i) => ({
    kind: 'block' as const,
    order: i * 2,
    ts: start + (span * (i + 1)) / (blocks.length + 1),
    block,
  }))
  const withNative = nativeToolCalls.map((call, i) => ({
    kind: 'native' as const,
    order: i * 2 + 1,
    ts: call.invoked_ts || start,
    block: { t: 'native' as const, call },
  }))
  return [...withBlocks, ...withNative]
    .sort((a, b) => (a.ts - b.ts) || (a.order - b.order))
    .map((x) => x.block)
}

/* Lifecycle events within ±3s of each other collapse into one line. */
export function groupEvents(events: { label: string; t: number }[]) {
  const groups: { labels: string[]; t: number }[] = []
  for (const e of events) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(e.t - last.t) <= 3000) last.labels.push(e.label)
    else groups.push({ labels: [e.label], t: e.t })
  }
  return groups
}

/** Format a failure timestamp with both date and second-level local time. */
export function formatFailureTime(timestamp: number, locale?: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}


export type DeferredContentPage = {
  data: string
  offset: number
  next_offset: number
  complete: boolean
  total_bytes: number
  sha256: string
  content_format: string
  continuation?: string | null
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type DeferredValidationStage =
  | 'range_validated' | 'encoded_length_validated' | 'digest_validated'
  | 'fatal_utf8_validated' | 'json_validated' | 'settlement_format_validated'
  | 'all_validations_completed'

export type DeferredValidationEvidence = {
  stage: DeferredValidationStage
  reference_sha256: string
  reference_encoded_bytes: number
  requested_offset?: number
  returned_offset?: number
  returned_bytes?: number
  range_within_256_kib?: boolean
  continuation_offset?: number | null
}

export function deferredRenderEvidence(
  validationCompleted: boolean, referenceSha256: string, referenceEncodedBytes: number,
): { stage: 'rendered'; reference_sha256: string; reference_encoded_bytes: number } {
  if (!validationCompleted) throw new Error('Externalized content validation did not complete')
  return {
    stage: 'rendered', reference_sha256: referenceSha256,
    reference_encoded_bytes: referenceEncodedBytes,
  }
}

export async function verifyDeferredToolContent(
  pages: DeferredContentPage[], expectedSha256: string, expectedBytes: number,
  observe: (evidence: DeferredValidationEvidence) => void = () => {},
): Promise<Record<string, unknown>> {
  if (!pages.length) throw new Error('No externalized content received')
  let offset = 0
  const chunks: Uint8Array[] = []
  for (const page of pages) {
    const chunk = decodeBase64(page.data)
    if (page.offset !== offset || page.next_offset !== offset + chunk.length
        || page.total_bytes !== expectedBytes || page.sha256 !== expectedSha256
        || chunk.length === 0 || chunk.length > 256 * 1024) {
      throw new Error('Externalized content range verification failed')
    }
    observe({
      stage: 'range_validated', reference_sha256: expectedSha256,
      reference_encoded_bytes: expectedBytes, requested_offset: offset,
      returned_offset: page.offset, returned_bytes: chunk.length,
      range_within_256_kib: chunk.length <= 256 * 1024,
      continuation_offset: page.complete ? null : page.next_offset,
    })
    chunks.push(chunk)
    offset += chunk.length
  }
  if (!pages[pages.length - 1].complete || offset !== expectedBytes)
    throw new Error('Externalized content is incomplete')
  observe({ stage: 'encoded_length_validated', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  const data = new Uint8Array(expectedBytes)
  let cursor = 0
  for (const chunk of chunks) { data.set(chunk, cursor); cursor += chunk.length }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
    .map((value) => value.toString(16).padStart(2, '0')).join('')
  if (digest !== expectedSha256) throw new Error('Externalized content digest mismatch')
  observe({ stage: 'digest_validated', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  observe({ stage: 'fatal_utf8_validated', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  const value = JSON.parse(text)
  observe({ stage: 'json_validated', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  if (!value || typeof value !== 'object' || value.format !== 'arbol-tool-settlement-json-v1')
    throw new Error('Externalized content format mismatch')
  observe({ stage: 'settlement_format_validated', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  observe({ stage: 'all_validations_completed', reference_sha256: expectedSha256, reference_encoded_bytes: expectedBytes })
  return value as Record<string, unknown>
}
