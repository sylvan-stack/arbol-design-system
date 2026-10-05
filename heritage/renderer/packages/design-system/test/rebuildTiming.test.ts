import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elapsedAt, remainingAt, targetProgress, timeLeftAt, type RebuildProgress } from '../src/chrome/rebuildTiming'

const screenshot: RebuildProgress = {
  active: true,
  progress: 98,
  startedAt: 1000,
  phaseStartedAt: 1222,
  expectedRemainingSeconds: 204,
  predictionQuality: 'exact-plan',
}

test('98% from an old host cannot override 3m46s elapsed and 3m20s left', () => {
  assert.equal(elapsedAt(screenshot, 1226), 226)
  assert.equal(remainingAt(screenshot, 1226), 200)
  assert.equal(timeLeftAt(screenshot, 1226), '~3m 20s left')
  assert.equal(Math.floor(targetProgress(screenshot, 1226)), 53)
})

test('progress and countdown share a clock between polls', () => {
  for (const at of [1226, 1256, 1286]) {
    const elapsed = elapsedAt(screenshot, at)
    const remaining = remainingAt(screenshot, at)
    assert.equal(targetProgress(screenshot, at), elapsed / (elapsed + remaining) * 100)
  }
})

test('a revised estimate can lower progress', () => {
  const before = { ...screenshot, expectedRemainingSeconds: 5 }
  assert.ok(targetProgress(before, 1226) > targetProgress(screenshot, 1226))
})

test('exhausting an estimate does not claim the rebuild is finishing', () => {
  assert.equal(targetProgress(screenshot, 2000), 98)
  assert.equal(timeLeftAt(screenshot, 2000), 'Taking longer than estimated…')
  assert.equal(timeLeftAt({ active: true }, 2000), 'Estimating…')
})

test('elapsed time stops on success or failure', () => {
  for (const failed of [false, true]) {
    const finished = { ...screenshot, active: false, failed, finishedAt: 1426, progress: failed ? 53 : 100 }
    assert.equal(elapsedAt(finished, 2000), 426)
    assert.equal(remainingAt(finished, 2000), 0)
    assert.equal(targetProgress(finished, 2000), failed ? 53 : 100)
  }
})
