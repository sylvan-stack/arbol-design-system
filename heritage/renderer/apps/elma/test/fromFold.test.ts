// Unit tests for buildTreeFromView (src/chat/branching/fromFold.ts): rebuilding
// Elma's conversation tree from the shared fold, so a reload reconstructs the
// conversation from Core's log. Pure function — no bridge, no React.
//
// Run via `node renderer/apps/elma/test/run.mjs` (esbuild bundles this + the pure
// constants.ts; the `@arbol/events` type imports are erased).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTreeFromView } from '../src/chat/branching/fromFold'
import { TREE } from '../src/chat/branching/tree'
import { assistantBlocks, parseMarkdown } from '../src/constants'

type TurnSpec = { id: string; parent: string | null; removed?: boolean }
type MsgSpec = { turn: string; role: 'user' | 'assistant'; content: string }

function mkView(opts: {
  turns: TurnSpec[]
  messages?: MsgSpec[]
  status?: string
  inFlight?: string | null
  streaming?: string
}): any {
  const turns: Record<string, any> = {}
  for (const t of opts.turns) {
    turns[t.id] = { turn_id: t.id, parent_turn_id: t.parent, removed: !!t.removed }
  }
  const messages = (opts.messages ?? []).map((m, i) => ({
    id: `m${i}`,
    role: m.role,
    content: m.content,
    turn_id: m.turn,
    ts: (i + 1) * 10,
  }))
  const turn = opts.inFlight
    ? { turn_id: opts.inFlight, phase: 'executing', ip_name: null, attempt: 1,
        excluded_ips: [], batches: [], cycles: 0, stop_reason: null, error: null }
    : null
  return {
    view: { session_id: 'S', status: opts.status ?? 'idle', title: '', turn,
            toolRequests: {}, messages, turns },
    streaming: { text: opts.streaming ?? '', thinking: '' },
  }
}

const text = (blocks: any[]) => blocks.map((b) => b.v).join('\n')

test('linear conversation: root → child, with content', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }, { id: 'A', parent: 'r' }],
    messages: [
      { turn: 'r', role: 'user', content: 'first' },
      { turn: 'r', role: 'assistant', content: 'reply one' },
      { turn: 'A', role: 'user', content: 'second' },
      { turn: 'A', role: 'assistant', content: 'reply two' },
    ],
  })
  const { nodes, rootId } = buildTreeFromView(view, streaming)
  assert.equal(rootId, 'r')
  assert.equal(nodes.r.parentId, null)
  assert.deepEqual(nodes.r.children, ['A'])
  assert.equal(nodes.r.message, 'first')
  assert.ok(text(nodes.r.answer).includes('reply one'))
  assert.equal(nodes.A.parentId, 'r')
  assert.equal(nodes.A.message, 'second')
  assert.ok(text(nodes.A.answer).includes('reply two'))
})

test('a fork: two children of one parent, in send order', () => {
  const { view, streaming } = mkView({
    turns: [
      { id: 'r', parent: null },
      { id: 'A', parent: 'r' },
      { id: 'B', parent: 'r' },
    ],
    messages: [{ turn: 'r', role: 'user', content: 'q' }],
  })
  const { nodes } = buildTreeFromView(view, streaming)
  assert.deepEqual(nodes.r.children, ['A', 'B']) // fork, ordered
  assert.equal(nodes.A.parentId, 'r')
  assert.equal(nodes.B.parentId, 'r')
})

test('removed turn + its subtree are hidden', () => {
  const { view, streaming } = mkView({
    turns: [
      { id: 'r', parent: null },
      { id: 'A', parent: 'r', removed: true },
      { id: 'C', parent: 'A' }, // descendant of removed A → also hidden
      { id: 'B', parent: 'r' }, // sibling survives
    ],
    messages: [{ turn: 'r', role: 'user', content: 'q' }],
  })
  const { nodes, rootId } = buildTreeFromView(view, streaming)
  assert.equal(rootId, 'r')
  assert.deepEqual(Object.keys(nodes).sort(), ['B', 'r'])
  assert.deepEqual(nodes.r.children, ['B']) // A (and C) pruned
})

test('in-flight turn: responding (respondedAt null) + live overlay in the answer', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }],
    messages: [{ turn: 'r', role: 'user', content: 'q' }],
    status: 'running',
    inFlight: 'r',
    streaming: 'streaming so far…',
  })
  const { nodes } = buildTreeFromView(view, streaming)
  assert.equal(nodes.r.respondedAt, null) // still responding
  assert.ok(text(nodes.r.answer).includes('streaming so far…'))
})

test('completed turns are settled (respondedAt non-null)', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }],
    messages: [
      { turn: 'r', role: 'user', content: 'q' },
      { turn: 'r', role: 'assistant', content: 'a' },
    ],
    status: 'idle',
  })
  const { nodes } = buildTreeFromView(view, streaming)
  assert.notEqual(nodes.r.respondedAt, null)
})

