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
  await page.addInitScript(() => {
    window.__temporaryTextRequests = []
    window.webkit = {
      messageHandlers: {
        arbol: {
          postMessage(message) {
            if (message.kind !== 'native' || message.method !== 'file.createTemporaryText') return
            window.__temporaryTextRequests.push(message)
            const reply = () => window.__arbolReply(message.callbackId, {
              ok: true,
              result: { ok: true, path: '/tmp/Arbol/pasted-text/large-paste.txt' },
            })
            window.__temporaryTextRequests.at(-1).reply = reply
          },
        },
      },
    }
  })
  await page.goto(`http://127.0.0.1:${address.port}/apps/elma/e2e/large-paste-composer-fixture.html`, { waitUntil: 'networkidle' })
  const pastedText = 'x'.repeat(10_000)
  const expected = '[Pasted text (10,000 characters)](/tmp/Arbol/pasted-text/large-paste.txt)'

  const pasteLargeText = async () => {
    const editor = page.locator('.entity-composer-input')
    await editor.focus()
    await editor.evaluate((element, text) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
    }, pastedText)
    await page.waitForFunction(() => window.__temporaryTextRequests.length === 1)
    return editor
  }

  // Regression matching the native app: after the file link becomes visible,
  // the Draft persistence callback synchronously reads source.value. The editor
  // used to notify that callback before updating its DOM, silently restoring the
  // old empty Draft; Cmd+Enter then had nothing to submit.
  let editor = await pasteLargeText()
  await page.evaluate(() => window.__temporaryTextRequests[0].reply())
  await page.waitForFunction((link) => document.querySelector('.entity-composer-input')?.textContent?.includes(link), expected)
  await page.keyboard.press('Meta+Enter')
  await page.waitForFunction(() => document.querySelector('[data-sent-count]')?.textContent === '1')
  assert.equal(await page.locator('[data-sent-value]').textContent(), expected)

  // Also retain the async-write behavior: Cmd+Enter pressed while native file
  // creation is pending is queued and runs once the same durable link is in the
  // Draft and in the live editor.
  await page.reload({ waitUntil: 'networkidle' })
  editor = await pasteLargeText()
  await page.keyboard.press('Meta+Enter')
  assert.equal(await page.locator('[data-sent-count]').textContent(), '0')
  await page.evaluate(() => window.__temporaryTextRequests[0].reply())
  await page.waitForFunction(() => document.querySelector('[data-sent-count]')?.textContent === '1')
  assert.equal(await page.locator('[data-composer-value]').textContent(), expected)
  assert.equal(await page.locator('[data-sent-value]').textContent(), expected)
  // Image paste must still reach Composer through the rich editor, including
  // when no text input has initialized its local source reference yet.
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.entity-composer-input').evaluate((element) => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  })
  await page.getByRole('img', { name: 'pasted.png' }).waitFor()
  assert.match(await page.getByRole('img', { name: 'pasted.png' }).getAttribute('src'), /^data:image\/png;base64,/)
  await page.getByRole('button', { name: 'Remove image' }).click()
  assert.equal(await page.getByRole('img', { name: 'pasted.png' }).count(), 0)
  assert.equal(errors.length, 0, `renderer errors: ${errors.join('; ')}`)
  console.log('large-paste composer e2e passed')
} finally {
  await browser.close()
  await server.close()
}
