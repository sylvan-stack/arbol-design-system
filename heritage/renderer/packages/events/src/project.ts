// Historical pure fold diagnostics for the legacy/offline event contract.
// The state renderer uses state.ts -> view/useProjection and rejects this module.
// Golden parity tests retain the old reducer semantics for captured archives;
// live UIs consume server render DTOs and apply only transient stream overlays.

import type {
  ArbolEvent,
  ToolDecision,
} from './catalog.gen'

// ---- view types (mirror the Core dataclasses on the shared fields) ----

import { initialChatSession } from './view'
import type { ChatSessionStatus, TurnPhase, ToolPhase, BatchView, TurnView, ToolRequestView, ToolResultView, NativeToolCallView, MessageView, TurnNode, WorkingDirectoryChangeView, TurnTerminalView, ChatSessionView } from './view'
export { initialChatSession } from './view'
export type { ChatSessionStatus, TurnPhase, ToolPhase, BatchView, TurnView, ToolRequestView, ToolResultView, NativeToolCallView, MessageView, TurnNode, WorkingDirectoryChangeView, TurnTerminalView, ChatSessionView } from './view'

// ---- the fold ----

type TurnEvent = Extract<
  ArbolEvent,
  {
    type:
      | 'CORE_SELECTED_IP'
      | 'TURN_STARTED'
      | 'IP_REQUESTED_TOOLS'
      | 'IP_COMPLETED_CYCLE'
      | 'TURN_COMPLETED'
      | 'TURN_FAILED'
      | 'TURN_FAILED_RATE_LIMIT'
      | 'CORE_RETRIED_FAILOVER'
      | 'USER_CANCELLED_TURN'
  }
>

type ToolEvent = Extract<
  ArbolEvent,
  {
    type:
      | 'TOOL_REQUEST_OPENED'
      | 'TOOL_REQUEST_AWAITING_APPROVAL'
      | 'USER_DECIDED_TOOL_REQUEST'
      | 'TOOL_REQUEST_TIMED_OUT'
      | 'EFFECTOR_SETTLED_TOOL_REQUEST'
  }
>

/**
 * Fold one durable event into the chat_session view. Pure: no clock, IO, or
 * randomness — same as the Core fold. The event is assumed already legal (Core
 * guards before it persists); this only computes the resulting state.
 */
