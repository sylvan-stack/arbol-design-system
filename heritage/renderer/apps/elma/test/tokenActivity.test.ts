import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decayTokenRate,
  smoothTokenRate,
  tokenActivityLevel,
  TOKEN_RATE_DECAY_MS,
  TOKEN_RATE_IDLE_GRACE_MS,
  TokenRateMeter,
} from '../src/nav/tokenActivity'

test('input and output rates use separate activity bands', () => {
  assert.equal(tokenActivityLevel(0, 'input'), 0)
  assert.equal(tokenActivityLevel(1, 'input'), 1)
  assert.equal(tokenActivityLevel(249, 'input'), 1)
  assert.equal(tokenActivityLevel(250, 'input'), 2)
  assert.equal(tokenActivityLevel(999, 'input'), 2)
  assert.equal(tokenActivityLevel(1_000, 'input'), 3)

  assert.equal(tokenActivityLevel(1, 'output'), 1)
  assert.equal(tokenActivityLevel(24.9, 'output'), 1)
  assert.equal(tokenActivityLevel(25, 'output'), 2)
  assert.equal(tokenActivityLevel(79.9, 'output'), 2)
  assert.equal(tokenActivityLevel(80, 'output'), 3)
})

test('token deltas become a smoothed tokens-per-second rate', () => {
  const first = smoothTokenRate(0, 100, 1_000)
  assert.ok(first > 40 && first < 50)

  const next = smoothTokenRate(first, 200, 1_000)
  assert.ok(next > first)
  assert.ok(next < 200)
  assert.equal(smoothTokenRate(next, 0, 1_000), next)
})

test('a stale rate holds briefly and then decays to zero', () => {
  assert.equal(decayTokenRate(100, TOKEN_RATE_IDLE_GRACE_MS), 100)
  assert.equal(decayTokenRate(100, TOKEN_RATE_IDLE_GRACE_MS + TOKEN_RATE_DECAY_MS / 2), 50)
  assert.equal(decayTokenRate(100, TOKEN_RATE_IDLE_GRACE_MS + TOKEN_RATE_DECAY_MS), 0)
  assert.equal(decayTokenRate(100, TOKEN_RATE_IDLE_GRACE_MS + TOKEN_RATE_DECAY_MS + 1), 0)
})

test('invalid or negative flow is inactive', () => {
  assert.equal(tokenActivityLevel(-1, 'output'), 0)
  assert.equal(tokenActivityLevel(Number.NaN, 'input'), 0)
  assert.equal(decayTokenRate(Number.NaN, 1_000), 0)
})


test('rate meter ignores duplicate renders without moving its sample baseline', () => {
  const meter = new TokenRateMeter()
  assert.deepEqual(meter.sample(1_000, 1_000), { rate: 0, measuredAt: 0 })
  assert.deepEqual(meter.sample(1_000, 1_900), { rate: 0, measuredAt: 0 })

  const observed = meter.sample(1_100, 2_000)
  // The 100-token delta spans the full second since the real sample, rather
  // than the 100ms since an unrelated duplicate render.
  assert.ok(observed.rate > 40 && observed.rate < 50)
  assert.equal(observed.measuredAt, 2_000)

  assert.deepEqual(meter.sample(1_100, 2_100), observed)
})

test('rate meter reports successive cumulative token increases', () => {
  const meter = new TokenRateMeter()
  meter.sample(0, 1_000)
  const first = meter.sample(80, 2_000)
  assert.ok(first.rate > 0)

  const second = meter.sample(160, 3_000)
  assert.ok(second.rate >= first.rate)
  assert.equal(second.measuredAt, 3_000)
})
