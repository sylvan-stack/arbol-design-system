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
const browser = await chromium.launch({ headless: true, ...(process.env.ARBOL_BROWSER_CHANNEL ? { channel: process.env.ARBOL_BROWSER_CHANNEL } : {}) })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(`http://127.0.0.1:${address.port}/apps/elma/e2e/message-images-fixture.html`, { waitUntil: 'networkidle' })
  const thumbnail = page.getByRole('button', { name: 'Expand screenshot.png' })
  await thumbnail.click()
  const dialog = page.getByRole('dialog', { name: 'screenshot.png' })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0), true)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await thumbnail.evaluate(button => document.activeElement === button), true)
  await thumbnail.click()
  await page.getByRole('button', { name: 'Close image preview' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Expand saved.png' }).click()
  const saved = page.getByRole('dialog', { name: 'saved.png' })
  assert.equal(await saved.getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0), true)
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
  console.log('message image preview e2e passed')
} finally {
  await browser.close()
  await server.close()
}
