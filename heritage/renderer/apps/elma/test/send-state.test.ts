import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agentActivityRunningState, agentActivityStatusVisible, chatMarkedRunningState } from '../src/app/send-state'

const state = (overrides: Partial<Parameters<typeof chatMarkedRunningState>[0]> = {}) => chatMarkedRunningState({
  hasBridge: true,
  attachedSessionId: null,
  foldSessionId: null,
  foldStatus: 'idle',
  activeTurnId: '',
  responding: false,
  ...overrides,
})

test('a detached new chat ignores the previous session running fold', () => {
  assert.equal(state({ attachedSessionId: null, foldSessionId: 'session-1', foldStatus: 'running' }), false)
})

test('an attached session with its own running fold is guarded', () => {
  assert.equal(state({ attachedSessionId: 'session-1', foldSessionId: 'session-1', foldStatus: 'running' }), true)
})

test('an attached session ignores a running fold retained from another session', () => {
  assert.equal(state({ attachedSessionId: 'session-2', foldSessionId: 'session-1', foldStatus: 'running' }), false)
})

test('an optimistic active turn is guarded before the fold catches up', () => {
  assert.equal(state({ attachedSessionId: null, activeTurnId: 'turn-1' }), true)
})

test('mock mode uses the locally responding turn', () => {
  assert.equal(state({ hasBridge: false, responding: true }), true)
  assert.equal(state({ hasBridge: false, responding: false }), false)
})

test('activity chrome is active only while the folded session is running', () => {
  assert.equal(agentActivityRunningState('running'), true)
  assert.equal(agentActivityRunningState('idle'), false)
  assert.equal(agentActivityRunningState('error'), false)
  assert.equal(agentActivityRunningState(null), false)
})


test('a live activity label is hidden unless the folded session is running', () => {
  assert.equal(agentActivityStatusVisible('running', 'starting'), true)
  assert.equal(agentActivityStatusVisible('idle', 'starting'), false)
  assert.equal(agentActivityStatusVisible('error', 'streaming'), false)
  assert.equal(agentActivityStatusVisible('idle', 'completed'), true)
  assert.equal(agentActivityStatusVisible('idle', 'failed'), true)
})
