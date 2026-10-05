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
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })

async function inspect(scenario) {
  await page.goto(`${baseUrl}/apps/elma/e2e/tool-animation-fixture.html?scenario=${scenario}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  return await page.evaluate(() => {
    const text = document.body.textContent || ''
    const elements = Array.from(document.querySelectorAll('*'))
    const byName = (name) => elements.filter((el) => getComputedStyle(el).animationName.split(',').map((v) => v.trim()).includes(name))
    const running = (name) => document.getAnimations({ subtree: true }).filter((animation) => {
      const effect = animation.effect
      const target = typeof KeyframeEffect !== 'undefined' && effect instanceof KeyframeEffect ? effect.target : null
      if (!(target instanceof Element)) return false
      const names = getComputedStyle(target).animationName.split(',').map((v) => v.trim())
      return names.includes(name) && (animation.playState === 'running' || animation.playState === 'pending')
    })
    const sheenEls = byName('arbol-tool-sheen')
    const blinkEls = byName('arbol-tool-status-blink')
    const sheen = sheenEls[0] ? getComputedStyle(sheenEls[0]) : null
    return {
      text,
      sheenStyleCount: sheenEls.length,
      blinkStyleCount: blinkEls.length,
      runningSheenCount: running('arbol-tool-sheen').length,
      runningBlinkCount: running('arbol-tool-status-blink').length,
      firstSheen: sheen ? {
        animationName: sheen.animationName,
        animationDuration: sheen.animationDuration,
        animationIterationCount: sheen.animationIterationCount,
        opacity: sheen.opacity,
        width: sheen.width,
        backgroundImage: sheen.backgroundImage,
        zIndex: sheen.zIndex,
      } : null,
      html: document.body.innerHTML,
    }
  })
}

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message + (details ? `\n${JSON.stringify(details, null, 2).slice(0, 5000)}` : ''))
    throw error
  }
}

try {
  const created = await inspect('created')
  assert(created.text.includes('created'), 'created scenario should show created label', created)
  assert(created.sheenStyleCount > 0, 'created scenario should mount arbol-tool-sheen element', created)
  assert(created.blinkStyleCount > 0, 'created scenario should mount blinking status glyph', created)
  assert(created.runningSheenCount > 0, 'created scenario should have a running sheen animation', created)

  const stdout = await inspect('stdout')
  assert(stdout.text.includes('streaming output'), 'stdout scenario should show streaming output label', stdout)
  assert(stdout.text.includes('success'), 'stdout scenario should show stdout text', stdout)
  assert(stdout.runningSheenCount > 0, 'stdout scenario should have a running sheen animation', stdout)

  const stderr = await inspect('stderr')
  assert(stderr.text.includes('streaming output'), 'stderr scenario should show streaming output label', stderr)
  assert(stderr.text.includes('warning'), 'stderr scenario should show stderr text', stderr)
  assert(stderr.runningSheenCount > 0, 'stderr scenario should have a running sheen animation', stderr)

  const terminal = await inspect('terminal')
  assert(terminal.text.includes('finished'), 'terminal scenario should show finished label', terminal)
  assert(terminal.text.includes('failed'), 'terminal scenario should show failed label', terminal)
  assert(terminal.sheenStyleCount === 0, 'terminal scenario should not mount sheen elements', terminal)
  assert(terminal.blinkStyleCount === 0, 'terminal scenario should not mount blinking status glyphs', terminal)

  console.log('tool-animation e2e passed')
  console.log(JSON.stringify({ created, stdout, stderr, terminal }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