export function projectChatSession(s: ChatSessionView, e: ArbolEvent): ChatSessionView {
  switch (e.type) {
    // ---- chat_session lifecycle / status (aggregates.md §4 _fold_chat_session) ----
    case 'CHAT_SESSION_CREATED':
      return { ...s, status: 'idle', title: e.payload.title ?? '' }
    case 'CHAT_SESSION_IMPORTED':
      return { ...s, status: 'imported_readonly' }
    case 'CHAT_SESSION_RENAMED':
      return { ...s, title: e.payload.title } // status unchanged
    case 'CHAT_SESSION_DRAFT_STARTED':
      return { ...s, status: 'draft' }
    case 'CHAT_SESSION_DRAFT_CLEARED':
      return { ...s, status: 'idle' }
    case 'CHAT_SESSION_ARCHIVED':
      return { ...s, status: 'archived' }
    case 'USER_ADDED_CHAT_NOTE':
      return {
        ...s,
        messages: [
          ...s.messages,
          {
            id: e.payload.message_id,
            role: 'user',
            content: e.payload.content,
            message_type: 'note',
            // Empty means context before a root Turn; this is a branch anchor,
            // not ownership by a Turn.
            turn_id: e.payload.parent_turn_id ?? '',
            ts: e.ts,
          },
        ],
      }
    case 'USER_SENT_MESSAGE':
      // Busy from the instant the user sends; opens a fresh pending turn and
      // clears any leftover tool requests (Core clears the dict here too). Also
      // records this turn's place in the tree (parent_turn_id, null ⇒ root).
      return {
        ...s,
        status: 'running',
        // A submitted Turn marks the session ongoing. Completion/failure never
        // clears this user-curated flag; only CHAT_SESSION_SET_ONGOING(false)
        // may do that.
        onGoing: true,
        toolRequests: {},
        toolRequestParams: {},
        toolRequestOpenedAt: {},
        turn: newTurn(e.payload.turn_id),
        lastTurnTerminal: undefined,
        turns: {
          ...s.turns,
          [e.payload.turn_id]: {
            turn_id: e.payload.turn_id,
            parent_turn_id: e.payload.parent_turn_id ?? null,
            removed: false,
          },
        },
        messages: [
          ...s.messages,
          {
            id: e.payload.message_id,
            role: 'user',
            content: e.payload.content,
            // Conditional like `thinking` below: a plain prompt folds to the
            // same shape it always did (no `undefined` key — keeps deepEqual).
            ...((e.payload as any).attachments || (e.payload as any).attachment_refs
              ? { attachments: (e.payload as any).attachments || (e.payload as any).attachment_refs }
              : {}),
            turn_id: e.payload.turn_id,
            ts: e.ts,
          },
        ],
      }

    case 'USER_REMOVED_TURN': {
      // Mark the turn removed (append-only — it stays in the map for audit/undo;
      // the UI hides its subtree). Mirrors the Core aggregate's `removed` set.
      const existing = s.turns[e.payload.turn_id]
      if (!existing) return s
      return {
        ...s,
        turns: { ...s.turns, [e.payload.turn_id]: { ...existing, removed: true } },
      }
    }

    // ---- turn events (delegated to the turn fold) ----
    case 'CORE_SELECTED_IP':
    case 'TURN_STARTED':
    case 'IP_REQUESTED_TOOLS':
    case 'IP_COMPLETED_CYCLE':
    case 'TURN_COMPLETED':
    case 'TURN_FAILED':
    case 'TURN_FAILED_RATE_LIMIT':
    case 'CORE_RETRIED_FAILOVER':
    case 'USER_CANCELLED_TURN':
      return foldTurnEvent(s, e)

    // ---- tool-request events (delegated to the tool fold) ----
    case 'TOOL_REQUEST_OPENED':
    case 'TOOL_REQUEST_AWAITING_APPROVAL':
    case 'USER_DECIDED_TOOL_REQUEST':
    case 'TOOL_REQUEST_TIMED_OUT':
    case 'EFFECTOR_SETTLED_TOOL_REQUEST':
      return foldToolEvent(s, e)

    // ---- native tool executions (observational; no FSM transition) ----
    // Turn-scoped by their own payload turn_id, NOT by the current turn (Core's
    // NATIVE_TOOL_EVENTS): a late settle from a stopped run stays bound to the
    // turn that produced it and never touches `s.turn`, so it cannot attach to a
    // newer message. Mirror Core's guard: an event for an unknown turn is ignored.
    case 'IP_INVOKED_NATIVE_TOOL': {
      if (!s.turns[e.payload.turn_id]) return s
      // CLI tool IDs may repeat in another turn.
      if (s.nativeToolCalls.some((c) => c.turn_id === e.payload.turn_id && c.tool_use_id === e.payload.tool_use_id)) {
        return s
      }
      return {
        ...s,
        nativeToolCalls: [
          ...s.nativeToolCalls,
          {
            tool_use_id: e.payload.tool_use_id,
            turn_id: e.payload.turn_id,
            tool_name: e.payload.tool_name,
            input: e.payload.input || {},
            ok: null,
            ...(e.payload.request_id ? { request_id: e.payload.request_id } : {}),
            invoked_ts: e.ts,
            seq: e.chat_session_seq,
          },
        ],
      }
    }
    case 'IP_SETTLED_NATIVE_TOOL': {
      const idx = s.nativeToolCalls.findIndex(
        (c) => c.turn_id === e.payload.turn_id && c.tool_use_id === e.payload.tool_use_id,
      )
      if (idx < 0 || s.nativeToolCalls[idx].ok !== null) return s
      return {
        ...s,
        nativeToolCalls: s.nativeToolCalls.map((c, i) =>
          i === idx
            ? {
                ...c,
                ok: Boolean(e.payload.ok),
                ...(e.payload.result ? { result: e.payload.result } : {}),
                ...(e.payload.error ? { error: e.payload.error } : {}),
                ...((e.payload as { result_deferred?: boolean }).result_deferred ? { result_deferred: true } : {}),
                ...(e.payload.content_ref ? {
                  result_deferred: true,
                  result_byte_len: Number(e.payload.content_ref.bytes),
                  result_sha256: String(e.payload.content_ref.sha256),
                  result_preview: e.payload.content_ref.preview as NativeToolCallView['result_preview'],
                  content_format: typeof e.payload.content_format === 'string' ? e.payload.content_format : undefined,
                } : {}),
                ...((e.payload as { result_byte_len?: number }).result_byte_len ? { result_byte_len: Number((e.payload as { result_byte_len?: number }).result_byte_len) } : {}),
                settled_ts: e.ts,
              }
            : c,
        ),
      }
    }

    case 'CHAT_SESSION_SET_WORKTREE': {
      const turnId = e.correlation_id && s.turns[e.correlation_id]
        ? e.correlation_id
        : s.turn?.turn_id ?? null
      const previous = s.workingDirectoryChanges[s.workingDirectoryChanges.length - 1]
      if (previous?.worktree_path === e.payload.worktree_path && previous.turn_id === turnId) return s
      return {
        ...s,
        workingDirectoryChanges: [
          ...s.workingDirectoryChanges,
          { worktree_path: e.payload.worktree_path, turn_id: turnId, ts: e.ts },
        ],
      }
    }

    // ---- pure annotations + non-chat_session aggregates: no view change ----
    // Session preferences/list flags are persisted by Core but do not alter
    // this conversation-content view.
    case 'CHAT_SESSION_SET_ONGOING':
      return { ...s, onGoing: e.payload.onGoing }
    case 'CHAT_SESSION_SET_THINKING_LEVEL':
    case 'CHAT_SESSION_SET_MODEL':
    case 'CHAT_SESSION_SET_UNREAD':
    case 'TURN_RECORDED_USAGE':
    case 'CORE_RAISED_ERROR':
    case 'SUBSCRIPTION_LOGGED_IN':
    case 'SUBSCRIPTION_LOGGED_OUT':
    case 'SUBSCRIPTION_AUTH_EXPIRED':
    case 'SUBSCRIPTION_CAPTURED_USAGE':
      return s
  }
  // Exhaustiveness: if a new catalog event is added without a case above, `e`
  // is no longer `never` here and this assignment fails to type-check (§14).
  return assertNever(e, s)
}

