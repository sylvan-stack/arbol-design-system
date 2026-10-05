/* Headless repro of the Oaken "Set wall" flow with a mock Arbol bridge, to see
 * exactly which RPCs the UI dispatches. node tools/repro-setwall.mjs <url> */
import { chromium } from 'playwright'
const [, , url] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 })
const errs = []
p.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()))
p.on('pageerror', (e) => { errs.push('PAGEERROR: ' + e.message); console.log('[pageerror]', e.message) })

// Mock the Swift bridge: record every request, auto-reply. One swimlane (no wall).
await p.addInitScript(() => {
  window.__calls = []
  const reply = (id, result) => window.__arbolReply && window.__arbolReply(id, { ok: true, result })
  const now = Date.now()
  const lane = {
    swimlane_id: 'sl-1', root_kind: 'ticket', root_ref: 'DEMO-10001', title: 'Repro lane',
    hue: null, slot_n: 1, status: 'active', wall_type: null, due_at: null,
    created_at: now - 3600000, updated_at: now, entities: [],
  }
  window.webkit = {
    messageHandlers: {
      arbol: {
        postMessage: (msg) => {
          if (msg.kind === 'request') {
            window.__calls.push({ method: msg.method, params: msg.params })
            const r = msg.method === 'oaken.swimlanes' ? { swimlanes: [lane] } : { ok: true }
            queueMicrotask(() => reply(msg.callbackId, r))
          } else if (msg.kind === 'subscribe') {
            // no events
          } else if (msg.kind === 'native') {
            queueMicrotask(() => reply(msg.callbackId, {}))
          }
        },
      },
    },
  }
})

await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(600)
const dump = async (label) => console.log(label, JSON.stringify((await p.evaluate(() => window.__calls)).map((c) => c.method)))
await dump('calls after load:')

// 1) right-click the occupied lane to open its context menu
try {
  await p.locator('.lane:not(.empty)').first().click({ button: 'right' })
  await p.waitForTimeout(200)
  const menuItems = await p.locator('.dpop [role="menuitem"], .dpop button, .dpop .dpop-item').allInnerTexts()
  console.log('context menu items:', JSON.stringify(menuItems))
} catch (e) { console.log('right-click failed:', e.message) }

// 2) click "Set wall…" in the menu
try {
  await p.getByText(/Set wall/i).first().click()
  await p.waitForTimeout(300)
  const modalOpen = await p.locator('text=Set wall').count()
  console.log('after menu click — "Set wall" texts on page:', modalOpen)
} catch (e) { console.log('menu "Set wall" click failed:', e.message) }

// 3) click the modal "Set wall" button
try {
  await p.getByRole('button', { name: /^Set wall$/i }).first().click()
  await p.waitForTimeout(400)
} catch (e) { console.log('modal "Set wall" button click failed:', e.message) }

await dump('calls AFTER set-wall attempt:')
console.log('pageerrors:', errs.length ? errs.join(' | ') : 'none')
await b.close()
