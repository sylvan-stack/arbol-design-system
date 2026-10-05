// Unit tests for the station-search pure core (stationSearch.ts): match
// indexing, snippets, highlight splitting, the message→turn map, and hit
// building with per-turn role occurrence coordinates (Elma's highlight
// target). Run via `node renderer/apps/willo/test/run-station-search.mjs`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSearchHits,
  findMatchIndexes,
  groupSearchHits,
  makeSnippet,
  messageTurnMapFromMessages,
  splitHighlight,
  MAX_SEARCH_HITS,
  type SearchRow,
} from '../src/stationSearch'

const session = (id: string, title = 'Chat') => ({ id, title, workspace_dirs: ['/Users/x/repo/Arbol'] })
const detail = (id: string, messages: Array<{ id: string; role: string; content: string; seq?: number; turn_id?: string }>) =>
  ({ id, messages }) as SearchRow['detail']

test('findMatchIndexes: case-insensitive, non-overlapping, empty query → none', () => {
  assert.deepEqual(findMatchIndexes('Foo foo FOO', 'foo'), [0, 4, 8])
  assert.deepEqual(findMatchIndexes('aaaa', 'aa'), [0, 2])
  assert.deepEqual(findMatchIndexes('anything', '   '), [])
})

test('makeSnippet clips around the match and tracks the in-snippet offset', () => {
  const text = 'x'.repeat(100) + 'NEEDLE' + 'y'.repeat(100)
  const snip = makeSnippet(text, 100, 6)
  assert.ok(snip.snippet.startsWith('…') && snip.snippet.endsWith('…'))
  assert.equal(snip.snippet.slice(snip.matchStart, snip.matchStart + 6), 'NEEDLE')
  const short = makeSnippet('hello world', 6, 5)
  assert.equal(short.snippet, 'hello world')
  assert.equal(short.matchStart, 6)
})

test('splitHighlight splits around the match; no match → all before', () => {
  assert.deepEqual(splitHighlight('say hello there', 'hello', 4), { before: 'say ', match: 'hello', after: ' there' })
  assert.deepEqual(splitHighlight('no match', 'zzz'), { before: 'no match', match: '', after: '' })
})

test('messageTurnMapFromMessages reads message coordinates from materialized rows', () => {
  const rows: SearchRow[] = [{
    session: session('S1'),
    detail: detail('S1', [
      { id: 'm1', role: 'user', content: 'one', turn_id: 'T1' },
      { id: 'm2', role: 'assistant', content: 'two', turn_id: 'T2' },
      { id: 'm3', role: 'assistant', content: 'three' },
    ]),
  }]
  assert.deepEqual(messageTurnMapFromMessages(rows), { m1: 'T1', m2: 'T2' })
})

test('buildSearchHits: per-turn role occurrence indexes + transcript order', () => {
  const rows: SearchRow[] = [{
    session: session('S1', 'Alpha'),
    detail: detail('S1', [
      { id: 'm2', role: 'assistant', content: 'foo then foo again', seq: 2 },
      { id: 'm1', role: 'user', content: 'find foo please', seq: 1 },
      { id: 'm3', role: 'assistant', content: 'no match here', seq: 3 },
    ]),
  }]
  const hits = buildSearchHits(rows, 'foo', { m1: 'T1', m2: 'T1' })
  assert.equal(hits.length, 3)
  // seq order: the user message (m1) comes first despite array order
  assert.deepEqual(hits.map((h) => h.messageId), ['m1', 'm2', 'm2'])
  assert.deepEqual(hits.map((h) => h.role), ['user', 'assistant', 'assistant'])
  // occurrenceIndex counts per (turn, role): assistant matches are 0 and 1
  assert.deepEqual(hits.map((h) => h.occurrenceIndex), [0, 0, 1])
  assert.deepEqual(hits.map((h) => h.turnId), ['T1', 'T1', 'T1'])
  assert.equal(hits[0].repo, 'Arbol')
  assert.equal(hits[0].sessionTitle, 'Alpha')
  assert.ok(hits.every((h, i) => h.absoluteIndex === i))
})

test('buildSearchHits: unknown turn buckets fall back per message+role', () => {
  const rows: SearchRow[] = [{
    session: session('S1'),
    detail: detail('S1', [
      { id: 'a', role: 'assistant', content: 'foo', seq: 1 },
      { id: 'b', role: 'assistant', content: 'foo', seq: 2 },
    ]),
  }]
  const hits = buildSearchHits(rows, 'foo', {})
  // Separate fallback buckets → each message restarts its occurrence count.
  assert.deepEqual(hits.map((h) => h.occurrenceIndex), [0, 0])
  assert.deepEqual(hits.map((h) => h.turnId), [undefined, undefined])
})

test('buildSearchHits caps at MAX_SEARCH_HITS and handles null details', () => {
  const content = Array.from({ length: MAX_SEARCH_HITS + 50 }, () => 'foo').join(' ')
  const rows: SearchRow[] = [
    { session: session('S1'), detail: detail('S1', [{ id: 'm', role: 'user', content, seq: 1 }]) },
    { session: session('S2'), detail: null },
  ]
  const hits = buildSearchHits(rows, 'foo', {})
  assert.equal(hits.length, MAX_SEARCH_HITS)
  assert.deepEqual(buildSearchHits(rows, '', {}), [])
})


test('groupSearchHits groups same-titled chats by stable session identity', () => {
  const rows: SearchRow[] = [
    { session: session('session-alpha', 'Chat'), detail: detail('session-alpha', [{ id: 'a', role: 'user', content: 'foo foo' }]) },
    { session: session('session-beta', 'Chat'), detail: detail('session-beta', [{ id: 'b', role: 'assistant', content: 'foo' }]) },
  ]
  const groups = groupSearchHits(buildSearchHits(rows, 'foo', {}))
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((group) => group.sessionId), ['session-alpha', 'session-beta'])
  assert.deepEqual(groups.map((group) => group.sessionTitle), ['Chat', 'Chat'])
  assert.deepEqual(groups.map((group) => group.hits.length), [2, 1])
  assert.ok(groups[0].hits.every((hit) => hit.sessionId === 'session-alpha'))
  assert.ok(groups[1].hits.every((hit) => hit.sessionId === 'session-beta'))
})