/** Replay a whole stream from the initial state (golden-sequence helper). */
export function replayChatSession(
  chat_sessionId: string,
  events: readonly ArbolEvent[],
): ChatSessionView {
  let s = initialChatSession(chat_sessionId)
  for (const e of events) s = projectChatSession(s, e)
  return s
}

// ---- turn fold (aggregates.md §4 _fold_turn + §3 fold_turn) ----

function foldTurnEvent(s: ChatSessionView, e: TurnEvent): ChatSessionView {
  // Core guards that a turn exists for turn events; be defensive in the UI.
  if (!s.turn) return s

  const nt = foldTurnState(s.turn, e)

  // UI-only transcript: retain any cycle that contains answer text OR reasoning.
  // Core's messages table only needs text-bearing rows, but dropping a
  // thinking-only cycle here would make generated reasoning vanish on settle or
  // reload. Give those UI-only rows a stable event-derived id.
  let messages = s.messages
  if (e.type === 'IP_COMPLETED_CYCLE' && (e.payload.message_id || e.payload.thinking)) {
    messages = [
      ...s.messages,
      {
        id: e.payload.message_id || `thinking-${e.payload.turn_id}-${e.chat_session_seq ?? e.ts}`,
        role: 'assistant',
        content: e.payload.content,
        // Only carried when the cycle produced reasoning — so a thinking-less
        // cycle folds to the same shape it always did (no `undefined` key).
        ...(e.payload.thinking ? { thinking: e.payload.thinking } : {}),
        turn_id: e.payload.turn_id,
        ts: e.ts,
        ...(e.chat_session_seq ? { seq: e.chat_session_seq } : {}),
      },
    ]
  }

  // Terminal turn phases reconcile the *chat_session* status and clear the turn
  // (aggregates.md §4: completed/cancelled → idle, failed → error).
  if (nt.phase === 'completed' || nt.phase === 'cancelled') {
    // Compatibility for logs written before Core distinguished lifecycle `done`
    // from successful completion. Those logs contain TURN_COMPLETED with a
    // failure stop_reason; classify the UI-only terminal correctly so existing
    // sessions stop showing a green Completed state after max-cycles/error.
    const legacyFailure = nt.phase === 'completed'
      && (nt.stop_reason === 'max_cycles' || nt.stop_reason === 'error')
    const terminalError = legacyFailure
      ? nt.stop_reason === 'max_cycles'
        ? 'Agent exhausted its tool-cycle limit without producing a final response.'
        : 'Agent execution failed.'
      : nt.error
    return {
      ...s,
      status: legacyFailure ? 'error' : 'idle',
      turn: null,
      toolRequests: {},
      messages,
      lastTurnTerminal: {
        turn_id: nt.turn_id,
        phase: legacyFailure ? 'failed' : nt.phase,
        error: terminalError,
        ...(legacyFailure ? { failed_at: e.ts } : {}),
      },
    }
  }
  if (nt.phase === 'failed') {
    return {
      ...s, status: 'error', turn: null, toolRequests: {}, messages,
      lastTurnTerminal: { turn_id: nt.turn_id, phase: 'failed', error: nt.error, failed_at: e.ts },
    }
  }
  return { ...s, turn: nt, messages }
}

