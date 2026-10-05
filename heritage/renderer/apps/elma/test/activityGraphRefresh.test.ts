import assert from 'node:assert/strict'
import test from 'node:test'
import { chatSessionView, initialChatSession, onRenderInvalidation, type ArbolBridge } from '@arbol/events'
import { notifyRenderInvalidation } from '../../../packages/events/src/renderInvalidation'
import { ActivityGraphRefresh, type GraphState } from '../src/chat/activityGraphRefresh'

const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
function harness() {
  const calls: { method: string; params: any; resolve: (value: any) => void; reject: (error: any) => void }[] = []
  const states: GraphState[] = []
  const bridge: ArbolBridge = {
    call: (method, params) => new Promise((resolve, reject) => calls.push({ method, params, resolve, reject })),
    subscribe: () => { throw new Error('Inspector must reuse existing stream') },
    onCoreReconnect: () => { throw new Error('Inspector must reuse existing reconnect hook') },
  }
  const controller = new ActivityGraphRefresh(bridge, state => states.push(state))
  const result = (index: number, extra = {}) => ({ status: 'observed', ...calls[index].params,
    executions: [], edges: [], observed_head: index + 1, ...extra })
  return { bridge, controller, calls, states, result }
}

test('bursts coalesce, IO invalidation refuses stale results, no polling or implicit error retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  h.controller.select('session', 'exchange')
  t.mock.timers.tick(0)
  assert.equal(h.calls.length, 1)
  for (let i = 0; i < 500; i++) notifyRenderInvalidation(h.bridge, 'session')
  t.mock.timers.tick(10_000)
  assert.equal(h.calls.length, 1)
  h.calls[0].resolve(h.result(0))
  await tick()
  assert.equal(h.states.at(-1)?.result, null)
  t.mock.timers.tick(249)
  assert.equal(h.calls.length, 1)
  t.mock.timers.tick(1)
  assert.equal(h.calls.length, 2)
  h.calls[1].resolve(h.result(1))
  await tick()
  assert.equal(h.states.at(-1)?.result?.observed_head, 2)
  t.mock.timers.tick(100_000)
  assert.equal(h.calls.length, 2)
  h.controller.refresh()
  t.mock.timers.tick(0)
  h.calls[2].reject(new Error('sensitive transport error'))
  await tick()
  assert.deepEqual(h.states.at(-1), { result: h.result(1), loading: false, error: true, stale: true })
  t.mock.timers.tick(100_000)
  assert.equal(h.calls.length, 3)
  notifyRenderInvalidation(h.bridge, 'session')
  t.mock.timers.tick(250)
  h.calls[3].resolve(h.result(3, { status: 'unavailable' }))
  await tick()
  assert.deepEqual(h.states.at(-1), { result: h.result(1), loading: false, error: true, stale: true })
  h.controller.dispose()
})

test('rapid selection uses one IO, ignores old identity and starts only newest selection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  h.controller.select('old', 'same')
  t.mock.timers.tick(0)
  h.controller.select('next', 'intermediate')
  h.controller.select('next', 'same')
  t.mock.timers.tick(100_000)
  assert.equal(h.calls.length, 1)
  h.calls[0].resolve(h.result(0))
  await tick()
  assert.equal(h.states.at(-1)?.result, null)
  t.mock.timers.tick(250)
  assert.deepEqual(h.calls[1].params, { chat_session_id: 'next', exchange_id: 'same' })
  h.calls[1].resolve(h.result(1, { chat_session_id: 'old' }))
  await tick()
  assert.equal(h.states.at(-1)?.error, true)
  const count = h.states.length
  notifyRenderInvalidation(h.bridge, 'old')
  notifyRenderInvalidation({ ...h.bridge }, 'next')
  assert.equal(h.states.length, count)
  h.controller.select(null, null)
  notifyRenderInvalidation(h.bridge, 'next')
  t.mock.timers.tick(100_000)
  assert.equal(h.calls.length, 2)
  assert.deepEqual(h.states.at(-1), { result: null, loading: false, error: false, stale: false })
  h.controller.dispose()
})

test('dispose cancels scheduled work and ignores unreturned IO and subsequent hints', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const inFlight of [false, true]) {
    const h = harness()
    h.controller.select('session', 'exchange')
    if (inFlight) t.mock.timers.tick(0)
    h.controller.dispose()
    const count = h.states.length
    notifyRenderInvalidation(h.bridge, 'session')
    h.controller.refresh()
    h.controller.select('other', 'other')
    if (inFlight) h.calls[0].reject(new Error('closed'))
    await tick()
    t.mock.timers.tick(100_000)
    assert.equal(h.states.length, count)
    assert.equal(h.calls.length, Number(inFlight))
  }
})

