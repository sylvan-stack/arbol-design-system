// Stable chat render DTOs and initial empty view; no durable event replay.
import type { ToolDecision } from './catalog.gen'

export type ChatSessionStatus =
  | 'idle'
  | 'draft'
  | 'running'
  | 'error'
  | 'archived'
  | 'imported_readonly'

export type TurnPhase =
  | 'pending'
  | 'routing'
  | 'executing'
  | 'awaiting_tools'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ToolPhase = 'pending' | 'decided' | 'timed_out' | 'settled'

/** Mirrors aggregates/turn.py BatchState. */
export interface BatchView {
  batch_id: string
  expected: number
  resolved: number
}

/** Mirrors aggregates/turn.py TurnState. */
export interface TurnView {
  turn_id: string
  phase: TurnPhase
  ip_name: string | null
  attempt: number
  excluded_ips: string[] // sorted, unique (Core uses a frozenset)
  batches: BatchView[]
  cycles: number
  stop_reason: string | null
  error: string | null
}

/** Mirrors aggregates/tool_request.py ToolRequestState. */
export interface ToolRequestView {
  request_id: string
  batch_id: string
  kind: string
  /** Projected approval metadata; not part of aggregate-fold parity. */
  reason?: string
  origin?: string
  canonical_kind?: string
  approval_policy?: string
  phase: ToolPhase
  decision: ToolDecision | null
  ok: boolean | null
  /** Turn that originated this tool request, used by the chat UI to attach output. */
  turn_id?: string
}

/** UI-only: a settled tool request result, retained so Elma can render the
 *  output directly under the matching tool call in the chat. */
export interface ToolResultView {
  request_id: string
  turn_id?: string
  kind?: string
  batch_id?: string
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  /** TOOL_REQUEST_OPENED timestamp when known. */
  opened_ts?: number
  /** EFFECTOR_SETTLED_TOOL_REQUEST timestamp. */
  ts: number
}

/** UI-only: one native tool call observed from the CLI (the execution track,
 *  IP_INVOKED/IP_SETTLED_NATIVE_TOOL). `ok === null` while running — natively
 *  there is no live stdout (research C1), so cards show running → settled.
 *  `request_id` links to the decision track when the bridge was consulted. */
export interface NativeToolCallView {
  tool_use_id: string
  turn_id: string
  tool_name: string
  input: Record<string, unknown>
  ok: boolean | null
  result?: Record<string, unknown>
  error?: string
  /** Large settled output omitted from transcript pages until expanded. */
  result_deferred?: boolean
  result_byte_len?: number
  /** Integrity identity and bounded preview for explicitly hydrated output. */
  result_sha256?: string
  result_preview?: { encoding: 'utf-8'; text: string } | { encoding: 'base64'; data: string }
  content_format?: string
  request_id?: string
  invoked_ts: number
  settled_ts?: number
  /** Durable monotonic append position of the IP_INVOKED_NATIVE_TOOL event.
   *  This is the canonical chronological key for interleaving native tool calls
   *  with assistant prose cycles — `invoked_ts` (ms) ties across same-millisecond
   *  events and can reorder small chunks. */
  seq?: number
}

/** UI-only: a rendered chat bubble (mirrors the `messages` projection).
 *  `turn_id` ties the bubble to its turn (so a UI can group a turn's prompt +
 *  reply when rebuilding the tree from the log); `ts` is the event time. */
export interface MessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Chat Notes are user-role history items that do not open a Turn. */
  message_type?: 'note'
  /** Reasoning the IP produced for this assistant cycle (IP_COMPLETED_CYCLE.
   *  thinking). Live-only on the in-flight turn until the cycle seals it; then
   *  durable, so it survives reload. Absent on user rows and tools-only cycles. */
  thinking?: string
  attachments?: unknown[]
  turn_id: string
  ts: number
  /** Durable monotonic append position of the IP_COMPLETED_CYCLE event. The
   *  canonical chronological key for interleaving this assistant cycle with
   *  native tool calls (see NativeToolCallView.seq). Absent on user rows. */
  seq?: number
}

/**
 * One node of the conversation TREE (conversation-branching.md §5.4). Mirrors
 * the Core aggregate's `ChatSessionState.turns`/`removed`: `parent_turn_id` is the
 * fork edge (null ⇒ root), `removed` is the explicit USER_REMOVED_TURN flag.
 * The append-only log keeps removed turns in the map (audit/undo); hiding a
 * removed turn's *subtree* is derived from these pointers by the UI (the twin of
 * `tree.descendants`), exactly as the Python read model does — so this is the
 * parity surface, not the hidden set.
 */
export interface TurnNode {
  turn_id: string
  parent_turn_id: string | null
  removed: boolean
}

/**
 * The folded chat_session view. The first four fields mirror the Core aggregate
 * (`ChatSessionState`) — they are the parity surface. `messages` is the UI-only
 * rendered transcript.
 *
 * As in Core, `toolRequests` is BOUNDED: only *unresolved* requests are tracked
 * (a request is dropped the instant it resolves — it then lives only in the read
 * model / transcript), so state stays small across long chat_sessions (§6 #4).
 */
export interface WorkingDirectoryChangeView {
  worktree_path: string
  turn_id: string | null
  ts: number
}

export interface TurnTerminalView {
  turn_id: string
  phase: Extract<TurnPhase, 'completed' | 'failed' | 'cancelled'>
  error: string | null
  /** Timestamp of the durable terminal event (epoch milliseconds). */
  failed_at?: number
}

export interface ChatSessionView {
  chat_session_id: string
  status: ChatSessionStatus | null
  title: string
  /** Materialized session-list flag used by Elma chrome. */
  onGoing?: boolean
  turn: TurnView | null
  /** UI-only terminal outcome retained after the aggregate clears `turn`. */
  lastTurnTerminal?: TurnTerminalView
  toolRequests: Record<string, ToolRequestView>
  /** UI-only unresolved tool request params, keyed by request_id. Kept outside
   * `toolRequests` because that object is part of the Core/TS fold-parity
   * surface and mirrors Core's bounded ToolRequestState exactly. */
  toolRequestParams: Record<string, Record<string, unknown>>
  /** UI-only TOOL_REQUEST_OPENED timestamps, keyed by request_id. */
  toolRequestOpenedAt: Record<string, number>
  messages: MessageView[]
  /** UI-only settled tool outputs, keyed back to request_id + turn_id. */
  toolResults: ToolResultView[]
  /** UI-only native tool executions (the observational track), in invocation
   *  order. Bounded by turn length in practice; never part of fold parity. */
  nativeToolCalls: NativeToolCallView[]
  /** Durable Working Directory changes, rendered as visible turn separators. */
  workingDirectoryChanges: WorkingDirectoryChangeView[]
  /**
   * The conversation tree, keyed by turn_id (conversation-branching.md §5.4).
   * Folded from `USER_SENT_MESSAGE.parent_turn_id` + `USER_REMOVED_TURN`; mirrors
   * the Core aggregate's `turns`/`removed` (the fold-parity surface). The UI
   * derives the active path and hides removed subtrees from this map.
   */
  turns: Record<string, TurnNode>
}

export function initialChatSession(chat_sessionId: string): ChatSessionView {
  return {
    chat_session_id: chat_sessionId,
    status: null,
    title: '',
    onGoing: false,
    turn: null,
    toolRequests: {},
    toolRequestParams: {},
    toolRequestOpenedAt: {},
    messages: [],
    toolResults: [],
    nativeToolCalls: [],
    workingDirectoryChanges: [],
    turns: {},
  }
}

