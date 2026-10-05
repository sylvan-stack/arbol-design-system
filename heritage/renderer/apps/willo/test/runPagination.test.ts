import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginateRunEvents, type RunEvent } from '../src/runPagination'

const ev = (id: string, role: RunEvent['role'], lines: number): RunEvent => ({
  id, role, kind: role, text: Array.from({ length: lines }, () => 'line').join('\n'),
})

test('pagination breaks only before a user message and keeps responses whole', () => {
  const pages = paginateRunEvents([
    ev('u1', 'user', 3), ev('a1', 'assistant', 8), ev('tool', 'system', 3),
    ev('u2', 'user', 3), ev('a2', 'assistant', 20), ev('u3', 'user', 3), ev('a3', 'assistant', 2),
  ], 18)
  assert.deepEqual(pages.map((p) => p.map((e) => e.id)), [
    ['u1', 'a1', 'tool'], ['u2', 'a2'], ['u3', 'a3'],
  ])
})

test('an oversized response is never split', () => {
  const pages = paginateRunEvents([ev('u', 'user', 1), ev('a', 'assistant', 200)], 10)
  assert.deepEqual(pages.map((p) => p.map((e) => e.id)), [['u', 'a']])
})
