import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenHandoffGuard } from '../src/app/open-handoff-guard'

test('accepts one physical app.open handoff only once', () => {
  const guard = new OpenHandoffGuard()
  const payload = { session_id: 'session-1', session_open_id: 'open-1' }
  assert.equal(guard.accept(payload), true)
  assert.equal(guard.accept(payload), false)
  assert.equal(guard.accept({ ...payload }), false)
})

test('accepts distinct opens of the same session', () => {
  const guard = new OpenHandoffGuard()
  assert.equal(guard.accept({ session_id: 'session-1', session_open_id: 'open-1' }), true)
  assert.equal(guard.accept({ session_id: 'session-1', session_open_id: 'open-2' }), true)
})

test('uses an unambiguous tuple key', () => {
  const guard = new OpenHandoffGuard()
  assert.equal(guard.accept({ session_id: 'a:b', session_open_id: 'c' }), true)
  assert.equal(guard.accept({ session_id: 'a', session_open_id: 'b:c' }), true)
})

test('retains compatibility for legacy payloads without a correlation identity', () => {
  const guard = new OpenHandoffGuard()
  assert.equal(guard.accept({ session_id: 'session-1' }), true)
  assert.equal(guard.accept({ session_id: 'session-1' }), true)
})

test('permits explicit retry after handling failure', () => {
  const guard = new OpenHandoffGuard()
  const retry = { session_id: 'session-2', session_open_id: 'open-retry' }
  assert.equal(guard.accept(retry), true)
  guard.forget(retry)
  assert.equal(guard.accept(retry), true)
})

test('never capacity-evicts an unacknowledged handoff', () => {
  const guard = new OpenHandoffGuard(2)
  const first = { session_id: 'session-1', session_open_id: 'open-1' }
  assert.equal(guard.accept(first), true)
  for (let index = 2; index <= 100; index += 1) {
    assert.equal(guard.accept({ session_id: 'session-1', session_open_id: `open-${index}` }), true)
  }
  assert.equal(guard.accept(first), false)
})

test('bounds only acknowledged retention without admitting pending duplicates', () => {
  const guard = new OpenHandoffGuard(2)
  const pending = { session_id: 'session-pending', session_open_id: 'open-pending' }
  assert.equal(guard.accept(pending), true)

  for (let index = 1; index <= 3; index += 1) {
    const payload = { session_id: 'session-1', session_open_id: `open-${index}` }
    assert.equal(guard.accept(payload), true)
    guard.markHandled(payload)
    guard.markAcknowledged(payload)
    assert.equal(guard.accept(payload), false)
  }

  assert.equal(guard.accept(pending), false)
  assert.equal(guard.accept({ session_id: 'session-1', session_open_id: 'open-1' }), true)
})

test('tracks handled state so a consume failure can retry acknowledgement only', () => {
  const guard = new OpenHandoffGuard()
  const payload = { session_id: 'session-1', session_open_id: 'open-1' }
  assert.equal(guard.accept(payload), true)
  assert.equal(guard.isHandled(payload), false)
  guard.markHandled(payload)
  assert.equal(guard.isHandled(payload), true)
  assert.equal(guard.accept(payload), false)
  guard.markAcknowledged(payload)
  assert.equal(guard.isHandled(payload), false)
  assert.equal(guard.accept(payload), false)
})