function foldTurnState(t: TurnView, e: TurnEvent): TurnView {
  switch (e.type) {
    case 'CORE_SELECTED_IP':
      // pending/routing → routing (re-selection on failover stays routing)
      return { ...t, phase: 'routing', ip_name: e.payload.route.ip_name }
    case 'TURN_STARTED':
      return { ...t, phase: 'executing', ip_name: e.payload.ip_name ?? t.ip_name }
    case 'IP_REQUESTED_TOOLS':
      return {
        ...t,
        phase: 'awaiting_tools',
        batches: [
          ...t.batches,
          {
            batch_id: e.payload.batch_id,
            expected: (e.payload.requests ?? []).length,
            resolved: 0,
          },
        ],
      }
    case 'IP_COMPLETED_CYCLE':
      return { ...t, cycles: t.cycles + 1 } // phase stays executing
    case 'TURN_FAILED_RATE_LIMIT': {
      // stays executing; just excludes the rate-limited IP from this turn
      const ip = e.payload.ip_name || t.ip_name
      return { ...t, excluded_ips: addExcluded(t.excluded_ips, ip) }
    }
    case 'CORE_RETRIED_FAILOVER': {
      if (t.phase === 'routing') return t // annotation while routing; no-op
      const from = e.payload.from_ip || t.ip_name // executing → routing, next attempt
      return {
        ...t,
        phase: 'routing',
        attempt: t.attempt + 1,
        excluded_ips: addExcluded(t.excluded_ips, from),
      }
    }
    case 'TURN_COMPLETED':
      return { ...t, phase: 'completed', stop_reason: e.payload.stop_reason ?? null }
    case 'TURN_FAILED':
      return { ...t, phase: 'failed', error: e.payload.error ?? null }
    case 'USER_CANCELLED_TURN':
      return { ...t, phase: 'cancelled' }
    default:
      return t
  }
}

// ---- tool fold (aggregates.md §4 _fold_tool + §2 fold_tool_request) ----

