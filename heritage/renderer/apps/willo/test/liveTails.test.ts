// Unit tests for the live agent-response tails (liveTails.ts): the pure tail
// helpers plus openLiveTails' subscription fan-out / accumulation / reconnect
// behavior against the design-system stub (aliased by run-live-tails.mjs).

import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'

import { appendTail, beginGenerationActivity, formatGenerationSpeed, generationIsStale, generationSpeeds, openLiveTails, recordGeneratedChunk, textChunkFromLiveEvent, usageFromLiveEvent, TAIL_MAX_CHARS } from '../src/liveTails'
import { subs, fireReconnect, reset } from './designSystemStub'

const frame = (event: string, data: Record<string, unknown>) => ({ sub_id: 's', event, data })

beforeEach((t) => {
  reset()
  t.mock.timers.enable({ apis: ['setInterval'] })
})

test('appendTail collapses whitespace and keeps only the newest chars', () => {
  assert.equal(appendTail('', 'hello\n\n  world\t!'), 'hello world !')
  assert.equal(appendTail('abc', 'def'), 'abcdef')
  const long = appendTail('x'.repeat(TAIL_MAX_CHARS), 'TAIL')
  assert.equal(long.length, TAIL_MAX_CHARS)
  assert.ok(long.endsWith('TAIL'))
  assert.equal(appendTail('', '   '), '')
})

test('textChunkFromLiveEvent extracts text-bearing frames only', () => {
  assert.equal(textChunkFromLiveEvent(frame('assistant.text_delta', { text: 'hi' })), 'hi')
  assert.equal(textChunkFromLiveEvent(frame('assistant.thinking_delta', { thinking: 'hm' })), 'hm')
  assert.equal(textChunkFromLiveEvent(frame('IP_COMPLETED_CYCLE', { content: 'done' })), '')
  assert.equal(textChunkFromLiveEvent(frame('assistant.text_delta', {})), '')
  assert.equal(textChunkFromLiveEvent(frame('TURN_STARTED', { text: 'nope' })), '')
})

test('usageFromLiveEvent extracts cumulative live token usage', () => {
  assert.deepEqual(
    usageFromLiveEvent(frame('usage.tick', { partial: { model: 'gpt', tokens_in: 1200, tokens_out: 34, cost_usd: 0.2 } })),
    { model: 'gpt', tokens_in: 1200, tokens_out: 34, cost_usd: 0.2 },
  )
  assert.equal(usageFromLiveEvent(frame('assistant.text_delta', { text: 'hi' })), null)
  assert.equal(usageFromLiveEvent(frame('usage.tick', { partial: null })), null)
})

test('openLiveTails reports usage ticks without changing the text tail', () => {
  const seen: Array<[string, unknown]> = []
  openLiveTails(['a'], (id, update) => seen.push([id, update.usage || update.tail]))
  subs[0].handler(frame('assistant.text_delta', { text: 'Hello' }))
  subs[0].handler(frame('usage.tick', { partial: { tokens_in: 71_000, tokens_out: 52_000 } }))
  assert.deepEqual(seen, [
    ['a', 'Hello'],
    ['a', { tokens_in: 71_000, tokens_out: 52_000 }],
  ])
})

test('openLiveTails reports projected terminal snapshots', () => {
  const seen: Array<[string, boolean | undefined]> = []
  openLiveTails(['a'], (id, update) => seen.push([id, update.terminal]))
  subs[0].handler(frame('chat_session.render_snapshot', { view: { status: 'running' } }))
  subs[0].handler(frame('chat_session.render_snapshot', { view: { status: 'idle' } }))
  subs[0].handler(frame('chat_session.render_snapshot', { view: { status: 'error' } }))
  assert.deepEqual(seen, [['a', false], ['a', true], ['a', true]])
})

test('openLiveTails subscribes per session on chat_session.render', () => {
  const close = openLiveTails(['a', 'b'], () => {})
  assert.equal(subs.length, 2)
  assert.deepEqual(subs.map((s) => s.stream), ['chat_session.render', 'chat_session.render'])
  assert.deepEqual(subs.map((s) => s.params), [{ chat_session_id: 'a' }, { chat_session_id: 'b' }])
  close()
  assert.ok(subs.every((s) => s.closed))
})

