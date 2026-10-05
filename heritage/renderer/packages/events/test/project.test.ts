const CHAT_SESSION_COLOR_PALETTE = [
  '#F87171',
  '#FB7185',
  '#F472B6',
  '#E879F9',
  '#C084FC',
  '#A78BFA',
  '#818CF8',
  '#60A5FA',
  '#38BDF8',
  '#22D3EE',
  '#2DD4BF',
  '#34D399',
  '#4ADE80',
  '#84CC16',
  '#A3E635',
  '#FACC15',
  '#FBBF24',
  '#FB923C',
  '#FF8A65',
  '#D4A373',
  '#E5989B',
  '#B5838D',
  '#9D8189',
  '#CDB4DB',
  '#BDE0FE',
  '#A2D2FF',
  '#8ECAE6',
  '#90E0EF',
  '#80ED99',
  '#B7E4C7',
  '#D8F3DC',
  '#E9C46A',
  '#F4A261',
  '#E76F51',
  '#EF476F',
  '#FFD166',
  '#06D6A0',
  '#118AB2',
  '#7BDFF2',
  '#B2F7EF',
  '#EFF7F6',
  '#F7D6E0',
  '#F2B5D4',
  '#C9BBCF',
  '#A8DADC',
  '#BAD7F2',
  '#F1C0E8',
  '#CFBAF0',
  '#A3C4F3',
  '#98F5E1',
] as const

function randomChatSessionColor() { return CHAT_SESSION_COLOR_PALETTE[Math.floor(Math.random() * CHAT_SESSION_COLOR_PALETTE.length)] }

// Unit tests for the shared UI fold (Step 6.1). Golden sequences → asserted
// ChatSessionView (event-sourcing.md §17). Pure functions: fast, deterministic, no
// daemons. Run via `node renderer/packages/events/test/run.mjs` (esbuild bundles
// this TS + project.ts, then node --test executes it).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { replayChatSession, projectChatSession, initialChatSession } from '../src/project'
import type { ArbolEvent } from '../src/catalog.gen'

// Minimal catalog event — projectChatSession only reads `type` + `payload`, so the
// envelope is filler. `chat_session_seq` is set where a test cares about dedupe.
function ev(type: string, payload: any, extra: Record<string, unknown> = {}): ArbolEvent {
  return {
    seq: 0,
    chat_session_seq: 0,
    id: '',
    ts: 0,
    aggregate: 'chat_session',
    aggregate_id: 'S',
    correlation_id: null,
    causation_id: null,
    actor: 'core',
    type,
    v: 1,
    payload,
    ...extra,
  } as ArbolEvent
}

const CREATE = ev('CHAT_SESSION_CREATED', { workspace_dirs: [],
        color: randomChatSessionColor(), title: 'Hello' })
const SEND = ev('USER_SENT_MESSAGE', {
  turn_id: 'T1',
  message_id: 'm1',
  content: 'hi',
  thinking_level: 'medium',
})
const SELECT = ev('CORE_SELECTED_IP', { turn_id: 'T1', route: { ip_name: 'widget-claude', reason: 'default' } })
const START = ev('TURN_STARTED', { turn_id: 'T1', ip_name: 'widget-claude' })
const replay = (events: ArbolEvent[]) => replayChatSession('S', events)

// -------------------- chat_session lifecycle --------------------

test('CHAT_SESSION_CREATED → idle with title', () => {
  const v = replay([CREATE])
  assert.equal(v.status, 'idle')
  assert.equal(v.title, 'Hello')
  assert.equal(v.turn, null)
  assert.deepEqual(v.messages, [])
})

test('CHAT_SESSION_CREATED with no title → empty title', () => {
  const v = replay([ev('CHAT_SESSION_CREATED', { workspace_dirs: [] })])
  assert.equal(v.title, '')
})

test('CHAT_SESSION_IMPORTED → imported_readonly', () => {
  const v = replay([
    ev('CHAT_SESSION_IMPORTED', { source: 'codex', source_chat_session_id: 'x', source_provider: 'openai' }),
  ])
  assert.equal(v.status, 'imported_readonly')
})