function foldToolEvent(s: ChatSessionView, e: ToolEvent): ChatSessionView {
  const rid = e.payload.request_id
  const reqs: Record<string, ToolRequestView> = { ...s.toolRequests }
  let requestParams: Record<string, Record<string, unknown>> = { ...s.toolRequestParams }
  let requestOpenedAt: Record<string, number> = { ...s.toolRequestOpenedAt }
  let turn = s.turn

  if (e.type === 'TOOL_REQUEST_OPENED') {
    reqs[rid] = {
      request_id: rid,
      batch_id: e.payload.batch_id,
      kind: e.payload.kind,
      turn_id: turn?.turn_id,
      phase: 'pending',
      decision: null,
      ok: null,
    }
    requestParams[rid] = e.payload.params || {}
    requestOpenedAt[rid] = e.ts
    return { ...s, toolRequests: reqs, toolRequestParams: requestParams, toolRequestOpenedAt: requestOpenedAt }
  }

  const before = reqs[rid]
  let toolResults = s.toolResults

  if (!before) {
    // Unknown/closed request: most tool events can be ignored defensively, but
    // settlement carries the actual command output. Keep it so the chat can
    // attach it by request_id or by same-turn/order fallback.
    if (e.type !== 'EFFECTOR_SETTLED_TOOL_REQUEST') return s
    const resultTurnId = turn?.turn_id
    const existingIndex = toolResults.findIndex((r) => r.request_id === rid)
    const settledResult = {
      request_id: rid,
      ...(resultTurnId ? { turn_id: resultTurnId } : {}),
      ok: Boolean(e.payload.ok),
      ...(e.payload.result ? { result: e.payload.result } : {}),
      ...(e.payload.error ? { error: e.payload.error } : {}),
      ts: e.ts,
    }
    toolResults = existingIndex >= 0
      ? toolResults.map((r, i) => (i === existingIndex ? { ...r, ...settledResult } : r))
      : [...toolResults, settledResult]
    return { ...s, toolResults }
  }

  const after = foldToolRequest(before, e)
  reqs[rid] = after

  if (e.type === 'EFFECTOR_SETTLED_TOOL_REQUEST') {
    const resultTurnId = after.turn_id ?? before.turn_id ?? turn?.turn_id
    const existingIndex = toolResults.findIndex((r) => r.request_id === rid)
    const settledResult = {
      request_id: rid,
      ...(resultTurnId ? { turn_id: resultTurnId } : {}),
      kind: after.kind,
      batch_id: after.batch_id,
      ok: Boolean(e.payload.ok),
      ...(e.payload.result ? { result: e.payload.result } : {}),
      ...(e.payload.error ? { error: e.payload.error } : {}),
      ...(s.toolRequestOpenedAt[rid] ? { opened_ts: s.toolRequestOpenedAt[rid] } : {}),
      ts: e.ts,
    }
    if (existingIndex >= 0) {
      toolResults = toolResults.map((r, i) => (i === existingIndex ? { ...r, ...settledResult } : r))
    } else {
      toolResults = [...toolResults, settledResult]
    }
  }

  // When a request *becomes* resolved, count it against its batch and resume
  // the turn (awaiting_tools → executing) once all batches close — then drop it
  // from the dict (it lives on only in the transcript). Mirrors Core exactly.
  if (turn && isResolved(after) && !isResolved(before)) {
    turn = markBatchProgress(turn, after.batch_id)
    if (turn.phase === 'awaiting_tools' && allBatchesClosed(turn)) {
      turn = { ...turn, phase: 'executing' }
    }
    delete reqs[rid]
  }

  return { ...s, toolRequests: reqs, toolRequestParams: requestParams, toolRequestOpenedAt: requestOpenedAt, turn, toolResults }
}

function foldToolRequest(s: ToolRequestView, e: ToolEvent): ToolRequestView {
  switch (e.type) {
    case 'TOOL_REQUEST_AWAITING_APPROVAL':
      return {
        ...s,
        reason: e.payload.reason || '',
        canonical_kind: e.payload.canonical_kind,
        approval_policy: e.payload.approval_policy,
      }
    case 'USER_DECIDED_TOOL_REQUEST':
      return { ...s, phase: 'decided', decision: e.payload.decision }
    case 'TOOL_REQUEST_TIMED_OUT':
      return { ...s, phase: 'timed_out' }
    case 'EFFECTOR_SETTLED_TOOL_REQUEST':
      return { ...s, phase: 'settled', ok: Boolean(e.payload.ok) }
    default:
      return s
  }
}

/**
 * Resolved = the IP can be told a terminal outcome, so the request no longer
 * blocks its batch (aggregates.md §2): settled, timed_out, or decided+reject.
 */
function isResolved(s: ToolRequestView): boolean {
  return (
    s.phase === 'settled' ||
    s.phase === 'timed_out' ||
    (s.phase === 'decided' && s.decision === 'reject')
  )
}

// ---- batch / turn helpers (aggregates.md §3) ----

function newTurn(turnId: string): TurnView {
  return {
    turn_id: turnId,
    phase: 'pending',
    ip_name: null,
    attempt: 1,
    excluded_ips: [],
    batches: [],
    cycles: 0,
    stop_reason: null,
    error: null,
  }
}

function markBatchProgress(t: TurnView, batchId: string): TurnView {
  return {
    ...t,
    batches: t.batches.map((b) =>
      b.batch_id === batchId ? { ...b, resolved: b.resolved + 1 } : b,
    ),
  }
}

function allBatchesClosed(t: TurnView): boolean {
  return t.batches.every((b) => b.resolved >= b.expected)
}

/** Add an IP to the excluded set (sorted + unique; Core uses a frozenset). */
function addExcluded(list: string[], ip: string | null): string[] {
  if (!ip || list.includes(ip)) return list
  return [...list, ip].sort()
}

function assertNever(_e: never, s: ChatSessionView): ChatSessionView {
  return s
}
