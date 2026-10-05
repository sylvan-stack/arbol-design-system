/* Rebuild Elma's conversation tree from the shared fold (conversation-branching
 * §5.4). `useSessionView` replays the durable log into a `SessionView` that
 * carries the turn tree (`view.turns`: id → {parent_turn_id, removed}) and the
 * flat transcript (`view.messages`, each tagged with its `turn_id`). This pure
 * function folds those into the `TurnMap`/`rootId` the chat renders — so the
 * conversation survives reload / a new window: it's reconstructed from Core's
 * log, not from client-only state.
 *
 * The TREE is the parity surface (mirrors the Core aggregate); the hidden set
 * (a removed turn + its whole subtree) is DERIVED here, the UI twin of the
 * read-model's `descendant_turns`. Pure: no clock/IO; same view in → same tree.
 */
import { assistantBlocks, parseMarkdown, type AssistantCycle, type Turn, type TurnMap } from '../../constants'
import type { SessionView, StreamingOverlay } from '@arbol/events'

/* A removed turn + every descendant — excluded from the rendered tree (the log
 * keeps them; the read model and this fold hide the subtree). */
export function hiddenTurns(view: SessionView): Set<string> {
  const children: Record<string, string[]> = {}
  for (const t of Object.values(view.turns)) {
    if (t.parent_turn_id) (children[t.parent_turn_id] ||= []).push(t.turn_id)
  }
  const hidden = new Set<string>()
  const stack = Object.values(view.turns).filter((t) => t.removed).map((t) => t.turn_id)
  while (stack.length) {
    const x = stack.pop() as string
    if (hidden.has(x)) continue
    hidden.add(x)
    for (const c of children[x] || []) stack.push(c)
  }
  return hidden
}

const EMPTY_STREAMING: StreamingOverlay = { text: '', thinking: '' }

/* Build the renderable tree from the folded view. `streaming` overlays the live
 * token text onto the in-flight turn (so a reload mid-turn keeps streaming). */
export function buildTreeFromView(
  view: SessionView,
  streaming: StreamingOverlay = EMPTY_STREAMING,
): { nodes: TurnMap; rootId: string | null } {
  const hidden = hiddenTurns(view)

  // Group the transcript by turn: the user prompt + the ordered assistant cycles.
  const userMsg: Record<string, string> = {}
  const userTs: Record<string, number> = {}
  const userAttachments: Record<string, any[]> = {}
  const asst: Record<string, AssistantCycle[]> = {}
  const lastTs: Record<string, number> = {}
  const toolResults: Record<string, any[]> = {}
  const toolStatuses: Record<string, any[]> = {}
  const requestTurn: Record<string, string> = {}
  for (const req of Object.values(view.toolRequests || {})) {
    if (!req.turn_id) continue
    requestTurn[req.request_id] = req.turn_id
    ;(toolStatuses[req.turn_id] ||= []).push({
      request_id: req.request_id,
      kind: req.kind,
      params: view.toolRequestParams?.[req.request_id] || {},
      ts: view.toolRequestOpenedAt?.[req.request_id],
      phase: req.phase,
      decision: req.decision,
      ok: req.ok,
    })
  }

  for (const m of view.messages) {
    if (m.message_type === 'note') continue
    lastTs[m.turn_id] = m.ts
    if (m.role === 'user') {
      userMsg[m.turn_id] = m.content
      userTs[m.turn_id] = m.ts
      if ((m as any).attachments) userAttachments[m.turn_id] = (m as any).attachments
    } else {
      ;(asst[m.turn_id] ||= []).push({ content: m.content, thinking: m.thinking, ts: m.ts, seq: m.seq })
      for (const b of parseMarkdown(m.content)) {
        if (b.t === 'arbol' && b.id) requestTurn[b.id] = m.turn_id
      }
    }
  }

  const inFlight = view.status === 'running' ? view.turn?.turn_id ?? null : null

  const nodes: TurnMap = {}
  for (const r of view.toolResults || []) {
    const tid = r.turn_id || requestTurn[r.request_id]
    if (!tid) continue
    ;(toolResults[tid] ||= []).push({
      request_id: r.request_id,
      kind: r.kind,
      params: view.toolRequestParams?.[r.request_id] || {},
      opened_ts: r.opened_ts,
      ok: r.ok,
      result: r.result,
      error: r.error,
      ts: r.ts,
    })
    // Settled requests are removed from view.toolRequests. Keep enough metadata
    // to render their call row even for provider-native calls
    // (Universe native function calls intentionally produce no such fence).
    if (!(toolStatuses[tid] || []).some((x) => x.request_id === r.request_id)) {
      ;(toolStatuses[tid] ||= []).push({
        request_id: r.request_id,
        kind: r.kind,
        params: view.toolRequestParams?.[r.request_id] || {},
        ts: r.opened_ts || r.ts,
        phase: 'settled',
        ok: r.ok,
      })
    }
    lastTs[tid] = Math.max(lastTs[tid] || 0, r.ts || 0)
  }

  const order: string[] = []
  for (const t of Object.values(view.turns)) {
    const id = t.turn_id
    if (hidden.has(id)) continue
    order.push(id)
    const isInFlight = id === inFlight
    const cycles = [...(asst[id] || [])]
    if (isInFlight && (streaming.thinking || streaming.text)) cycles.push({ content: streaming.text, thinking: streaming.thinking })
    const answer = assistantBlocks(cycles, toolResults[id] || [], toolStatuses[id] || [], (view.nativeToolCalls || []).filter((c) => c.turn_id === id))
    const node: Turn = {
      id,
      parentId: t.parent_turn_id,
      message: userMsg[id] ?? '',
      attachments: userAttachments[id] as any,
      answer,
      sentAt: userTs[id] ?? lastTs[id] ?? 0,
      startedAt: userTs[id] ?? 0,
      // null ⇒ still responding (only the in-flight turn); everything else is settled.
      respondedAt: isInFlight ? null : (lastTs[id] || userTs[id] || 1),
      children: [],
    }
    nodes[id] = node
  }

  // Wire children in send order (Object.values(view.turns) is fold/insertion order).
  for (const id of order) {
    const p = nodes[id].parentId
    if (p && nodes[p]) nodes[p].children.push(id)
  }

  // The root is the first visible turn with no (visible) parent. A parent that
  // isn't in the rendered set counts as "no visible parent": that turn anchors
  // the tree. This lets a bounded recent-Turn page render when its real parent
  // belongs to an older page that has not been requested yet.
  const rootId = order.find((id) => {
    const p = nodes[id].parentId
    return p === null || !nodes[p]
  }) ?? null
  return { nodes, rootId }
}