test('CHAT_SESSION_RENAMED changes title, preserves status', () => {
  const v = replay([CREATE, ev('CHAT_SESSION_RENAMED', { title: 'Renamed' })])
  assert.equal(v.title, 'Renamed')
  assert.equal(v.status, 'idle')
})

test('CHAT_SESSION_ARCHIVED → archived', () => {
  const v = replay([CREATE, ev('CHAT_SESSION_ARCHIVED', {})])
  assert.equal(v.status, 'archived')
})

// -------------------- a full turn --------------------

test('Chat Note appends user history without opening a turn', () => {
  const v = replay([
    CREATE,
    ev('USER_ADDED_CHAT_NOTE', {
      message_id: 'ctx-1', content: 'background', parent_turn_id: null,
    }),
  ])
  assert.equal(v.status, 'idle')
  assert.equal(v.turn, null)
  assert.deepEqual(v.turns, {})
  assert.deepEqual(v.messages, [{
    id: 'ctx-1', role: 'user', content: 'background', message_type: 'note',
    turn_id: '', ts: 0,
  }])
})


test('simple turn: send → route → start → cycle → complete', () => {
  const v = replay([
    CREATE,
    SEND,
    SELECT,
    START,
    ev('IP_COMPLETED_CYCLE', { turn_id: 'T1', message_id: 'a1', content: 'hello back' }),
    ev('TURN_COMPLETED', { turn_id: 'T1', stop_reason: 'end_turn' }),
  ])
  assert.equal(v.status, 'idle')
  assert.equal(v.turn, null) // cleared on terminal
  assert.deepEqual(v.toolRequests, {})
  assert.deepEqual(v.messages, [
    { id: 'm1', role: 'user', content: 'hi', turn_id: 'T1', ts: 0 },
    { id: 'a1', role: 'assistant', content: 'hello back', turn_id: 'T1', ts: 0 },
  ])
})

test('mid-turn (running) reflects executing + cycle count', () => {
  const v = replay([
    CREATE,
    SEND,
    SELECT,
    START,
    ev('IP_COMPLETED_CYCLE', { turn_id: 'T1', message_id: 'a1', content: 'partial' }),
  ])
  assert.equal(v.status, 'running')
  assert.equal(v.turn?.phase, 'executing')
  assert.equal(v.turn?.cycles, 1)
  assert.equal(v.turn?.ip_name, 'widget-claude')
})

test('thinking-only cycle is retained as a durable assistant reasoning row', () => {
  const events = [
    ev('CHAT_SESSION_CREATED', { title: '' }),
    ev('USER_SENT_MESSAGE', { turn_id: 'T1', message_id: 'm1', content: 'hi', thinking_level: 'medium' }),
    ev('TURN_STARTED', { turn_id: 'T1', ip_name: 'ip' }),
    ev('IP_COMPLETED_CYCLE', { turn_id: 'T1', message_id: '', content: '', thinking: 'all generated reasoning' }),
  ]
  const s = replayChatSession('S1', events)
  const assistant = s.messages.filter((m) => m.role === 'assistant')
  assert.equal(assistant.length, 1)
  assert.equal(assistant[0].content, '')
  assert.equal(assistant[0].thinking, 'all generated reasoning')
})

test('tools-only cycle (empty message_id) writes no assistant message', () => {
  const v = replay([
    CREATE,
    SEND,
    SELECT,
    START,
    ev('IP_COMPLETED_CYCLE', { turn_id: 'T1', message_id: '', content: '' }),
  ])
  assert.equal(v.turn?.cycles, 1)
  assert.deepEqual(v.messages, [{ id: 'm1', role: 'user', content: 'hi', turn_id: 'T1', ts: 0 }])
})

test('routing reflects selected IP', () => {
  const v = replay([CREATE, SEND, SELECT])
  assert.equal(v.turn?.phase, 'routing')
  assert.equal(v.turn?.ip_name, 'widget-claude')
})

// -------------------- tool requests --------------------

