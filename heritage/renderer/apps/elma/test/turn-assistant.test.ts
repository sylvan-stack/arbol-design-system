import assert from 'node:assert/strict'
import test from 'node:test'
import { turnAssistantCycles } from '../src/app/helpers'

test('a rolling transcript keeps the new answer when older assistant messages are evicted', () => {
  const message = (turn_id: string, content: string, seq: number) => ({
    role: 'assistant', turn_id, content, seq, ts: seq,
  })
  const before = Array.from({ length: 50 }, (_, i) => message('old', `old ${i}`, i))
  const after = [...before.slice(5),
    message('active', 'Checking the code.', 60),
    message('active', 'The final answer.', 70),
  ]
  assert.ok(after.length < before.length)
  const cycles = turnAssistantCycles(after, 'active')
  assert.deepEqual(cycles.map((cycle) => cycle.content), ['Checking the code.', 'The final answer.'])
  assert.equal(cycles[1].seq, 70)
  // Loading older history also cannot introduce another turn's prose.
  assert.deepEqual(turnAssistantCycles([...before, ...after], 'active'), cycles)
})

test('pending submission identity and other roles cannot supply an answer', () => {
  const messages = [
    { role: 'assistant', turn_id: 'previous', content: 'Previous answer' },
    { role: 'user', turn_id: 'active', content: 'Question' },
  ]
  assert.deepEqual(turnAssistantCycles(messages, ''), [])
  assert.deepEqual(turnAssistantCycles(messages, 'active'), [])
})