test('observer failures do not escape or break sibling notification; unsubscribe isolates sessions', () => {
  const h = harness()
  let observed = 0
  const offError = onRenderInvalidation(h.bridge, 'session', () => { throw new Error('observer') })
  const offGood = onRenderInvalidation(h.bridge, 'session', () => observed++)
  notifyRenderInvalidation(h.bridge, 'session')
  assert.equal(observed, 1)
  offError(); offGood()
  notifyRenderInvalidation(h.bridge, 'session')
  assert.equal(observed, 1)
  h.controller.dispose()
})

test('actual chat render binding emits hints on open/snapshot/change/reconnect only, with generation guard', async () => {
  const frames: ((frame: any) => void)[] = []
  let reconnect = () => {}
  let observed = 0
  const streams: string[] = []
  const page = { view: initialChatSession('session'), projection_seq: 1 }
  const bridge: ArbolBridge = {
    call: async () => page,
    subscribe: (stream, params, emit) => { streams.push(stream); frames.push(emit); return () => {} },
    onCoreReconnect: cb => { reconnect = cb; return () => {} },
  }
  const offHint = onRenderInvalidation(bridge, 'session', () => observed++)
  const offView = chatSessionView(bridge, 'session').subscribe(() => {})
  await tick()
  assert.equal(observed, 1)
  frames[0]({ event: 'assistant.text_delta', data: { text: 'x' } })
  assert.equal(observed, 1)
  frames[0]({ event: 'chat_session.render_changed', data: {} })
  frames[0]({ event: 'chat_session.render_snapshot', data: page })
  assert.equal(observed, 3)
  reconnect()
  assert.equal(observed, 4)
  frames[0]({ event: 'chat_session.render_changed', data: {} })
  assert.equal(observed, 4)
  frames[1]({ event: 'chat_session.render_changed', data: {} })
  assert.equal(observed, 5)
  offView()
  frames[1]({ event: 'chat_session.render_changed', data: {} })
  reconnect()
  assert.equal(observed, 5)
  assert.deepEqual(streams, ['chat_session.render', 'chat_session.render'])
  offHint()
})


test('sustained hints retain only the last accepted observation until a current read settles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  h.controller.select('session', 'exchange')
  t.mock.timers.tick(0)
  const accepted = h.result(0)
  h.calls[0].resolve(accepted)
  await tick()
  for (let index = 1; index <= 5; index++) {
    notifyRenderInvalidation(h.bridge, 'session')
    t.mock.timers.tick(250)
    assert.equal(h.calls.length, index + 1)
    for (let i = 0; i < 100; i++) notifyRenderInvalidation(h.bridge, 'session')
    h.calls[index].resolve(h.result(index))
    await tick()
    assert.deepEqual(h.states.at(-1), { result: accepted, loading: true, error: false, stale: true })
  }
  t.mock.timers.tick(250)
  const current = h.result(6)
  h.calls[6].resolve(current)
  await tick()
  assert.deepEqual(h.states.at(-1), { result: current, loading: false, error: false, stale: false })
  // Identical Exchange IDs in a different session never reuse the snapshot.
  h.controller.select('other', 'exchange')
  assert.deepEqual(h.states.at(-1), { result: null, loading: true, error: false, stale: false })
  t.mock.timers.tick(0)
  h.calls[7].resolve(h.result(7, { status: 'unavailable' }))
  await tick()
  assert.equal(h.states.at(-1)?.result?.status, 'unavailable')
  assert.equal(h.states.at(-1)?.stale, false)
  h.controller.dispose()
})

test('a selection round trip cannot restore a cached graph or accept old IO/errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const fail of [false, true]) {
    const h = harness()
    h.controller.select('session', 'exchange')
    t.mock.timers.tick(0)
    h.calls[0].resolve(h.result(0))
    await tick()
    h.controller.refresh()
    t.mock.timers.tick(0)
    h.controller.select('session', 'other')
    h.controller.select('session', 'exchange')
    if (fail) h.calls[1].reject(new Error('obsolete error'))
    else h.calls[1].resolve(h.result(1))
    await tick()
    assert.deepEqual(h.states.at(-1), { result: null, loading: true, error: false, stale: false })
    t.mock.timers.tick(250)
    h.calls[2].resolve(h.result(2, { status: 'unavailable' }))
    await tick()
    assert.equal(h.states.at(-1)?.result?.status, 'unavailable')
    assert.equal(h.states.at(-1)?.stale, false)
    h.controller.dispose()
  }
})