const REQ = ev('IP_REQUESTED_TOOLS', {
  turn_id: 'T1',
  batch_id: 'B1',
  requests: [{ id: 'R1', kind: 'bash', params: {} }],
})
const OPEN = ev('TOOL_REQUEST_OPENED', { request_id: 'R1', batch_id: 'B1', kind: 'bash', params: {} })

test('tool request opened → pending in bounded dict, turn awaiting_tools', () => {
  const v = replay([CREATE, SEND, SELECT, START, REQ, OPEN])
  assert.equal(v.turn?.phase, 'awaiting_tools')
  assert.deepEqual(v.turn?.batches, [{ batch_id: 'B1', expected: 1, resolved: 0 }])
  assert.deepEqual(v.toolRequests, {
    R1: {
      request_id: 'R1', batch_id: 'B1', kind: 'bash', turn_id: 'T1',
      phase: 'pending', decision: null, ok: null,
    },
  })
})

test('decided-run (awaiting settle) stays in dict, batch still open', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, REQ, OPEN,
    ev('USER_DECIDED_TOOL_REQUEST', { request_id: 'R1', decision: 'run' }),
  ])
  assert.equal(v.turn?.phase, 'awaiting_tools')
  assert.equal(v.toolRequests.R1?.phase, 'decided')
  assert.equal(v.toolRequests.R1?.decision, 'run')
})

test('settle resolves request → dropped, turn resumes executing', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, REQ, OPEN,
    ev('USER_DECIDED_TOOL_REQUEST', { request_id: 'R1', decision: 'run' }),
    ev('EFFECTOR_SETTLED_TOOL_REQUEST', { request_id: 'R1', ok: true }),
  ])
  assert.equal(v.turn?.phase, 'executing') // resumed when the batch closed
  assert.deepEqual(v.toolRequests, {}) // resolved request dropped (bounded state)
  assert.deepEqual(v.turn?.batches, [{ batch_id: 'B1', expected: 1, resolved: 1 }])
})

test('reject resolves immediately (no settle) → dropped, turn resumes', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, REQ, OPEN,
    ev('USER_DECIDED_TOOL_REQUEST', { request_id: 'R1', decision: 'reject', reason: 'policy' }),
  ])
  assert.equal(v.turn?.phase, 'executing')
  assert.deepEqual(v.toolRequests, {})
})

test('timeout resolves → dropped, turn resumes', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, REQ, OPEN,
    ev('TOOL_REQUEST_TIMED_OUT', { request_id: 'R1' }),
  ])
  assert.equal(v.turn?.phase, 'executing')
  assert.deepEqual(v.toolRequests, {})
})

test('multi-batch: one batch closed, another open → stays awaiting_tools', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    REQ, // B1
    ev('IP_REQUESTED_TOOLS', { turn_id: 'T1', batch_id: 'B2', requests: [{ id: 'R2', kind: 'bash', params: {} }] }),
    OPEN, // R1 in B1
    ev('TOOL_REQUEST_OPENED', { request_id: 'R2', batch_id: 'B2', kind: 'bash', params: {} }),
    ev('USER_DECIDED_TOOL_REQUEST', { request_id: 'R1', decision: 'run' }),
    ev('EFFECTOR_SETTLED_TOOL_REQUEST', { request_id: 'R1', ok: true }),
  ])
  assert.equal(v.turn?.phase, 'awaiting_tools') // B2 still open
  assert.deepEqual(v.turn?.batches, [
    { batch_id: 'B1', expected: 1, resolved: 1 },
    { batch_id: 'B2', expected: 1, resolved: 0 },
  ])
  assert.equal(v.toolRequests.R2?.phase, 'pending')
  assert.equal(v.toolRequests.R1, undefined) // dropped
})

// -------------------- failover / rate limit --------------------

test('failover from executing → routing, attempt++ and excludes the IP', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('CORE_RETRIED_FAILOVER', { turn_id: 'T1', from_ip: 'widget-claude', attempt: 2, reason: 'error' }),
    ev('CORE_SELECTED_IP', { turn_id: 'T1', route: { ip_name: 'codex-1', reason: 'fallback' } }),
  ])
  assert.equal(v.turn?.phase, 'routing')
  assert.equal(v.turn?.attempt, 2)
  assert.equal(v.turn?.ip_name, 'codex-1')
  assert.deepEqual(v.turn?.excluded_ips, ['widget-claude'])
})

