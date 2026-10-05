import assert from 'node:assert/strict'
import test from 'node:test'
import { persistedActiveBranchKey } from '../src/app/branch-reconciliation'

test('initial renderer attachment seeds unchanged active-branch deduplication', () => {
  const calls: string[] = []
  let lastSaved = persistedActiveBranchKey('session-1', 'turn-persisted')
  const persist = (turnId: string) => {
    const key = `session-1:${turnId}`
    if (lastSaved === key) return
    lastSaved = key
    calls.push(turnId)
  }

  persist('turn-persisted')
  assert.deepEqual(calls, [])
})

test('a genuine user branch change remains eligible for persistence', () => {
  const calls: string[] = []
  let lastSaved = persistedActiveBranchKey('session-1', 'turn-persisted')
  const persist = (turnId: string) => {
    const key = `session-1:${turnId}`
    if (lastSaved === key) return
    lastSaved = key
    calls.push(turnId)
  }

  persist('turn-user-selected')
  assert.deepEqual(calls, ['turn-user-selected'])
})

test('missing persisted branch does not suppress the first genuine selection', () => {
  assert.equal(persistedActiveBranchKey('session-1', null), '')
})
