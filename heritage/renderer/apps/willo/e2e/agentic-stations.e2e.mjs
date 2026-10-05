import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cockpit = resolve(root, '../elma/src/nav/MetaCockpit.svelte')
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'parent-cockpit-test',
    configureServer(server) {
      server.middlewares.use('/parent-cockpit', (_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end('<div id="test"></div><script type="module" src="/@id/virtual:parent-cockpit"></script>')
      })
    },
    resolveId(id) { if (id === 'virtual:parent-cockpit') return id },
    load(id) {
      if (id !== 'virtual:parent-cockpit') return
      return `import { mount } from 'svelte'; import Cockpit from ${JSON.stringify(cockpit)};
        mount(Cockpit, { target: document.querySelector('#test'), props: {
          parentChatSession: { id: 'parent', title: 'Parent chat', onGoing: true, isUnread: false, ongoing_chat_session_id: 'parent' },
          tags: [], definitions: [], onToggle() {}, onEdit() {}, onRemove() {}, onAdd() {}, onToggleVip() {},
        } });`
    },
  }],
})
await server.listen()
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(10_000)
await page.addInitScript(() => {
  const sessions = [
    { id: 'parent', title: 'Parent chat', initiator_kind: 'leather_bag', onGoing: true, status: 'running', isUnread: false },
    { id: 'child', title: 'Agent investigation', initiator_kind: 'agent', parent_chat_session_id: 'parent', status: 'idle' },
    { id: 'rootless', title: 'Scheduled monitor', initiator_kind: 'steward', status: 'idle', onGoing: false },
  ].map(s => ({ ...s, updated_at: Date.now(), created_at: Date.now() }))
  const subscriptions = new Map()
  const calls = []
  const snapshot = s => s.id !== 'child' ? { ...s } : { ...s, parent_chat_session: {
    ...sessions[0], ongoing_chat_session_id: 'parent',
  } }
  const reply = (id, result = { ok: true }) => queueMicrotask(() => window.__arbolReply?.(id, { ok: true, result }))
  window.__agenticTest = { calls, change(patch) {
    Object.assign(sessions[0], patch)
    for (const [sub_id, stream] of subscriptions) if (stream === 'chat_session.surface.events') {
      window.__arbolEvent?.({ sub_id, event: 'chat_session.surface.changed', data: { chat_session_id: 'parent', change: 'chat_session_changed' } })
    }
  } }
  window.webkit = { messageHandlers: { arbol: { postMessage(message) {
    const { kind, callbackId, method, params = {} } = message
    if (kind === 'subscribe') { subscriptions.set(message.subId, message.stream); return }
    if (kind === 'unsubscribe') { subscriptions.delete(message.subId); return }
    if (kind !== 'request' && kind !== 'native') return
    calls.push({ method, params })
    if (method === 'chat_session.list') return reply(callbackId, { chat_sessions: sessions.filter(s => (!params.initiator_kind || s.initiator_kind === params.initiator_kind) && (!params.agentic || s.initiator_kind !== 'leather_bag')).map(snapshot) })
    if (method === 'chat_session.get') return reply(callbackId, { chat_session: snapshot(sessions.find(s => s.id === params.id)) })
    if (method === 'draft.list') return reply(callbackId, { drafts: [] })
    if (method === 'entity.go_to') return reply(callbackId, { destination: { type: 'app', ui: 'elma', query: { session_id: params.entity_id } } })
    if (method === 'ip.list') return reply(callbackId, { ips: [] })
    return reply(callbackId)
  } } } }
})
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
try {
  await page.goto(origin)
  await page.getByText('Parent chat', { exact: true }).waitFor()
  assert.equal(await page.getByText('Agent investigation', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Agentic Stations', exact: true }).click()
  const running = page.locator('section.station-section').filter({ has: page.getByRole('heading', { name: 'Running', exact: true }) })
  await running.getByText('Agent investigation', { exact: true }).waitFor()
  assert.equal(await page.getByText('Parent chat', { exact: true }).count(), 0)
  await page.getByText('Scheduled monitor', { exact: true }).waitFor()
  await page.evaluate(() => window.__agenticTest.change({ status: 'idle', isUnread: true }))
  const unread = page.locator('section.station-section').filter({ has: page.getByRole('heading', { name: 'Unread', exact: true }) })
  await unread.getByText('Agent investigation', { exact: true }).waitFor()
  await page.evaluate(() => window.__agenticTest.change({ onGoing: false, isUnread: false }))
  const other = page.locator('section.station-section').filter({ has: page.getByRole('heading', { name: 'Other chats', exact: true }) })
  await other.getByText('Agent investigation', { exact: true }).waitFor()
  await page.screenshot({ path: '/tmp/arbol-agentic-stations.png' })
  await page.goto(`${origin}/parent-cockpit`)
  const chip = page.getByRole('link', { name: /Chat.*Parent chat/ })
  await chip.waitFor()
  await chip.click()
  assert.equal(await page.evaluate(() => window.__agenticTest.calls.some(c => c.method === 'entity.go_to')), false)
  await chip.click({ modifiers: ['Meta'] })
  await page.waitForFunction(() => window.__agenticTest.calls.some(c => c.method === 'app.open' && c.params.query.session_id === 'parent'))
  assert.deepEqual(errors, [])
  console.log('PASS: agentic page membership, live parent state, and Meta Cockpit Cmd+Click')
} finally {
  await browser.close()
  await server.close()
}