test('failover annotation while routing is a no-op', () => {
  const v = replay([
    CREATE, SEND, SELECT,
    ev('CORE_RETRIED_FAILOVER', { turn_id: 'T1', from_ip: 'widget-claude', attempt: 1, reason: 'x' }),
  ])
  assert.equal(v.turn?.phase, 'routing')
  assert.equal(v.turn?.attempt, 1)
  assert.deepEqual(v.turn?.excluded_ips, [])
})

test('rate limit excludes the IP but stays executing', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('TURN_FAILED_RATE_LIMIT', { turn_id: 'T1', ip_name: 'widget-claude', reason: '429' }),
  ])
  assert.equal(v.turn?.phase, 'executing')
  assert.deepEqual(v.turn?.excluded_ips, ['widget-claude'])
})

// -------------------- terminal phases --------------------

test('legacy TURN_COMPLETED(max_cycles) is shown as a failure', () => {
  let s = initialChatSession('s1')
  s = projectChatSession(s, ev('USER_SENT_MESSAGE', { turn_id: 't1', content: 'hi' }))
  s = projectChatSession(s, ev('CORE_SELECTED_IP', { turn_id: 't1', route: { ip_name: 'universe' } }))
  s = projectChatSession(s, ev('TURN_STARTED', { turn_id: 't1', ip_name: 'universe' }))
  s = projectChatSession(s, ev('TURN_COMPLETED', { turn_id: 't1', stop_reason: 'max_cycles' }))
  assert.equal(s.status, 'error')
  assert.equal(s.lastTurnTerminal?.phase, 'failed')
  assert.match(s.lastTurnTerminal?.error || '', /tool-cycle limit/)
})

test('TURN_FAILED → chat_session error, turn cleared', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('TURN_FAILED', { turn_id: 'T1', error: 'boom', attempts: 1 }, { ts: 1_700_000_123_456 }),
  ])
  assert.equal(v.status, 'error')
  assert.equal(v.turn, null)
  assert.equal(v.lastTurnTerminal?.error, 'boom')
  assert.equal(v.lastTurnTerminal?.failed_at, 1_700_000_123_456)
})

test('USER_CANCELLED_TURN → idle, turn cleared', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('USER_CANCELLED_TURN', { turn_id: 'T1' }),
  ])
  assert.equal(v.status, 'idle')
  assert.equal(v.turn, null)
})

// -------------------- annotations + second turn --------------------

test('annotation events do not change the view', () => {
  const base = replay([CREATE, SEND, SELECT, START])
  const after = [
    ev('TURN_RECORDED_USAGE', {
      turn_id: 'T1',
      usage: { model: 'm', tokens_in: 1, tokens_out: 2, cost_usd: 0 },
    }),
    ev('CORE_RAISED_ERROR', { scope: 'turn', message: 'noted' }),
  ].reduce(projectChatSession, base)
  assert.deepEqual(after.turn, base.turn)
  assert.equal(after.status, base.status)
})

test('a second send opens a fresh turn after the first completes', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('IP_COMPLETED_CYCLE', { turn_id: 'T1', message_id: 'a1', content: 'r1' }),
    ev('TURN_COMPLETED', { turn_id: 'T1', stop_reason: 'end_turn' }),
    ev('USER_SENT_MESSAGE', { turn_id: 'T2', message_id: 'm2', content: 'again', thinking_level: 'medium' }),
  ])
  assert.equal(v.status, 'running')
  assert.equal(v.turn?.turn_id, 'T2')
  assert.equal(v.turn?.phase, 'pending')
  assert.equal(v.messages.length, 3)
})

// -------------------- determinism + immutability --------------------

test('fold is pure: does not mutate the input state', () => {
  const before = initialChatSession('S')
  const after = projectChatSession(before, CREATE)
  assert.notEqual(after, before)
  assert.equal(before.status, null) // input untouched
  assert.equal(after.status, 'idle')
})

