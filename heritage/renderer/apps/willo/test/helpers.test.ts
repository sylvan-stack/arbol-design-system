// Unit tests for willo pure helpers — currently the compact-mode activity
// grouping (buckets + inter-group spacing). Run via
// `node renderer/apps/willo/test/run-helpers.mjs`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compactActivityGroup, compactActivityGroupSpacingPx, COMPACT_ACTIVITY_GROUP_GAP_PX, formatTokenCount, usageSummary, withLiveUsage, fmtAgentInactivity, fmtAgentStaleDuration, agentActivityIsStale, sessionFailureCue, sessionFailureTitle } from '../src/helpers'

const NOW = 1_800_000_000_000
const MIN = 60_000
const HOUR = 60 * MIN

test('compactActivityGroup buckets by age: <20m / <1h / <4h / <8h / older', () => {
  assert.equal(compactActivityGroup(NOW - 1 * MIN, NOW), 0)
  assert.equal(compactActivityGroup(NOW - 30 * MIN, NOW), 1)
  assert.equal(compactActivityGroup(NOW - 2 * HOUR, NOW), 2)
  assert.equal(compactActivityGroup(NOW - 6 * HOUR, NOW), 3)
  assert.equal(compactActivityGroup(NOW - 20 * HOUR, NOW), 4)
  assert.equal(compactActivityGroup(undefined, NOW), 4, 'no activity → oldest bucket')
  assert.equal(compactActivityGroup(NOW + 5 * MIN, NOW), 0, 'future timestamps clamp to freshest')
})

test('compactActivityGroupSpacingPx opens a gap only when the bucket gets older', () => {
  // same bucket → no gap
  assert.equal(compactActivityGroupSpacingPx(NOW - 1 * MIN, NOW - 5 * MIN, NOW), 0)
  // fresh → 30m-old crosses into bucket 1
  assert.equal(compactActivityGroupSpacingPx(NOW - 1 * MIN, NOW - 30 * MIN, NOW), COMPACT_ACTIVITY_GROUP_GAP_PX[1])
  // jumping several buckets uses the new bucket's gap
  assert.equal(compactActivityGroupSpacingPx(NOW - 1 * MIN, NOW - 20 * HOUR, NOW), COMPACT_ACTIVITY_GROUP_GAP_PX[4])
  // newer than the predecessor (shouldn't happen in a sorted list) → no gap
  assert.equal(compactActivityGroupSpacingPx(NOW - 20 * HOUR, NOW - 1 * MIN, NOW), 0)
})

test('usageSummary keeps every positive token count visible', () => {
  assert.equal(
    usageSummary({ id: 'running', last_usage: { model: 'a-very-long-model-name', tokens_in: 71_000, tokens_out: 52_000 } }),
    '71k input · 52k output · 123k total',
  )
})


test('formatTokenCount uses compact thousands and millions with up to two decimals', () => {
  assert.equal(formatTokenCount(999), '999')
  assert.equal(formatTokenCount(1_520), '1.52k')
  assert.equal(formatTokenCount(71_000), '71k')
  assert.equal(formatTokenCount(999_999), '1m')
  assert.equal(formatTokenCount(2_410_000), '2.41m')
})


test('withLiveUsage adds the running turn to the completed session total', () => {
  const combined = withLiveUsage(
    { id: 'running', last_usage: { model: 'old', tokens_in: 100, tokens_out: 20, cost_usd: 0.1 } },
    { model: 'new', tokens_in: 50, tokens_out: 7, cost_usd: 0.05 },
  )
  assert.deepEqual(combined.last_usage, {
    model: 'new', tokens_in: 150, tokens_out: 27, cost_usd: 0.15000000000000002,
  })
  assert.equal(usageSummary(combined), '150 input · 27 output · 177 total')
})

test('usageSummary omits zero and missing token counts', () => {
  assert.equal(usageSummary({ id: 'input', last_usage: { tokens_in: 12, tokens_out: 0 } }), '12 input · 12 total')
  assert.equal(usageSummary({ id: 'output', last_usage: { tokens_in: null, tokens_out: 7 } }), '7 output · 7 total')
  assert.equal(usageSummary({ id: 'model', last_usage: { model: 'gpt', tokens_in: 0, tokens_out: 0 } }), null)
})


test('agent inactivity measures durable agent progress rather than card updates', () => {
  assert.equal(fmtAgentInactivity(NOW - 59 * 60_000, NOW), '59m')
  assert.equal(fmtAgentInactivity(NOW - 2 * HOUR - 10 * MIN, NOW), '2h')
  assert.equal(agentActivityIsStale(NOW - 4 * MIN, NOW), false)
  assert.equal(agentActivityIsStale(NOW - 5 * MIN, NOW), true)
  assert.equal(fmtAgentStaleDuration(NOW - 4 * MIN, NOW), '')
  assert.equal(fmtAgentStaleDuration(NOW - 7 * MIN, NOW), '2m')
  assert.equal(agentActivityIsStale(undefined, NOW), false)
})


test('sessionFailureCue classifies known provider failure causes', () => {
  assert.equal(sessionFailureCue({ status: 'error', last_error: 'Anthropic API is overloaded' })?.kind, 'overload')
  assert.equal(sessionFailureCue({ status: 'error', last_error: 'Codex Responses HTTP 401: token_expired' })?.kind, 'authentication')
  assert.equal(sessionFailureCue({ status: 'error', last_error: 'HTTP 429: too many requests' })?.kind, 'rate_limit')
  assert.equal(sessionFailureCue({ status: 'error', last_error: 'socket vanished' })?.kind, 'unknown')
  assert.equal(sessionFailureCue({ status: 'idle', last_error: 'HTTP 429' }), null)
})

test('sessionFailureTitle exposes the classified cause and original detail', () => {
  assert.equal(
    sessionFailureTitle({ status: 'error', last_error: 'quota exceeded for this account' }),
    'Rate limit: quota exceeded for this account',
  )
  assert.match(sessionFailureTitle({ status: 'error' }), /^Unknown failure:/)
})
