import { test } from 'node:test'
import assert from 'node:assert/strict'

import { shouldCompleteActiveTurn } from '../src/app/active-turn-state'

const state = (overrides: Partial<Parameters<typeof shouldCompleteActiveTurn>[0]> = {}) => shouldCompleteActiveTurn({
  foldStatus: 'running',
  terminalPhase: null,
  sawRunning: false,
  newAssistant: false,
  ...overrides,
})

test('does not complete while the authoritative fold is running', () => {
  assert.equal(state({ foldStatus: 'running', sawRunning: true }), false)
})

test('completes an observed running turn when the authoritative fold becomes idle without a retained terminal', () => {
  assert.equal(state({ foldStatus: 'idle', sawRunning: true, terminalPhase: null }), true)
})

test('retains the batched completed-terminal fallback when no running fold was observed', () => {
  assert.equal(state({ foldStatus: 'idle', terminalPhase: 'completed', newAssistant: true }), true)
})

test('does not complete an unobserved idle snapshot without a matching completion terminal', () => {
  assert.equal(state({ foldStatus: 'idle', terminalPhase: null, newAssistant: true }), false)
})
