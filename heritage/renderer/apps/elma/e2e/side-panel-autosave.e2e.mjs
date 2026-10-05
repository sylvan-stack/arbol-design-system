import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../..')
const server = await createServer({
  root: rendererRoot,
  server: { host: '127.0.0.1', port: 0 },
  configFile: resolve(rendererRoot, 'apps/elma/vite.config.ts'),
  logLevel: 'error',
})

await server.listen()
const address = server.httpServer.address()
if (!address || typeof address === 'string') throw new Error('Unable to determine Vite server address')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(`http://127.0.0.1:${address.port}/apps/elma/e2e/side-panel-autosave-fixture.html`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Edit' }).click()
  const editor = page.getByRole('textbox', { name: 'Edit autosave-regression.txt' })
  await editor.fill('after autosave')
  await page.getByText('Saved', { exact: true }).waitFor()

  // Regression: applying the successful write to file.content must not trigger
  // the file-navigation reset effect and switch the Right Panel back to preview.
  assert.equal(await editor.count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed'), 'true')
  await page.waitForTimeout(600)
  assert.equal(await editor.count(), 1)

  const writes = await page.evaluate(() => window.__sidePanelAutosaveWrites)
  assert.deepEqual(writes, [{ path: '/tmp/autosave-regression.txt', content: 'after autosave' }])
  assert.equal(errors.length, 0, `renderer errors: ${errors.join('; ')}`)

  console.log('side-panel autosave e2e passed')
} finally {
  await browser.close()
  await server.close()
}
