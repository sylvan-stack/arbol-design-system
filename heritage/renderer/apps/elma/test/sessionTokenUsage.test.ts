import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcileRecordedTokenUsage, withLiveTokenUsage } from '../src/nav/sessionTokenUsage'

test('live Turn usage makes token metrics visible before a durable usage row exists', () => {
  assert.deepEqual(withLiveTokenUsage(null, {
    model: 'test-model', tokens_in: 120, tokens_out: 24, cost_usd: 0.01,
  }), {
    model: 'test-model', tokens_in: 120, tokens_out: 24, cost_usd: 0.01, ts: undefined,
  })
})

test('live cumulative Turn usage is added to completed session totals', () => {
  assert.deepEqual(withLiveTokenUsage(
    { model: 'old', tokens_in: 1_000, tokens_out: 200, cost_usd: 1, ts: 10 },
    { model: 'new', tokens_in: 100, tokens_out: 20, cost_usd: 0.2 },
  ), {
    model: 'new', tokens_in: 1_100, tokens_out: 220, cost_usd: 1.2, ts: 10,
  })
})

test('an empty or stale terminal read cannot erase usage observed live', () => {
  const observed = { model: 'model', tokens_in: 120, tokens_out: 24, cost_usd: 0.01 }
  assert.deepEqual(reconcileRecordedTokenUsage(observed, null), observed)
  assert.deepEqual(reconcileRecordedTokenUsage(observed, {
    model: 'model', tokens_in: 80, tokens_out: 10, cost_usd: 0.005,
  }), { ...observed, ts: undefined })
})

test('a caught-up durable usage total replaces lower observed totals', () => {
  assert.deepEqual(reconcileRecordedTokenUsage(
    { tokens_in: 120, tokens_out: 24, cost_usd: 0.01 },
    { model: 'model', tokens_in: 1_120, tokens_out: 224, cost_usd: 1.01, ts: 20 },
  ), {
    model: 'model', tokens_in: 1_120, tokens_out: 224, cost_usd: 1.01, ts: 20,
  })
})
