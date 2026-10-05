import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const server = await createServer({ root: appRoot, configFile: `${appRoot}/vite.config.ts`, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__walkthroughTest = { enabled: false, calls: [] }
  const ok = (id, result = {}) => queueMicrotask(() => window.__arbolReply?.(id, { ok: true, result }))
  window.webkit = { messageHandlers: { arbol: { postMessage(message) {
    const { method, callbackId: id } = message
    if (message.kind === 'native') return ok(id)
    if (message.kind !== 'request') return
    window.__walkthroughTest.calls.push(method)
    if (method === 'feature_toggles.list') return ok(id, { features: [{ key: 'elma.change_walkthrough', enabled: window.__walkthroughTest.enabled }] })
    if (method === 'repos.list') return ok(id, { repos: [] })
    if (method === 'ip.list') return ok(id, { ips: [] })
    if (method === 'subscription.list') return ok(id, { subscriptions: [] })
    if (method === 'ip.repo_rules.all') return ok(id, { rules: [], global_default: '' })
    if (method === 'elma.docHistory.list') return ok(id, { items: [] })
    if (method === 'change_walkthrough.targets') return ok(id, { repos: [] })
    return ok(id)
  } } } }
})
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' })
  const navigation = page.getByText('Change Walkthrough', { exact: true })
  assert.equal(await navigation.count(), 0)
  await page.keyboard.press('Alt+Tab')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arbol-open', { detail: { page: 'change-walkthrough' } })))
  assert.equal(await page.locator('.walkthrough-hit').count(), 0)
  assert.equal(await page.evaluate(() => window.__walkthroughTest.calls.filter(x => x.startsWith('change_walkthrough.')).length), 0)

  await page.evaluate(() => { window.__walkthroughTest.enabled = true; window.dispatchEvent(new Event('focus')) })
  await navigation.waitFor({ state: 'visible' })
  await navigation.click()
  await page.waitForFunction(() => window.__walkthroughTest.calls.includes('change_walkthrough.targets'))
  await page.evaluate(() => { window.__walkthroughTest.enabled = false; window.dispatchEvent(new Event('focus')) })
  await navigation.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.walkthrough-hit').count(), 0)
  assert.deepEqual(errors, [])
  console.log('change-walkthrough toggle e2e passed')
} finally {
  await browser.close()
  await server.close()
}