test('openLiveTails accumulates chunks per session and ignores non-overlay frames', () => {
  const seen: Array<[string, string]> = []
  openLiveTails(['a', 'b'], (id, update) => {
    if (update.tail) seen.push([id, update.tail])
  })
  subs[0].handler(frame('assistant.text_delta', { text: 'Hel' }))
  subs[0].handler(frame('TURN_STARTED', {}))
  subs[0].handler(frame('assistant.text_delta', { text: 'lo' }))
  subs[1].handler(frame('assistant.thinking_delta', { thinking: 'plan…' }))
  assert.deepEqual(seen, [['a', 'Hel'], ['a', 'Hello'], ['b', 'plan…']])
})

test('openLiveTails re-opens its subscriptions on core reconnect and keeps the tail', () => {
  const seen: Array<[string, string]> = []
  const close = openLiveTails(['a'], (id, update) => {
    if (update.tail) seen.push([id, update.tail])
  })
  subs[0].handler(frame('assistant.text_delta', { text: 'before ' }))
  fireReconnect()
  assert.equal(subs.length, 2)
  assert.ok(subs[0].closed, 'old subscription is closed on reconnect')
  subs[1].handler(frame('assistant.text_delta', { text: 'after' }))
  assert.deepEqual(seen, [['a', 'before '], ['a', 'before after']])
  close()
  assert.ok(subs[1].closed)
  subs[1].handler(frame('assistant.text_delta', { text: 'late' }))
  assert.equal(seen.length, 2, 'no callbacks after close')
})


test('generationSpeeds calculates rolling 1m and 5m estimated token rates', () => {
  let activity = beginGenerationActivity(0)
  activity = recordGeneratedChunk(activity, 'x'.repeat(60), 10_000)
  activity = recordGeneratedChunk(activity, 'y'.repeat(120), 70_000)

  const speed = generationSpeeds(activity, 80_000)
  assert.equal(speed.oneMinute, 30, '120 chars / 4 inside the last minute')
  assert.equal(speed.fiveMinutes, 33.75, '45 estimated tokens over the observed 80s')
  assert.equal(generationIsStale(speed), false)
})

test('generation speed decays to zero and marks a quiet running session stale', () => {
  let activity = beginGenerationActivity(0)
  activity = recordGeneratedChunk(activity, 'hello', 1_000)
  const speed = generationSpeeds(activity, 5 * 60_000 + 1_001)
  assert.deepEqual(speed, { oneMinute: 0, fiveMinutes: 0 })
  assert.equal(generationIsStale(speed), true)
})

test('generation speed starts at zero and formats compactly', () => {
  assert.deepEqual(generationSpeeds(beginGenerationActivity(10_000), 10_000), { oneMinute: 0, fiveMinutes: 0 })
  assert.equal(formatGenerationSpeed(0), '0')
  assert.equal(formatGenerationSpeed(0.4), '1')
  assert.equal(formatGenerationSpeed(4.25), '4')
  assert.equal(formatGenerationSpeed(15.6), '16')
})


test('projection changes request a status refresh without a terminal snapshot', () => {
  const seen: string[] = []
  const close = openLiveTails(['a'], (id, update) => {
    if (update.refresh) seen.push(id)
  })
  subs[0].handler(frame('chat_session.render_changed', {}))
  assert.deepEqual(seen, ['a'])
  close()
})

test('quiet running sessions reconcile projection lag without focus or more frames', (t) => {
  let projectedStatus = 'running'
  let displayedStatus = 'running'
  let sounds = 0
  const close = openLiveTails(['a'], (_id, update) => {
    if (!update.refresh) return
    if (displayedStatus === 'running' && projectedStatus === 'idle') sounds++
    displayedStatus = projectedStatus
  })
  // The terminal signal races the asynchronous read projection.
  subs[0].handler(frame('chat_session.render_snapshot', { view: { status: 'running' } }))
  projectedStatus = 'idle'
  t.mock.timers.tick(1_000)
  assert.equal(displayedStatus, 'idle')
  assert.equal(sounds, 1)
  t.mock.timers.tick(1_000)
  assert.equal(sounds, 1)
  close()
  projectedStatus = 'running'
  t.mock.timers.tick(1_000)
  assert.equal(displayedStatus, 'idle', 'cleanup stops reconciliation')
})
