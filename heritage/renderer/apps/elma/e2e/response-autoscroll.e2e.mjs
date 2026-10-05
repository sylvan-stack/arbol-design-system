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
const baseUrl = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 520 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

const alignment = () => page.evaluate(() => {
  const scroller = window.__responseAutoscrollFixture.scroller()
  const separator = scroller.querySelector('[data-answer-threshold]')
  return {
    delta: separator.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    scrollTop: scroller.scrollTop,
    bottom: scroller.scrollHeight - scroller.clientHeight,
    spacerHeight: Number.parseFloat(scroller.querySelector('[data-final-answer-opening-spacer]')?.style.height || '0'),
  }
})

try {
  await page.goto(`${baseUrl}/apps/elma/e2e/response-autoscroll-fixture.html`, { waitUntil: 'networkidle' })
  // Real completed chats open as a shell first; their latest Turn arrives from the
  // fast fold afterward. Verify the opening operation survives that hydration.
  await page.evaluate(() => window.__responseAutoscrollFixture.hydrateFastResponse())
  await page.locator('[data-answer-threshold]').waitFor({ state: 'visible' })
  // The fast latest-Turn paint is not stable enough for final positioning. The
  // one-time scroll happens only when full-history promotion is complete.
  await page.evaluate(() => window.__responseAutoscrollFixture.hydrateFullHistory())
  await page.waitForFunction(() => {
    const scroller = window.__responseAutoscrollFixture.scroller()
    const separator = scroller?.querySelector('[data-answer-threshold]')
    return separator && Math.abs(separator.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 1
  })

  const opened = await alignment()
  assert(Math.abs(opened.delta) <= 1, `separator did not open at top: ${JSON.stringify(opened)}`)
  assert(opened.spacerHeight > 0, `short final answer did not receive opening room: ${JSON.stringify(opened)}`)

  // Delayed markdown/font/layout work must not knock an opened chat to the
  // bottom. The separator remains the opening anchor until user interaction.
  await page.evaluate(() => window.__responseAutoscrollFixture.prependLateContent())
  await page.waitForTimeout(150)
  const hydrated = await alignment()
  assert(Math.abs(hydrated.delta) <= 1, `late layout moved separator: ${JSON.stringify(hydrated)}`)

  // User scrolling releases the opening anchor and remains ordinary afterward.
  await page.evaluate(() => {
    const scroller = window.__responseAutoscrollFixture.scroller()
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true }))
    scroller.scrollTop += 80
    window.__responseAutoscrollFixture.prependLateContent()
  })
  await page.waitForTimeout(150)
  const afterUserScroll = await alignment()
  assert(Math.abs(afterUserScroll.delta) > 20, `opening anchor ignored user scroll: ${JSON.stringify(afterUserScroll)}`)

  // A direct completed response has no thinking/tool activity, but is still all
  // final answer and therefore must render and open at its separator.
  await page.evaluate(() => window.__responseAutoscrollFixture.openDirectCompletedResponse())
  await page.waitForFunction(() => {
    const scroller = window.__responseAutoscrollFixture.scroller()
    const separator = scroller?.querySelector('[data-answer-threshold]')
    return separator && Math.abs(separator.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 1
  })
  const direct = await alignment()
  assert(Math.abs(direct.delta) <= 1, `direct answer did not open at separator: ${JSON.stringify(direct)}`)

  // Some fast paints briefly look live. Do not commit them to bottom scrolling;
  // the fully hydrated completed Turn still owns the historical opening target.
  await page.evaluate(() => window.__responseAutoscrollFixture.openFastResponseThatLooksLive())
  await page.waitForTimeout(50)
  await page.evaluate(() => window.__responseAutoscrollFixture.finishLiveLookingHistoryHydration())
  await page.waitForFunction(() => {
    const scroller = window.__responseAutoscrollFixture.scroller()
    const separator = scroller?.querySelector('[data-answer-threshold]')
    return separator && Math.abs(separator.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 1
  })
  const liveLooking = await alignment()
  assert(Math.abs(liveLooking.delta) <= 1, `live-looking fast paint opened at bottom: ${JSON.stringify(liveLooking)}`)
  assert.equal(errors.length, 0, `renderer errors: ${errors.join('; ')}`)

  console.log('response-autoscroll e2e passed')
} finally {
  await browser.close()
  await server.close()
}