test('replaying the same sequence twice yields equal views', () => {
  const seq = [CREATE, SEND, SELECT, START, REQ, OPEN]
  assert.deepEqual(replay(seq), replay(seq))
})

// -------------------- branching: the turn tree (conversation-branching §5.4) --------------------

const COMPLETE_T1 = ev('TURN_COMPLETED', { turn_id: 'T1', stop_reason: 'end_turn' })

test('USER_SENT_MESSAGE records the turn in the tree (root → null parent)', () => {
  const v = replay([CREATE, SEND])
  assert.deepEqual(v.turns, {
    T1: { turn_id: 'T1', parent_turn_id: null, removed: false },
  })
})

test('a branch child records its parent_turn_id', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, COMPLETE_T1,
    ev('USER_SENT_MESSAGE', {
      turn_id: 'T2', message_id: 'm2', content: 'branch',
      thinking_level: 'medium', parent_turn_id: 'T1',
    }),
  ])
  assert.equal(v.turns.T1.parent_turn_id, null)
  assert.equal(v.turns.T2.parent_turn_id, 'T1') // fork edge
})

test('a fork: two children of one parent', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, COMPLETE_T1,
    ev('USER_SENT_MESSAGE', { turn_id: 'T2', message_id: 'm2', content: 'a', thinking_level: 'medium', parent_turn_id: 'T1' }),
    ev('CORE_SELECTED_IP', { turn_id: 'T2', route: { ip_name: 'widget-claude', reason: 'd' } }),
    ev('TURN_STARTED', { turn_id: 'T2', ip_name: 'widget-claude' }),
    ev('TURN_COMPLETED', { turn_id: 'T2', stop_reason: 'end_turn' }),
    ev('USER_SENT_MESSAGE', { turn_id: 'T3', message_id: 'm3', content: 'b', thinking_level: 'medium', parent_turn_id: 'T1' }),
  ])
  assert.equal(v.turns.T2.parent_turn_id, 'T1')
  assert.equal(v.turns.T3.parent_turn_id, 'T1') // both fork off T1
})

test('USER_REMOVED_TURN flags the turn removed (kept in the map, append-only)', () => {
  const v = replay([
    CREATE, SEND, SELECT, START, COMPLETE_T1,
    ev('USER_SENT_MESSAGE', { turn_id: 'T2', message_id: 'm2', content: 'branch', thinking_level: 'medium', parent_turn_id: 'T1' }),
    ev('USER_REMOVED_TURN', { turn_id: 'T1' }),
  ])
  assert.equal(v.turns.T1.removed, true)   // flagged, not deleted
  assert.equal(v.turns.T2.removed, false)  // the child's own flag is untouched
  assert.equal(v.turns.T1.parent_turn_id, null) // tree edges intact
})

test('USER_REMOVED_TURN for an unknown turn is a no-op', () => {
  const v = replay([CREATE, SEND, ev('USER_REMOVED_TURN', { turn_id: 'ghost' })])
  assert.deepEqual(Object.keys(v.turns), ['T1'])
})

// -------------------- native tool executions (turn-scoped) --------------------
// Observational, bound to their own payload turn_id. They never touch the
// current turn — the regression guard for "a stopped run's tool output leaks
// onto the next message".

test('native invoke + settle binds the call to its own turn_id', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('IP_INVOKED_NATIVE_TOOL', { turn_id: 'T1', tool_use_id: 'tu1', tool_name: 'Bash', input: { command: 'ls' } }),
    ev('IP_SETTLED_NATIVE_TOOL', { turn_id: 'T1', tool_use_id: 'tu1', ok: true }),
  ])
  assert.equal(v.nativeToolCalls.length, 1)
  assert.equal(v.nativeToolCalls[0].turn_id, 'T1')
  assert.equal(v.nativeToolCalls[0].ok, true)
})

test('native invoke for an unknown turn is ignored (mirrors Core guard)', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('IP_INVOKED_NATIVE_TOOL', { turn_id: 'ghost', tool_use_id: 'tu9', tool_name: 'Bash', input: {} }),
  ])
  assert.equal(v.nativeToolCalls.length, 0)
})

