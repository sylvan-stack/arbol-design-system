/* Framework-agnostic helpers for the tool-approval cards (split out of the React
 * ToolApprovalCard so both the dock and the cards can import them; rule 13). */
import type { PendingApproval } from './usePendingApprovals'

/* Cool identity used by native-origin approvals so they stay visually separate
 * from warm arbol requests. */
export const NATIVE_ACCENT = 'oklch(0.62 0.16 276)'
export const NATIVE_ACCENT_SOFT = 'color-mix(in srgb, oklch(0.62 0.16 276) 12%, var(--arbol-color-surface))'

/* A short glyph per tool kind — mirrors ResponseView's collapsed-row glyphs. */
export function kindGlyph(kind: string): string {
  if (kind === 'bash') return '⌘'
  if (kind === 'read') return '◧'
  if (kind === 'list') return '☰'
  if (kind === 'write') return '✎'
  if (kind === 'http') return '⇄'
  if (kind.startsWith('slack.')) return '#'
  if (kind.startsWith('imap.')) return '✉'
  if (kind === 'native_ask_user_question') return '?'
  return '⚡'
}

/* The single most relevant param to show per kind — the thing being approved.
 * `native_confirm` is an UNRECOGNIZED native CLI tool (master plan decision 8):
 * never summarized, always the raw input JSON so the choice is informed.
 * `native_ask_user_question` has its own first-class UI. */
export function approvalIncidentReport(approval: PendingApproval): string {
  const action = paramsSummary(approval.kind, approval.params)
  const params = JSON.stringify(approval.params, null, 2)
  return [
    'Arbol permission incident',
    `ID: ${approval.request_id}`,
    `Tool: ${approval.kind || 'unknown'}`,
    `Origin: ${approval.origin || 'arbol'}`,
    approval.canonical_kind ? `Canonical kind: ${approval.canonical_kind}` : '',
    approval.approval_policy ? `Approval policy: ${approval.approval_policy}` : '',
    approval.reason ? `Reason: ${approval.reason}` : '',
    action ? `Requested action:
${action}` : '',
    `Parameters:
${params}`,
  ].filter(Boolean).join('\n')
}

export function paramsSummary(kind: string, params: Record<string, unknown>): string {
  const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v))
  if (kind === 'bash') return s(params.command)
  if (kind === 'read' || kind === 'write' || kind === 'list') return s(params.path)
  if (kind === 'http') return `${s(params.method) || 'GET'} ${s(params.url)}`.trim()
  if (kind.startsWith('slack.')) return [s(params.channel), s(params.text)].filter(Boolean).join(' — ')
  if (kind === 'native_confirm') return JSON.stringify(params.input ?? {}, null, 2)
  if (kind === 'native_ask_user_question') return ''
  const j = JSON.stringify(params)
  return j === '{}' ? '' : j
}

/* Native-origin ask: the durable origin field when the hook captured it, the
 * deterministic `nt-<tool_use_id>` request-id prefix otherwise. */
export function isNativeApproval(approval: PendingApproval): boolean {
  return approval.origin === 'native' || approval.request_id.startsWith('nt-')
}

export function isProtectedLifecycleApproval(approval: PendingApproval): boolean {
  return approval.canonical_kind === 'bash:protected-lifecycle' || approval.approval_policy === 'every_time'
}

function tryJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return v
  try {
    return JSON.parse(t) as unknown
  } catch {
    return v
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  const parsed = tryJson(v)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

function asArray(v: unknown): unknown[] {
  const parsed = tryJson(v)
  return Array.isArray(parsed) ? parsed : []
}

function asText(v: unknown): string {
  const parsed = tryJson(v)
  return typeof parsed === 'string' ? parsed : parsed == null ? '' : String(parsed)
}

function firstPresent(record: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (record[k] !== undefined && record[k] !== null) return record[k]
  }
  return undefined
}

export type AskOption = { label: string; description?: string }
export type AskQuestion = { header?: string; question: string; options: AskOption[]; multiSelect: boolean }

function parseOptions(raw: unknown): AskOption[] {
  return asArray(raw)
    .map((o): AskOption => {
      if (typeof o === 'string') return { label: o }
      const r = asRecord(o)
      return {
        label: asText(firstPresent(r, ['label', 'Label', 'title', 'Title', 'value', 'Value', 'id', 'ID'])).trim(),
        description: asText(firstPresent(r, ['description', 'Description', 'detail', 'Detail', 'subtitle', 'Subtitle'])).trim() || undefined,
      }
    })
    .filter((o) => o.label)
}

function unwrapAskInput(params: Record<string, unknown>): Record<string, unknown> {
  // The native bridge has had a few shapes during development:
  //   {input:{questions:[...]}}
  //   {input:'{"questions":[...]}' }
  //   {input:{input:{questions:[...]}}}
  //   {arguments:{questions:[...]}} / {tool_input:{...}}
  // Normalize all of those before parsing so the card does not fall back to the
  // generic “Claude is asking…” copy when the real question is present.
  const candidates = [
    params.input,
    params.arguments,
    params.args,
    params.tool_input,
    params.toolInput,
    params.payload,
    params.params,
    params,
  ]
  for (const candidate of candidates) {
    let r = asRecord(candidate)
    for (let depth = 0; depth < 4; depth += 1) {
      if (!Object.keys(r).length) break
      if (
        firstPresent(r, ['questions', 'Questions', 'question', 'Question', 'prompt', 'Prompt', 'message', 'Message', 'text', 'Text', 'options', 'Options']) !== undefined
      ) {
        return r
      }
      const nested = firstPresent(r, ['input', 'Input', 'arguments', 'Arguments', 'args', 'Args', 'tool_input', 'toolInput', 'payload', 'Payload'])
      const nr = asRecord(nested)
      if (!Object.keys(nr).length || nr === r) break
      r = nr
    }
  }
  return {}
}

/* Claude's AskUserQuestion normally nests its content under `input.questions[]`,
 * each with {header, question, options:[{label, description}], multiSelect}.
 * Runtime bridges may stringify or wrap that payload; unwrapAskInput handles
 * those variants. We also tolerate flat {question, options} as a fallback. */
export function askUserQuestionPayload(params: Record<string, unknown>): { questions: AskQuestion[] } {
  const input = unwrapAskInput(params)
  const rawQuestions = asArray(firstPresent(input, ['questions', 'Questions']))
  const questions = rawQuestions
    .map((q): AskQuestion => {
      const r = asRecord(q)
      return {
        header: asText(firstPresent(r, ['header', 'Header', 'title', 'Title'])).trim() || undefined,
        question: asText(firstPresent(r, ['question', 'Question', 'prompt', 'Prompt', 'message', 'Message', 'text', 'Text'])).trim(),
        options: parseOptions(firstPresent(r, ['options', 'Options', 'choices', 'Choices'])),
        multiSelect: firstPresent(r, ['multiSelect', 'multiselect', 'multi_select', 'MultiSelect']) === true,
      }
    })
    .filter((q) => q.question || q.options.length)
  if (questions.length) return { questions }

  // Fallback: flat single-question shape.
  const flatQuestion = asText(firstPresent(input, ['question', 'Question', 'prompt', 'Prompt', 'message', 'Message', 'text', 'Text'])).trim()
  return {
    questions: [
      {
        question: flatQuestion || 'Claude is asking how to continue.',
        options: parseOptions(firstPresent(input, ['options', 'Options', 'choices', 'Choices'])),
        multiSelect: firstPresent(input, ['multiSelect', 'multiselect', 'multi_select', 'MultiSelect']) === true,
      },
    ],
  }
}
