/* Tool-output preview builder extracted from App.svelte. Folds the durable
 * tool requests/results + the live streaming overlay into the per-request
 * preview map ResponseView renders. Pure over its inputs (plus a module-level
 * started-at memo so a request's start time survives request_id↔summary alias
 * churn across renders). */
import type { ChatSessionView, StreamingOverlay } from '@arbol/events'
import type { ToolOutputPreviewMap } from '../chat/ResponseView.types'

function toolParamString(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}
function toolContentSize(value: unknown): string {
  if (typeof value !== 'string') return ''
  const bytes = new TextEncoder().encode(value).length
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round((bytes / 1024) * 10) / 10} KB`
}
export function summarizeToolRequest(kind: string, params: Record<string, unknown>): string {
  switch (kind) {
    case 'bash':
    case 'curl':
      return toolParamString(params, 'command') || toolParamString(params, 'cmd')
    case 'read':
    case 'list':
      return toolParamString(params, 'path')
    case 'write': {
      const path = toolParamString(params, 'path')
      const size = toolContentSize(params.content)
      return [path, size].filter(Boolean).join('  ')
    }
    case 'http':
      return `${toolParamString(params, 'method') || 'GET'} ${toolParamString(params, 'url')}`.trim()
    default:
      if (kind.startsWith('slack.') || kind.startsWith('imap.')) {
        const target = toolParamString(params, 'channel') || toolParamString(params, 'folder') || toolParamString(params, 'query')
        return [toolParamString(params, 'account'), target].filter(Boolean).join(' · ')
      }
      return toolParamString(params, 'path') || toolParamString(params, 'command') || toolParamString(params, 'query')
  }
}
function toolResultPayload(result: Record<string, unknown> | undefined): Record<string, unknown> {
  if (result && typeof result.result === 'object' && result.result) return result.result as Record<string, unknown>
  return result || {}
}
function toolResultOutput(result: Record<string, unknown> | undefined, error: string | undefined): ToolOutputPreviewMap[string] | undefined {
  const payload = toolResultPayload(result)
  const stdout = typeof payload.stdout === 'string' ? payload.stdout : ''
  const stderr = typeof payload.stderr === 'string' ? payload.stderr : (error || '')
  return stdout || stderr ? { stdout, stderr } : undefined
}

const toolRuntimeStartedAt: Record<string, number> = {}

export function buildToolOutputPreviews(v: ChatSessionView, s: StreamingOverlay | null): ToolOutputPreviewMap {
  const out: ToolOutputPreviewMap = {}
  const aliasesFor = (requestId: string, kind?: string, summary?: string): string[] => {
    const aliases = [requestId]
    if (kind && summary) aliases.push(`${kind}:${summary}`)
    return aliases.filter(Boolean)
  }
  const rememberStartedAt = (aliases: string[], startedAt?: number): number | undefined => {
    const existing = aliases.map((key) => toolRuntimeStartedAt[key]).find((value) => typeof value === 'number')
    const resolved = startedAt || existing
    if (resolved) for (const alias of aliases) toolRuntimeStartedAt[alias] = resolved
    return resolved
  }
  const assign = (requestId: string, kind: string | undefined, summary: string | undefined, preview: ToolOutputPreviewMap[string]) => {
    const aliases = aliasesFor(requestId, kind, summary)
    for (const alias of aliases) out[alias] = preview
  }
  for (const r of Object.values(v?.toolRequests || {})) {
    const params = v?.toolRequestParams?.[r.request_id] || {}
    const summary = summarizeToolRequest(r.kind, params)
    const live = s?.toolOutputs?.[r.request_id]
    const aliases = aliasesFor(r.request_id, r.kind, summary)
    const startedAt = rememberStartedAt(aliases, v?.toolRequestOpenedAt?.[r.request_id])
    assign(r.request_id, r.kind, summary, { status: 'running', stdout: live?.stdout || '', stderr: live?.stderr || '', updatedAt: live?.updatedAt, startedAt })
  }
  for (const r of v?.toolResults || []) {
    const params = v?.toolRequestParams?.[r.request_id] || {}
    const kind = r.kind || 'tool'
    const summary = summarizeToolRequest(kind, params)
    const live = s?.toolOutputs?.[r.request_id]
    const final = toolResultOutput(r.result, r.error)
    const aliases = aliasesFor(r.request_id, kind, summary)
    const startedAt = rememberStartedAt(aliases, r.opened_ts)
    assign(r.request_id, kind, summary, {
      status: r.ok ? 'completed' : 'failed',
      stdout: live?.stdout || final?.stdout || '',
      stderr: live?.stderr || final?.stderr || '',
      updatedAt: live?.updatedAt,
      startedAt,
      endedAt: r.ts || live?.updatedAt || Date.now(),
    })
  }
  return out
}
