import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const server = await createServer({
  root: appRoot,
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
})
await server.listen()
const browser = await chromium.launch({ headless: true, ...(process.env.ARBOL_BROWSER_CHANNEL ? { channel: process.env.ARBOL_BROWSER_CHANNEL } : {}) })
try {
  for (const missingBlob of [false, true]) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.stack || error.message))
    await page.addInitScript(({ missingBlob }) => {
      const stamp = Date.now()
      const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
      const attachment = { sha256: 'stored-image', mime_type: 'image/png', filename: 'screenshot.png', byte_len: 68 }
      const session = { id: 'retry-image', ip_name: 'glm', title: 'Retry image', status: 'error', thinking_level: 'xhigh', workspace_dirs: ['/repo/Arbol'] }
      const view = {
        chat_session_id: session.id, status: 'error', title: session.title, onGoing: true,
        turn: null, toolRequests: {}, toolRequestParams: {}, toolRequestOpenedAt: {},
        toolResults: [], nativeToolCalls: [], workingDirectoryChanges: [],
        lastTurnTerminal: { turn_id: 'failed-turn', phase: 'failed', error: 'CLI startup failed', failed_at: stamp },
        turns: { 'failed-turn': { turn_id: 'failed-turn', parent_turn_id: null, removed: false } },
        messages: [{ id: 'message', role: 'user', content: 'Fix the screenshot issue', turn_id: 'failed-turn', ts: stamp, attachments: [attachment] }],
      }
      window.__retryImage = { calls: [], data }
      const reply = (id, result = { ok: true }) => queueMicrotask(() => window.__arbolReply?.(id, { ok: true, result }))
      function request(id, method, params) {
        window.__retryImage.calls.push({ method, params: structuredClone(params) })
        if (method === 'repos.list') return reply(id, { repos: [{ name: 'Arbol', path: '/repo/Arbol' }] })
        if (method === 'ip.list') return reply(id, { ips: [{ name: 'glm', label: 'GLM', provider: 'claude', enabled: true, default_for_provider: true }] })
        if (method === 'subscription.list') return reply(id, { subscriptions: [{ name: 'glm', provider: 'claude', auth_state: 'logged_in' }] })
        if (method === 'ip.repo_rules.all') return reply(id, { rules: [], global_default: 'glm' })
        if (method === 'chat_session.get') return reply(id, { chat_session: session, chat_session_seq: 7 })
        if (method === 'chat_session.worktrees') return reply(id, { supported: false, worktrees: [], selected_path: '/repo/Arbol' })
        if (method === 'chat_session.transcript_page') return reply(id, { view, projection_seq: 7, next_before_turn_seq: null })
        if (method === 'draft.get_for_session') return reply(id, { draft: null })
        if (method === 'elma.docHistory.list') return reply(id, { items: [] })
        if (method === 'draft.get_blob') {
          if (missingBlob) return queueMicrotask(() => window.__arbolReply?.(id, { ok: false, error: 'blob not found' }))
          return reply(id, { sha256: attachment.sha256, mime_type: 'image/png', byte_len: 68, data })
        }
        if (method === 'chat_session.edit_turn') {
          return reply(id, {
            ok: true, submission_id: params.submission_id, replaced_turn_id: 'failed-turn',
            replacement_turn_id: 'replacement', replacement_parent_turn_id: null,
            replacement_disposition: 'root', active_live_leaf_turn_id: 'replacement', accepted_chat_session_seq: 8,
          })
        }
        return reply(id)
      }
      window.webkit = { messageHandlers: { arbol: { postMessage(message) {
        if (message.kind === 'request') request(message.callbackId, message.method, message.params || {})
        else if (message.kind === 'native') reply(message.callbackId)
      } } } }
    }, { missingBlob })
    const open = encodeURIComponent(JSON.stringify({ session_id: 'retry-image' }))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/index.html?open=${open}`)
    await page.locator('[aria-live="polite"]').filter({ has: page.locator('[data-agent-failure-detail]') })
      .getByRole('button', { name: 'Retry', exact: true }).click()
    if (missingBlob) {
      await page.getByText('Could not load attached image screenshot.png: blob not found', { exact: false }).waitFor()
      const edits = await page.evaluate(() => window.__retryImage.calls.filter((call) => call.method === 'chat_session.edit_turn'))
      assert.equal(edits.length, 0, 'a missing image must prevent replacement submission')
    } else {
      await page.waitForFunction(() => window.__retryImage.calls.some((call) => call.method === 'chat_session.edit_turn'))
      const { params, data } = await page.evaluate(() => ({
        params: window.__retryImage.calls.find((call) => call.method === 'chat_session.edit_turn').params,
        data: window.__retryImage.data,
      }))
      assert.equal(params.turn_id, 'failed-turn')
      assert.deepEqual(params.attachments, [{ type: 'image', mime_type: 'image/png', data, name: 'screenshot.png', size: 68 }])
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('PASS: production Retry hydrates persisted images; missing images prevent submission')
} finally {
  await browser.close()
  await server.close()
}
