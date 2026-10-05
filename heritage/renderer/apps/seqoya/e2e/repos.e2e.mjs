import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
})
await server.listen()
const browser = await chromium.launch({ headless: true, ...(process.env.ARBOL_BROWSER_CHANNEL ? { channel: process.env.ARBOL_BROWSER_CHANNEL } : {}) })
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.addInitScript(() => {
    window.confirm = () => { throw new Error('Native browser confirmation is unavailable') }
    const repos = [
      { name: 'external', path: '/repo/external', mycel_enabled: false, embedder_profile: 'voyage' },
      { name: 'private', path: '/repo/private', mycel_enabled: false, embedder_profile: 'local' },
    ]
    window.writes = []
    window.announcements = 0
    window.failSave = false
    window.cloneRequests = []
    window.failClone = true
    window.clonePolls = 0
    window.addEventListener('arbol:repos-changed', () => window.announcements++)
    window.webkit = { messageHandlers: { arbol: { postMessage(message) {
      let result = []
      if (message.method === 'repos.orgs.list') result = { organizations: [
        { name: 'Example organization', repos: [{ name: 'external', path: '/repo/external' }] },
        { name: 'Empty organization', repos: [] },
      ] }
      if (message.method === 'repos.list') result = { repos }
      if (message.method === 'repos.orgs.git') {
        window.cloneRequests.push(message.params)
        window.clonePolls = 0
        result = { started: true, total: 1 }
      }
      if (message.method === 'repos.orgs.git_status') {
        const running = window.clonePolls++ === 0
        const ok = !window.failClone
        if (!running && ok && !repos.some(repo => repo.name === 'cloned')) {
          repos.push({ name: 'cloned', path: '/home/test/repos/cloned', mycel_enabled: false, embedder_profile: 'local' })
        }
        result = { running, error: null, results: running ? [] : [
          { action: 'clone', repo: 'cloned', path: '/home/test/repos/cloned', ok, detail: ok ? 'done' : 'Authentication failed' },
        ] }
      }
      if (message.method === 'repos.set_mycel') {
        window.writes.push(message.params)
        if (window.failSave) {
          window.__arbolReply(message.callbackId, { ok: false, error: 'Save failed' })
          return
        }
        Object.assign(repos.find(repo => repo.name === message.params.name), message.params)
        result = message.params
      }
      window.__arbolReply(message.callbackId, { ok: true, result: JSON.parse(JSON.stringify(result)) })
    } } } }
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/e2e/repos-fixture.html`)
  const enableExternal = () => page.getByRole('switch', { name: 'Mycel indexing for external', checked: false, exact: true })
  const organization = page.locator('.repo-section').filter({ has: page.locator('.section-toggle', { hasText: 'Example organization' }) })
  const other = page.getByRole('region', { name: 'Repository settings for unassigned repositories', exact: true })
  await organization.waitFor()
  assert.equal(await page.locator('.repo-section').count(), 2)
  assert.equal(await page.getByText('Other repositories', { exact: true }).count(), 0)
  assert.equal(await other.locator('xpath=ancestor::section[contains(@class, "repo-section")]').count(), 0)
  assert.equal(await page.locator('.section-toggle[aria-expanded="true"]').count(), 0)
  assert.equal(await enableExternal().isVisible(), false)
  await organization.locator('.section-toggle').focus()
  await page.keyboard.press('Enter')
  await enableExternal().waitFor()
  assert.equal(await other.getByRole('switch', { name: 'Mycel indexing for private', checked: false, exact: true }).isVisible(), true)
  assert.match(await organization.locator('.section-toggle').innerText(), /1 repo/)
  await enableExternal().click()
  await page.getByRole('switch', { name: 'Mycel indexing for external', checked: true, exact: true }).waitFor()
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  await page.getByRole('switch', { name: 'Mycel indexing for external', checked: true, exact: true }).click()
  await enableExternal().waitFor()
  await page.getByRole('switch', { name: 'Mycel indexing for private', checked: false, exact: true }).click()
  await page.getByRole('switch', { name: 'Mycel indexing for private', checked: true, exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.writes), [
    { name: 'external', mycel_enabled: true },
    { name: 'external', mycel_enabled: false },
    { name: 'private', mycel_enabled: true },
  ])
  assert.equal(await page.evaluate(() => window.announcements), 3)
  await page.evaluate(() => { window.failSave = true })
  await page.getByRole('switch', { name: 'Mycel indexing for private', checked: true, exact: true }).click()
  await page.getByText('Save failed', { exact: true }).waitFor()
  assert.equal(await page.getByRole('switch', { name: 'Mycel indexing for private', checked: true, exact: true }).isEnabled(), true)
  assert.equal(await page.evaluate(() => window.announcements), 3)
  await organization.locator('.section-toggle').click()
  assert.equal(await enableExternal().isVisible(), false)
  assert.equal(await other.getByRole('switch', { name: 'Mycel indexing for private', checked: true, exact: true }).isVisible(), true)
  const empty = page.locator('.repo-section').filter({ has: page.locator('.section-toggle', { hasText: 'Empty organization' }) })
  await empty.locator('.section-toggle').click()
  await empty.getByText('No repositories in this organization.').waitFor()
  await page.getByRole('button', { name: 'Clone new repo', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Clone new repo' })
  assert.equal(await dialog.getByRole('button', { name: 'Clone', exact: true }).isEnabled(), false)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Clone new repo', exact: true }).click()
  await dialog.getByLabel('Repository URL').fill('https://github.com/owner/cloned.git')
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
  await dialog.getByRole('status').waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).isEnabled(), false)
  await dialog.getByRole('alert').waitFor()
  assert.match(await dialog.getByRole('alert').innerText(), /Authentication failed/)
  await page.evaluate(() => { window.failClone = false })
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await other.getByText('/home/test/repos/cloned', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.announcements), 4)
  assert.deepEqual(await page.evaluate(() => window.cloneRequests), [
    { action: 'clone', url: 'https://github.com/owner/cloned.git' },
    { action: 'clone', url: 'https://github.com/owner/cloned.git' },
  ])
  await page.reload()
  await organization.waitFor()
  assert.equal(await page.locator('.section-toggle[aria-expanded="true"]').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Repos organization grouping/collapse/keyboard and Mycel enable/disable/local/reload/error regression passed')
} finally {
  await browser.close()
  await server.close()
}
