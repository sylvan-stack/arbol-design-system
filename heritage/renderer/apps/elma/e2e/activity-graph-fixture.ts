import { mount } from 'svelte'
const requests: unknown[] = []
let release: (() => void) | null = null
let phase = 'running'
let hold = false
let outcome = 'observed'
let empty = false
let emit: ((frame: any) => void) | null = null
let reconnect: (() => void) | null = null
let streamCount = 0
window.webkit = { messageHandlers: { arbol: { postMessage(message: any) {
  if (message.kind !== 'request') return
  if (message.method !== 'activity_graph.get') throw new Error(`Unexpected RPC: ${message.method}`)
  requests.push(message)
  const exchange = message.params.exchange_id
  const node = (id: string, phase: string, causes: string[] = []) => ({
    execution_id: id, activity_id: `${exchange}.activity`, phase, caused_by_execution_ids: causes,
    inputs: id === 'consumer' ? [{ name: 'input', kind: 'text', value_id: 'value:feed' }] : [],
    outputs: id === 'producer' ? [{ name: 'feed', kind: 'text', value_id: 'value:feed' }] : [],
    timestamps: { ready: 1000 },
  })
  const result = { status: exchange === 'unavailable' ? 'unavailable' : outcome,
    chat_session_id: 'session', exchange_id: exchange, runtime_id: 'default-trunk:local',
    range_start: 1, range_end: 7, observed_head: 9,
    executions: exchange === 'empty' || empty ? [] : [node('producer', 'completed'), node('consumer', phase, ['producer'])],
    edges: [{ from: 'producer', to: 'consumer', kind: 'value', value_id: 'value:feed' }],
  }
  const response = outcome === 'error' ? { ok: false, error: 'fixture transport failure' } : { ok: true, result }
  const reply = () => window.__arbolReply?.(message.callbackId, response)
  if (exchange === 'slow' || hold) release = reply
  else setTimeout(reply, 0)
} } } }
Object.assign(window, { activityRequests: requests, releaseActivity: () => release?.() })
// Real render binding supplies local invalidation hints; transport is stubbed.
const { elmaBridge } = await import('../src/api')
const { chatSessionView, initialChatSession } = await import('@arbol/events')
const graphCall = elmaBridge.call
elmaBridge.call = (method, params) => method === 'chat_session.transcript_page'
  ? Promise.resolve({ view: initialChatSession('session'), projection_seq: 1 })
  : graphCall(method, params)
elmaBridge.subscribe = (stream, params, callback) => {
  if (stream !== 'chat_session.render') throw new Error('Unexpected subscription')
  streamCount++
  emit = callback
  return () => { if (emit === callback) emit = null }
}
elmaBridge.onCoreReconnect = callback => { reconnect = callback; return () => { reconnect = null } }
const offView = chatSessionView(elmaBridge, 'session').subscribe(() => {})
Object.assign(window, {
  invalidateActivity: (nextPhase = 'completed', count = 1) => {
    phase = nextPhase
    for (let i = 0; i < count; i++) emit?.({ event: 'chat_session.render_changed', data: {} })
  },
  configureActivity: (config: { hold?: boolean; outcome?: string; empty?: boolean }) => {
    hold = config.hold ?? false
    outcome = config.outcome ?? 'observed'
    empty = config.empty ?? false
  },
  reconnectActivity: () => reconnect?.(),
  activityStreamCount: () => streamCount,
  stopActivityView: offView,
})
const { default: Fixture } = await import('./ActivityGraphFixture.svelte')
mount(Fixture, { target: document.getElementById('root')! })