test('empty view → empty tree', () => {
  const { view, streaming } = mkView({ turns: [] })
  const { nodes, rootId } = buildTreeFromView(view, streaming)
  assert.equal(rootId, null)
  assert.deepEqual(nodes, {})
})

test('multiple assistant cycles for a turn are joined', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }],
    messages: [
      { turn: 'r', role: 'user', content: 'q' },
      { turn: 'r', role: 'assistant', content: 'first' },
      { turn: 'r', role: 'assistant', content: 'second' },
    ],
  })
  const { nodes } = buildTreeFromView(view, streaming)
  const t = text(nodes.r.answer)
  assert.ok(t.includes('first') && t.includes('second'))
})


test('GFM pipe tables are parsed as structured table blocks', () => {
  const blocks = parseMarkdown(`Think of it like this:

| Option | What it does | When to use |
|---|---|---|
| **Safe Rebuild and Restart** | Rebuilds normally | Use this first |
| **Force Rebuild and Restart** | Clears cached state | Use if safe rebuild fails |

A practical analogy:`)
  assert.equal(blocks[0].t, 'p')
  const table = blocks.find((b: any) => b.t === 'table') as any
  assert.ok(table)
  assert.deepEqual(table.header, ['Option', 'What it does', 'When to use'])
  assert.deepEqual(table.rows[0], ['**Safe Rebuild and Restart**', 'Rebuilds normally', 'Use this first'])
  assert.equal(blocks.at(-1)?.t, 'p')
})


test('GFM pipe tables support escaped pipes inside cells', () => {
  const blocks = parseMarkdown(`| Name | Meaning |
|---|---|
| A \\| B | Literal pipe in first cell |`)
  const table = blocks.find((b: any) => b.t === 'table') as any
  assert.ok(table)
  assert.deepEqual(table.header, ['Name', 'Meaning'])
  assert.deepEqual(table.rows, [['A | B', 'Literal pipe in first cell']])
})

test('GFM pipe tables support optional outer pipes and alignment separators', () => {
  const blocks = parseMarkdown(`Name | Meaning | Notes
:--- | :---: | ---:
Safe | Normal rebuild | First choice
Force | Clean rebuild | Last resort`)
  const table = blocks.find((b: any) => b.t === 'table') as any
  assert.ok(table)
  assert.deepEqual(table.header, ['Name', 'Meaning', 'Notes'])
  assert.deepEqual(table.rows[0], ['Safe', 'Normal rebuild', 'First choice'])
  assert.deepEqual(table.rows[1], ['Force', 'Clean rebuild', 'Last resort'])
})

test('GFM pipe table rows are normalized to header width', () => {
  const blocks = parseMarkdown(`| A | B | C |
|---|---|---|
| one | two |
| one | two | three | extra |`)
  const table = blocks.find((b: any) => b.t === 'table') as any
  assert.ok(table)
  assert.deepEqual(table.rows[0], ['one', 'two', ''])
  assert.deepEqual(table.rows[1], ['one', 'two', 'three'])
})

test('pipe-delimited prose is not parsed as a table without a separator row', () => {
  const blocks = parseMarkdown(`This paragraph mentions A | B | C.
But the next line is not a table separator.`)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].t, 'p')
  assert.equal((blocks[0] as any).v, 'This paragraph mentions A | B | C. But the next line is not a table separator.')
})

test('fast first-paint: latest turn whose parent is not loaded renders without crashing', () => {
  // The two-phase fold paints ONLY the latest turn first; its real parent lives
  // earlier in the not-yet-loaded log. buildTreeFromView makes that turn a
  // standin root, but the node keeps its real parentId. siblings() must treat the
  // absent parent as "no visible parent" instead of dereferencing it — the bug
  // behind "Elma failed to start: undefined is not an object (e[n.parentId].children)".
  const { view, streaming } = mkView({
    turns: [{ id: 'latest', parent: 'earlier-unloaded' }],
    messages: [
      { turn: 'latest', role: 'user', content: 'last prompt' },
      { turn: 'latest', role: 'assistant', content: 'last reply' },
    ],
  })
  const { nodes, rootId } = buildTreeFromView(view, streaming)
  // The orphaned-parent turn stands in as the root, but keeps its real parentId.
  assert.equal(rootId, 'latest')
  assert.equal(nodes.latest.parentId, 'earlier-unloaded')
  // The render path computes siblings(current) every render — this must not throw.
  assert.deepEqual(TREE.siblings(nodes, rootId, 'latest'), ['latest'])
})


