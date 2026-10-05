/* UI verification for the Svelte rewrite (no Storybook needed): build an app,
 * serve its built dir, screenshot it headless, and report console errors.
 *   node tools/shot.mjs <url> <out.png> [data-theme]
 * Typical: python3 -m http.server in the built dir, then point <url> at it.
 * Screenshots are read back with the Read tool to eyeball the rendered UI. */
import { chromium } from 'playwright'
const [, , url, out, theme] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 2 })
const errs = []
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
await p.goto(url, { waitUntil: 'load' })
if (theme) await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
await p.waitForTimeout(400)
await p.screenshot({ path: out })
console.log('console errors:', errs.length ? errs.join(' | ') : 'none')
await b.close()
