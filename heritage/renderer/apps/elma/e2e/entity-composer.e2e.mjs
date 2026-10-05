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

const entityUri = '[arb:tic:composer-chip:UGFzdGVkIGVudGl0eSBjaGlw]'
const editor = page.locator('.entity-composer-input')
const value = page.locator('[data-composer-value]')

try {
  await page.goto(`http://127.0.0.1:${address.port}/apps/elma/e2e/entity-composer-fixture.html`, { waitUntil: 'networkidle' })
  await editor.click()
  await page.keyboard.insertText(entityUri)
  await editor.locator('[data-entity-uri]').waitFor()
  await page.evaluate(() => {
    const input = document.querySelector('.entity-composer-input')
    const marker = input.lastChild
    const range = document.createRange()
    range.setStart(marker, marker.textContent.length)
    range.collapse(true)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })

  // Regression: a pasted Chip that is the editor's only content must retain its
  // logical caret, so ordinary typing extends the draft on the Chip's right.
  await page.keyboard.type(' more text')
  await page.waitForFunction((expected) => document.querySelector('[data-composer-value]')?.textContent === expected, `${entityUri} more text`)
  assert.equal(await value.textContent(), `${entityUri} more text`)

  const inserted = await page.evaluate(() => document.querySelector('.entity-composer-input').insertText(' [Pasted text](/tmp/paste.txt)'))
  assert.equal(inserted, true)
  await page.waitForFunction(
    (expected) => document.querySelector('[data-composer-value]')?.textContent === expected,
    `${entityUri} more text [Pasted text](/tmp/paste.txt)`,
  )

  // Horizontal arrows use source offsets while treating a Chip as one atomic
  // caret step. Moving left through plain text and then across the Chip must put
  // the next typed character before it rather than at the stale end position.
  await page.reload({ waitUntil: 'networkidle' })
  await editor.focus()
  await page.keyboard.insertText(`${entityUri} after`)
  await editor.locator('[data-entity-uri]').waitFor()
  for (let index = 0; index < ' after'.length; index += 1) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('X')
  await page.waitForFunction(
    (expected) => document.querySelector('[data-composer-value]')?.textContent === expected,
    `X${entityUri} after`,
  )

  // Right arrow crosses the same Chip in one step and ordinary typing resumes
  // immediately after it.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('Y')
  await page.waitForFunction(
    (expected) => document.querySelector('[data-composer-value]')?.textContent === expected,
    `X${entityUri}Y after`,
  )

  // Backspace removes the adjacent Chip as one atomic editor item. This is the
  // exact stuck-composer state: the pasted Chip is the only draft content.
  await page.reload({ waitUntil: 'networkidle' })
  await editor.focus()
  await page.keyboard.insertText(entityUri)
  await editor.locator('[data-entity-uri]').waitFor()
  await page.evaluate(() => {
    const marker = document.querySelector('.entity-composer-input').lastChild
    const range = document.createRange()
    range.setStart(marker, marker.textContent.length)
    range.collapse(true)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.press('Backspace')
  await page.waitForFunction(() => document.querySelector('[data-composer-value]')?.textContent === '')
  assert.equal(await editor.locator('[data-entity-uri]').count(), 0)
  assert.equal(errors.length, 0, `renderer errors: ${errors.join('; ')}`)

  console.log('entity-composer e2e passed')
} finally {
  await browser.close()
  await server.close()
}