test('request events alone do not masquerade as native tool calls', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }],
    messages: [
      { turn: 'r', role: 'user', content: 'run it' },
      { turn: 'r', role: 'assistant', content: 'done' },
    ],
  })
  view.toolRequestParams = { 'native-bash': { command: 'echo 42' } }
  view.toolRequestOpenedAt = { 'native-bash': 15 }
  view.toolResults = [{
    request_id: 'native-bash', turn_id: 'r', kind: 'bash',
    opened_ts: 15, ok: true, result: { stdout: '42\n' }, ts: 18,
  }]
  const { nodes } = buildTreeFromView(view, streaming)
  assert.equal(nodes.r.answer.some((b: any) => b.t === 'arbol'), false)
  assert.equal(nodes.r.answer.some((b: any) => b.t === 'native'), false)
})


test('native execution events use the compact native design', () => {
  const { view, streaming } = mkView({
    turns: [{ id: 'r', parent: null }],
    messages: [
      { turn: 'r', role: 'user', content: 'run it' },
      { turn: 'r', role: 'assistant', content: 'done' },
    ],
  })
  view.nativeToolCalls = [{
    tool_use_id: 'call-1', turn_id: 'r', tool_name: 'Bash',
    input: { id: 'native-bash', kind: 'bash', command: 'echo 42', path: null, content: null },
    ok: true, result: { content: '42\n' }, invoked_ts: 15, settled_ts: 18, seq: 3,
  }]
  const { nodes } = buildTreeFromView(view, streaming)
  const native = nodes.r.answer.filter((b: any) => b.t === 'native') as any[]
  assert.equal(native.length, 1)
  assert.equal(native[0].call.tool_use_id, 'call-1')
  assert.equal(native[0].call.tool_name, 'Bash')
  assert.equal(nodes.r.answer.some((b: any) => b.t === 'arbol'), false)
})



test('live thinking stays before a later durable native tool call', () => {
  const blocks = assistantBlocks(
    [{ thinking: 'Inspecting the repository', ts: 100 }],
    [],
    [],
    [{
      tool_use_id: 'call-after-thinking', turn_id: 'r', tool_name: 'Bash',
      input: { command: 'git status' }, ok: null, invoked_ts: 200, seq: 20,
    }],
  )
  assert.deepEqual(blocks.map((b: any) => b.t), ['thinking', 'native'])
})


test('live thinking after a durable native tool call stays after it', () => {
  const blocks = assistantBlocks(
    [{ thinking: 'Reviewing the output', ts: 300 }],
    [],
    [],
    [{
      tool_use_id: 'call-before-thinking', turn_id: 'r', tool_name: 'Read',
      input: { file_path: '/tmp/a' }, ok: true, invoked_ts: 200, seq: 20,
    }],
  )
  assert.deepEqual(blocks.map((b: any) => b.t), ['native', 'thinking'])
})


test('durable cycles and native tools still use sequence order when timestamps tie', () => {
  const blocks = assistantBlocks(
    [
      { thinking: 'Before', ts: 100, seq: 10 },
      { thinking: 'After', ts: 100, seq: 30 },
    ],
    [],
    [],
    [{
      tool_use_id: 'call-middle', turn_id: 'r', tool_name: 'List',
      input: { path: '/tmp' }, ok: true, invoked_ts: 100, seq: 20,
    }],
  )
  assert.deepEqual(
    blocks.map((b: any) => b.t === 'thinking' ? b.v : b.call.tool_use_id),
    ['Before', 'call-middle', 'After'],
  )
})



test('durable event order keeps tool calls before the final answer despite timestamp skew', () => {
  const blocks = assistantBlocks(
    [{ content: 'The final answer.', ts: 100, seq: 30 }],
    [],
    [],
    [{
      tool_use_id: 'call-before-answer', turn_id: 'r', tool_name: 'Read',
      input: { file_path: '/tmp/a' }, ok: true, invoked_ts: 200, seq: 20,
    }],
  )
  assert.deepEqual(
    blocks.map((b: any) => b.t === 'native' ? b.call.tool_use_id : b.v),
    ['call-before-answer', 'The final answer.'],
  )
})


test('legacy unsequenced cycles do not disable canonical ordering for durable tool and answer items', () => {
  const blocks = assistantBlocks(
    [
      { thinking: 'Legacy reasoning', ts: 50 },
      { content: 'The final answer.', ts: 100, seq: 30 },
    ],
    [],
    [],
    [{
      tool_use_id: 'call-before-answer', turn_id: 'r', tool_name: 'Read',
      input: { file_path: '/tmp/a' }, ok: true, invoked_ts: 200, seq: 20,
    }],
  )
  assert.deepEqual(
    blocks.map((b: any) => b.t === 'native' ? b.call.tool_use_id : b.v),
    ['Legacy reasoning', 'call-before-answer', 'The final answer.'],
  )
})
