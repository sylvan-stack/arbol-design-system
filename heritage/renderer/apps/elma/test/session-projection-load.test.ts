import assert from 'node:assert/strict'
import test from 'node:test'
import { IDLE_PROJECTION_REVALIDATE_MS, RUNNING_PROJECTION_REVALIDATE_MS, chatSessionView, initialChatSession, type ArbolBridge, type ChatSessionRender, type ChatSessionView } from '@arbol/events'

type Subscription = { stream: string; params: Record<string, unknown>; emit: (event: any) => void; closed: boolean }

const view = (turnId: string, parent: string | null, text: string, ts: number): ChatSessionView => ({
  ...initialChatSession('session-1'),
  status: 'idle',
  title: 'Projected',
  turns: { [turnId]: { turn_id: turnId, parent_turn_id: parent, removed: false } },
  messages: [{ id: `m-${turnId}`, role: 'user', content: text, turn_id: turnId, ts }],
})

function harness(page: any, older?: any) {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = []
  const subscriptions: Subscription[] = []
  let currentPage = page
  let failuresRemaining = 0
  const bridge: ArbolBridge = {
    call: async (method, params) => {
      calls.push({ method, params })
      if (failuresRemaining > 0) {
        failuresRemaining -= 1
        throw new Error('transient projection read failure')
      }
      return params?.before_turn_seq === undefined ? currentPage : older
    },
    subscribe: (stream, params, emit) => {
      const sub = { stream, params, emit, closed: false }
      subscriptions.push(sub)
      return () => { sub.closed = true }
    },
    onCoreReconnect: () => () => {},
  }
  return {
    bridge, calls, subscriptions,
    setPage: (next: any) => { currentPage = next },
    failNextCalls: (count = 1) => { failuresRemaining = count },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('state activation resets canonical cursors and refuses late legacy snapshots', async () => {
  const h = harness({ view: view('old', null, 'legacy', 1), projection_seq: 9000, next_before_turn_seq: 600 })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  const statePage = { storage_generation: 'state:database:2', view: view('new', null, 'state', 2), projection_seq: 1, next_before_turn_seq: null }
  h.setPage(statePage)
  h.subscriptions[0].emit({ event: 'chat_session.render_snapshot', data: statePage })
  assert.equal(latest.view.messages[0]?.content, 'state')
  assert.equal(latest.hasMoreHistory, false)
  h.subscriptions[0].emit({ event: 'chat_session.render_snapshot', data: { view: view('old', null, 'stale', 1), projection_seq: 9999 } })
  assert.equal(latest.view.messages[0]?.content, 'state')
  unsubscribe()
})

test('late older page cannot resurrect a removed branch after a newer snapshot', async () => {
  const h = harness({ storage_generation: 'state:database:2', view: view('t2', 't1', 'recent', 2), projection_seq: 10, next_before_turn_seq: 2 })
  let completeOlder!: (page: unknown) => void
  const call = h.bridge.call
  h.bridge.call = async (method, params) => params?.before_turn_seq === undefined
    ? call(method, params) : new Promise((resolve) => { completeOlder = resolve })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  const loading = latest.loadOlderHistory()
  const changed = { storage_generation: 'state:database:2', view: view('t2', null, 'surviving branch', 2), projection_seq: 11, next_before_turn_seq: null }
  h.setPage(changed)
  h.subscriptions[0].emit({ event: 'chat_session.render_snapshot', data: changed })
  completeOlder({ storage_generation: 'state:database:2', view: view('t1', null, 'removed branch', 1), projection_seq: 10, next_before_turn_seq: null })
  await loading
  await tick()
  assert.deepEqual(latest.view.messages.map(m => m.content), ['surviving branch'])
  assert.equal(latest.view.turns.t1, undefined)
  assert.equal(latest.loadingOlderHistory, false)
  unsubscribe()
})

test('opening consumes a ready-to-render view and never subscribes to durable events', async () => {
  const { bridge, calls, subscriptions } = harness({
    view: view('t2', 't1', 'recent', 2), projection_seq: 91, next_before_turn_seq: 20,
  })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()

  assert.deepEqual(calls, [{ method: 'chat_session.transcript_page', params: { chat_session_id: 'session-1', limit: 12 } }])
  assert.equal(latest.view.messages[0]?.content, 'recent')
  assert.equal(latest.historyHydrated, true)
  assert.deepEqual(subscriptions[0], {
    stream: 'chat_session.render', params: { chat_session_id: 'session-1' },
    emit: subscriptions[0].emit, closed: false,
  })
  assert.equal(subscriptions.some((sub) => sub.stream === 'chat_session.events'), false)
  unsubscribe()
})

test('render snapshot DTO can seed the view without an event fold', async () => {
  const { bridge, subscriptions } = harness({
    view: initialChatSession('session-1'), projection_seq: 0, next_before_turn_seq: null,
  })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  subscriptions[0].emit({
    event: 'chat_session.render_snapshot',
    data: { view: view('t1', null, 'snapshot', 1), projection_seq: 5, next_before_turn_seq: null },
  })
  await tick()
  assert.equal(latest.view.messages[0]?.content, 'snapshot')
  unsubscribe()
})

test('render invalidation refreshes a bounded projection rather than folding an event', async () => {
  const h = harness({ view: view('t1', null, 'before', 1), projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  h.setPage({ view: view('t1', null, 'after', 2), projection_seq: 2, next_before_turn_seq: null })
  h.subscriptions[0].emit({ event: 'chat_session.render_changed', data: {} })
  await tick()
  assert.equal(latest.view.messages[0]?.content, 'after')
  assert.equal(h.calls.filter((call) => call.method === 'chat_session.transcript_page').length, 2)
  unsubscribe()
})

test('terminal invalidation retries after a transient projection read failure', async () => {
  const running = { ...view('t1', null, 'before', 1), status: 'running' as const }
  const idle = { ...view('t1', null, 'after', 2), status: 'idle' as const }
  const h = harness({ view: running, projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  assert.equal(latest.view.status, 'running')

  h.setPage({ view: idle, projection_seq: 2, next_before_turn_seq: null })
  h.failNextCalls()
  h.subscriptions[0].emit({ event: 'chat_session.render_changed', data: {} })
  await new Promise((resolve) => setTimeout(resolve, 150))

  assert.equal(latest.view.status, 'idle')
  assert.equal(h.calls.filter((call) => call.method === 'chat_session.transcript_page').length, 3)
  unsubscribe()
})

test('idle projection discovers activity when the render stream goes quiet', async () => {
  const idle = { ...view('t1', null, 'before', 1), status: 'idle' as const }
  const running = { ...view('t1', null, 'after', 2), status: 'running' as const }
  const h = harness({ view: idle, projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  assert.equal(latest.view.status, 'idle')

  // The user stays on this session, but no render_snapshot/render_changed frame
  // reaches the renderer. The attached-session watchdog must still discover the
  // newly running projection; previously only already-running sessions polled.
  h.setPage({ view: running, projection_seq: 2, next_before_turn_seq: null })
  await new Promise((resolve) => setTimeout(resolve, IDLE_PROJECTION_REVALIDATE_MS + 100))

  assert.equal(latest.view.status, 'running')
  assert.equal(latest.view.messages[0]?.content, 'after')
  assert.equal(h.calls.filter((call) => call.method === 'chat_session.transcript_page').length, 2)
  unsubscribe()
})

test('running projection self-heals when the terminal stream frame is lost', async () => {
  const running = { ...view('t1', null, 'before', 1), status: 'running' as const }
  const idle = { ...view('t1', null, 'after', 2), status: 'idle' as const }
  const h = harness({ view: running, projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  assert.equal(latest.view.status, 'running')

  // Core has committed the terminal projection, but neither render_snapshot nor
  // render_changed reaches this renderer subscription.
  h.setPage({ view: idle, projection_seq: 2, next_before_turn_seq: null })
  await new Promise((resolve) => setTimeout(resolve, RUNNING_PROJECTION_REVALIDATE_MS + 100))

  assert.equal(latest.view.status, 'idle')
  assert.equal(h.calls.filter((call) => call.method === 'chat_session.transcript_page').length, 2)
  unsubscribe()
})


test('equal-sequence terminal page supersedes an earlier running snapshot', async () => {
  const running = { ...view('t1', null, 'before', 1), status: 'running' as const }
  const idle = { ...view('t1', null, 'after', 2), status: 'idle' as const }
  // A render snapshot and the first projection read can straddle Core's
  // terminal commit while exposing the same projection sequence.
  const h = harness({ view: idle, projection_seq: 41, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  h.subscriptions[0].emit({
    event: 'chat_session.render_snapshot',
    data: { view: running, projection_seq: 41, next_before_turn_seq: null },
  })
  await tick()
  assert.equal(latest.view.status, 'idle')
  unsubscribe()
})

test('equal-sequence page applies an ongoing-only metadata change', async () => {
  const ongoing = { ...view('t1', null, 'prompt', 1), onGoing: true }
  const cleared = { ...ongoing, onGoing: false }
  const h = harness({ view: ongoing, projection_seq: 41, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  assert.equal(latest.view.onGoing, true)

  h.subscriptions[0].emit({
    event: 'chat_session.render_snapshot',
    data: { view: cleared, projection_seq: 41, next_before_turn_seq: null },
  })
  assert.equal(latest.view.onGoing, false)
  unsubscribe()
})

test('late pre-terminal read cannot replace a newer terminal snapshot', async () => {
  const running = { ...view('t1', null, 'before', 1), status: 'running' as const }
  const idle = { ...view('t1', null, 'after', 2), status: 'idle' as const }
  const h = harness({ view: running, projection_seq: 41, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(h.bridge, 'session-1').subscribe((state) => { latest = state })

  // A stream snapshot containing the terminal event wins first. The initial
  // RPC was read before that commit but arrives later; its lower durable head
  // must not resurrect running chrome.
  h.subscriptions[0].emit({
    event: 'chat_session.render_snapshot',
    data: { view: idle, projection_seq: 42, next_before_turn_seq: null },
  })
  await tick()
  assert.equal(latest.view.status, 'idle')
  unsubscribe()
})

test('older projected pages merge without historical event folding', async () => {
  const { bridge, calls } = harness(
    { view: view('t2', 't1', 'recent', 2), projection_seq: 91, next_before_turn_seq: 20 },
    { view: view('t1', null, 'older', 1), projection_seq: 91, next_before_turn_seq: null },
  )
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  await latest.loadOlderHistory()

  assert.deepEqual(calls.at(-1), {
    method: 'chat_session.transcript_page',
    params: { chat_session_id: 'session-1', before_turn_seq: 20, limit: 12 },
  })
  assert.deepEqual(latest.view.messages.map((message) => message.content), ['older', 'recent'])
  assert.deepEqual(Object.keys(latest.view.turns), ['t1', 't2'])
  assert.equal(latest.hasMoreHistory, false)
  unsubscribe()
})

test('transient text remains an ephemeral overlay', async () => {
  const { bridge, subscriptions } = harness({
    view: view('t1', null, 'prompt', 1), projection_seq: 1, next_before_turn_seq: null,
  })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()
  subscriptions[0].emit({ event: 'assistant.text_delta', data: { text: 'streaming' } })
  assert.equal(latest.streaming.text, 'streaming')
  unsubscribe()
})

test('rate-limit wait frames set and clear the streaming overlay', async () => {
  const running = { ...view('t1', null, 'prompt', 1), status: 'running' as const }
  const { bridge, subscriptions } = harness({ view: running, projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()

  subscriptions[0].emit({
    event: 'turn.rate_limit_wait',
    data: { turn_id: 't1', ip_name: 'universe-1', retry_at: 1_800_000_000, recovery_seconds: 60 },
  })
  assert.deepEqual(latest.streaming.rateLimitWait, { retryAt: 1_800_000_000, ipName: 'universe-1', recoverySeconds: 60 })

  subscriptions[0].emit({
    event: 'turn.rate_limit_wait',
    data: { turn_id: 't1', ip_name: 'universe-1', retry_at: 0, recovery_seconds: 0 },
  })
  assert.equal(latest.streaming.rateLimitWait, null)
  unsubscribe()
})

test('a terminal snapshot clears a lingering rate-limit wait overlay', async () => {
  const running = { ...view('t1', null, 'prompt', 1), status: 'running' as const }
  const { bridge, subscriptions } = harness({ view: running, projection_seq: 1, next_before_turn_seq: null })
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()

  subscriptions[0].emit({
    event: 'turn.rate_limit_wait',
    data: { turn_id: 't1', ip_name: 'universe-1', retry_at: 1_800_000_000, recovery_seconds: 60 },
  })
  assert.ok(latest.streaming.rateLimitWait)

  subscriptions[0].emit({
    event: 'chat_session.render_snapshot',
    data: { view: { ...view('t1', null, 'prompt', 1), status: 'error' }, projection_seq: 2, next_before_turn_seq: null },
  })
  await tick()
  assert.equal(latest.streaming.rateLimitWait ?? null, null)
  unsubscribe()
})

test('session-open diagnostics correlate transcript request and first usable history receipt without content', async () => {
  const h = harness({ view: view('t1', null, 'secret transcript text', 1), projection_seq: 7, next_before_turn_seq: null })
  const diagnostics: any[] = []
  h.bridge.diagnostic = (entry) => diagnostics.push(entry)
  const unsubscribe = chatSessionView(h.bridge, 'session-1', 'open-1').subscribe(() => {})
  await tick()

  const requested = diagnostics.find((entry) => entry.stage === 'transcript_requested')
  const received = diagnostics.find((entry) => entry.stage === 'first_usable_history_received')
  const rpcStarted = diagnostics.find((entry) => entry.stage === 'transcript_rpc_started')
  const rpcCompleted = diagnostics.find((entry) => entry.stage === 'transcript_rpc_completed')
  assert.equal(requested.session_open_id, 'open-1')
  assert.equal(received.session_open_id, 'open-1')
  assert.equal(typeof received.encoded_bytes, 'number')
  assert.equal(received.result_count, 1)
  assert.equal(rpcStarted.session_open_id, 'open-1')
  assert.equal(typeof rpcStarted.request_id, 'string')
  assert.equal(rpcCompleted.request_id, rpcStarted.request_id)
  assert.equal(typeof rpcCompleted.duration_ms, 'number')
  assert.equal(h.calls[0].params.session_open_id, 'open-1')
  assert.equal(h.calls[0].params.session_open_request_id, rpcStarted.request_id)
  assert.equal(h.subscriptions[0].params.session_open_id, 'open-1')
  assert.equal(JSON.stringify(diagnostics).includes('secret transcript text'), false)
  unsubscribe()
})

test('older pages retain reused provider tool IDs from separate turns', async () => {
  const pageView = (id: string, ts: number): ChatSessionView => ({
    ...view(id, null, id, ts),
    nativeToolCalls: [{ turn_id: id, tool_use_id: 'item_1', tool_name: 'Bash', input: {}, ok: true, invoked_ts: ts }],
  })
  const { bridge } = harness(
    { view: pageView('t2', 2), projection_seq: 91, next_before_turn_seq: 20 },
    { view: pageView('t1', 1), projection_seq: 91, next_before_turn_seq: null },
  )
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe(state => { latest = state })
  await tick()
  await latest.loadOlderHistory()
  assert.deepEqual(latest.view.nativeToolCalls.map(call => call.turn_id), ['t1', 't2'])
  unsubscribe()
})

test('a live usage tick survives same-turn seals but not the terminal seal', async () => {
  const runningView = (seq: number, phase: NonNullable<ChatSessionView['turn']>['phase'], lastSeq: number): ChatSessionView => ({
    ...initialChatSession('session-1'),
    status: 'running',
    turn: {
      turn_id: 't2', phase, ip_name: 'glm', attempt: 1, excluded_ips: [],
      batches: [], cycles: 1, stop_reason: null, error: null,
    },
    messages: [{ id: `m-${lastSeq}`, role: 'assistant', content: 'c', turn_id: 't2', ts: lastSeq, seq: lastSeq }],
  })
  const page = (v: ChatSessionView, seq: number) => ({ view: v, projection_seq: seq })
  const { bridge, subscriptions, setPage } = harness(page(runningView(91, 'executing', 1), 91))
  let latest!: ChatSessionRender
  const unsubscribe = chatSessionView(bridge, 'session-1').subscribe((state) => { latest = state })
  await tick()

  subscriptions[0].emit({
    event: 'usage.tick',
    data: { turn_id: 't2', partial: { model: 'm', tokens_in: 5_000, tokens_out: 250, cost_usd: 0 } },
  })
  assert.deepEqual(latest.streaming.usage, { model: 'm', tokens_in: 5_000, tokens_out: 250, cost_usd: 0 })

  // Tool-boundary seal: a new durable message + awaiting_tools on the SAME turn
  // seals the text overlay but must keep the cumulative usage tick.
  setPage(page(runningView(92, 'awaiting_tools', 2), 92))
  subscriptions[0].emit({ event: 'chat_session.render_changed' })
  await tick()
  assert.equal(latest.streaming.text, '')
  assert.deepEqual(latest.streaming.usage, { model: 'm', tokens_in: 5_000, tokens_out: 250, cost_usd: 0 })

  // Terminal seal: the durable snapshot owns the totals now.
  setPage(page({
    ...initialChatSession('session-1'),
    status: 'idle',
    messages: [{ id: 'm-3', role: 'assistant', content: 'done', turn_id: 't2', ts: 3, seq: 3 }],
  }, 93))
  subscriptions[0].emit({ event: 'chat_session.render_changed' })
  await tick()
  assert.equal(latest.streaming.usage ?? null, null)
  unsubscribe()
})