test('a stopped run’s late native settle stays on the OLD turn, never the new message', () => {
  const v = replay([
    CREATE, SEND, SELECT, START,
    ev('IP_INVOKED_NATIVE_TOOL', { turn_id: 'T1', tool_use_id: 'tu1', tool_name: 'Bash', input: { command: 'sleep 9' } }),
    ev('USER_CANCELLED_TURN', { turn_id: 'T1' }),
    // new message → new turn T2, executing
    ev('USER_SENT_MESSAGE', { turn_id: 'T2', message_id: 'm2', content: 'next', thinking_level: 'medium' }),
    ev('CORE_SELECTED_IP', { turn_id: 'T2', route: { ip_name: 'widget-claude', reason: 'd' } }),
    ev('TURN_STARTED', { turn_id: 'T2', ip_name: 'widget-claude' }),
    // T1’s tool settles LATE (synthesized interrupt / in-flight frame)
    ev('IP_SETTLED_NATIVE_TOOL', { turn_id: 'T1', tool_use_id: 'tu1', ok: false, error: 'interrupted by stop' }),
  ])
  // the current turn is T2, executing, untouched by the late settle
  assert.equal(v.turn?.turn_id, 'T2')
  assert.equal(v.turn?.phase, 'executing')
  assert.equal(v.status, 'running')
  // the settled call is still bound to T1 — a UI filtering by the displayed
  // turn_id will only show it under T1, never under T2’s message.
  const tu1 = v.nativeToolCalls.find((c) => c.tool_use_id === 'tu1')
  assert.equal(tu1?.turn_id, 'T1')
  assert.equal(tu1?.ok, false)
})


test('working directory change is projected for its turn', () => {
  let view = initialChatSession('S')
  view = projectChatSession(view, ev('CHAT_SESSION_CREATED', { title: 'x', workspace_dirs: ['/repo'] }))
  view = projectChatSession(view, ev('USER_SENT_MESSAGE', { turn_id: 'T1', message_id: 'M1', content: 'work' }))
  view = projectChatSession(view, ev('CHAT_SESSION_SET_WORKTREE', { worktree_path: '/repo/feature' }, { correlation_id: 'T1', ts: 42 }))
  assert.deepEqual(view.workingDirectoryChanges, [
    { worktree_path: '/repo/feature', turn_id: 'T1', ts: 42 },
  ])
})


test('ongoing is set by send, preserved by terminal events, and cleared only explicitly', () => {
  let state = initialChatSession('S')
  state = projectChatSession(state, ev('USER_SENT_MESSAGE', {
    turn_id: 't1', message_id: 'm1', content: 'hi', parent_turn_id: null,
  }))
  assert.equal(state.onGoing, true)

  state = projectChatSession(state, ev('TURN_COMPLETED', {
    turn_id: 't1', stop_reason: 'end_turn',
  }))
  assert.equal(state.onGoing, true)

  state = projectChatSession(state, ev('CHAT_SESSION_SET_ONGOING', { onGoing: false }))
  assert.equal(state.onGoing, false)
})

test('reused CLI IDs in different turns remain separate through replay and settlement', () => {
  const invoke = (turn_id: string) => ev('IP_INVOKED_NATIVE_TOOL', {
    turn_id, tool_use_id: 'item_1', tool_name: 'Bash', input: {},
  })
  const v = replay([
    CREATE, SEND, SELECT, START,
    invoke('T1'),
    ev('USER_SENT_MESSAGE', { turn_id: 'T2', message_id: 'm2', content: 'next', thinking_level: 'none' }),
    invoke('T2'), invoke('T1'),
    ev('IP_SETTLED_NATIVE_TOOL', { turn_id: 'T2', tool_use_id: 'item_1', ok: true, result: { content: 'two' } }),
  ])
  assert.equal(v.nativeToolCalls.length, 2)
  assert.equal(v.nativeToolCalls.find(c => c.turn_id === 'T1')?.ok, null)
  assert.equal(v.nativeToolCalls.find(c => c.turn_id === 'T2')?.ok, true)
})
