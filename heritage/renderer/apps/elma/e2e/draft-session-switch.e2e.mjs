import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const server = await createServer({
  root: appRoot,
  server: { host: '127.0.0.1', port: 0 },
  configFile: resolve(appRoot, 'vite.config.ts'),
  logLevel: 'error',
})

await server.listen()
const address = server.httpServer.address()
if (!address || typeof address === 'string') throw new Error('Unable to determine Vite server address')
const baseUrl = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

// Install a deterministic in-browser implementation of the native/Core bridge.
// The test still mounts the production App/Composer code and drives real DOM
// input, blur and arbol-open events; only the process boundary is replaced.
await page.addInitScript(() => {
  const now = () => Date.now()
  const sessions = {
    'draft-e2e-a': {
      id: 'draft-e2e-a', ip_name: 'glm', title: 'Draft E2E A',
      thinking_level: 'none', workspace_dirs: ['/repo/Arbol'], status: 'idle',
    },
    'draft-e2e-b': {
      id: 'draft-e2e-b', ip_name: 'glm', title: 'Draft E2E B',
      thinking_level: 'none', workspace_dirs: ['/repo/Arbol'], status: 'idle',
    },
    'draft-e2e-existing': {
      id: 'draft-e2e-existing', ip_name: 'glm', title: 'Existing Chat',
      thinking_level: 'none', workspace_dirs: ['/repo/Arbol'], status: 'idle',
    },
    'draft-e2e-leak-target': {
      id: 'draft-e2e-leak-target', ip_name: 'glm', title: 'Leak Target',
      thinking_level: 'none', workspace_dirs: ['/repo/Arbol'], status: 'idle',
    },
  }
  const drafts = new Map([['willo-draft-1', {
    draft_id: 'willo-draft-1', text: 'opened from Willo', attachments: [],
    revision: 1, created_at: now(), updated_at: now(),
  }]])
  const bindings = new Map()
  const calls = []
  const blockedSessionGets = new Set()
  const pendingSessionGets = []

  const reply = (id, payload) => queueMicrotask(() => window.__arbolReply?.(id, payload))
  const ok = (id, result = { ok: true }) => reply(id, { ok: true, result })
  const fail = (id, error) => reply(id, { ok: false, error })

  function request(id, method, params) {
    calls.push({ method, params: structuredClone(params || {}), at: now() })
    if (method === 'repos.list') return ok(id, { repos: [{ name: 'Arbol', path: '/repo/Arbol' }] })
    if (method === 'ip.list') return ok(id, { ips: [{
      name: 'glm', label: 'GLM', provider: 'claude', version: '1',
      deprecated: 0, default_for_provider: 1, subscription_name: 'glm',
      default_model: '', enabled_models: [], thinking_level: 'none',
    }] })
    if (method === 'subscription.list') return ok(id, { subscriptions: [{
      name: 'glm', provider: 'claude', label: 'GLM',
      auth_state: 'logged_in', usage: { ok: true },
    }] })
    if (method === 'ip.repo_rules.all') return ok(id, { rules: [], global_default: '' })
    if (method === 'chat_session.get') {
      if (blockedSessionGets.has(params.id)) {
        pendingSessionGets.push({ id, params: structuredClone(params) })
        return
      }
      const session = sessions[params.id]
      return ok(id, { chat_session: session ? { ...session } : null, chat_session_seq: 0 })
    }
    if (method === 'chat_session.set_unread') return ok(id)
    if (method === 'elma.docHistory.list') return ok(id, { items: [] })
    if (method === 'draft.get') {
      const draft = drafts.get(params.draft_id)
      return draft ? ok(id, { draft: { ...draft } }) : fail(id, 'draft not found')
    }
    if (method === 'draft.get_for_session') {
      const draft = [...drafts.values()].find((item) => item.chat_session_id === params.chat_session_id) || null
      return ok(id, { draft: draft ? { ...draft } : null })
    }
    if (method === 'draft.upsert') {
      const stamp = now()
      const previous = drafts.get(params.draft_id)
      const draft = {
        draft_id: params.draft_id,
        chat_session_id: params.chat_session_id || previous?.chat_session_id || null,
        text: params.text || '',
        attachments: params.attachments || [],
        revision: (previous?.revision || 0) + 1,
        created_at: previous?.created_at || stamp,
        updated_at: stamp,
      }
      drafts.set(params.draft_id, draft)
      return ok(id, { ok: true, draft: { ...draft } })
    }
    if (method === 'draft.discard') {
      const existing = drafts.get(params.draft_id)
      if (existing && (existing.chat_session_id || null) !== (params.chat_session_id || null)) {
        return fail(id, 'draft scope conflict')
      }
      const discarded = drafts.delete(params.draft_id)
      return ok(id, { ok: true, discarded })
    }
    // Diagnostics and unrelated best-effort UI calls must not obscure the draft
    // scenario. Record them and return a successful empty result.
    return ok(id)
  }

  window.__draftE2E = {
    draft: (sid) => {
      const prefix = 'arbol:elma:composer-draft-binding:v1:session:' + sid
      const draftId = localStorage.getItem(prefix)
      return structuredClone((draftId && drafts.get(draftId)) || null)
    },
    calls: () => structuredClone(calls),
    draftIds: () => [...drafts.keys()],
    draftsWithText: (text) => structuredClone([...drafts.values()].filter((draft) => draft.text === text)),
    blockSessionGet: (sid) => blockedSessionGets.add(sid),
    releaseSessionGet: (sid) => {
      blockedSessionGets.delete(sid)
      for (let index = pendingSessionGets.length - 1; index >= 0; index -= 1) {
        const pending = pendingSessionGets[index]
        if (pending.params.id !== sid) continue
        pendingSessionGets.splice(index, 1)
        const session = sessions[sid]
        ok(pending.id, { chat_session: session ? { ...session } : null, chat_session_seq: 0 })
      }
    },
  }
  function subscribe(subId, stream, params) {
    if (stream !== 'chat_session.events' || !['draft-e2e-existing', 'draft-e2e-leak-target'].includes(params.chat_session_id)) return
    // Give this session one durable user turn so production renders the active,
    // initially collapsed reply composer rather than the empty-chat composer.
    queueMicrotask(() => window.__arbolEvent?.({
      sub_id: subId,
      event: 'USER_SENT_MESSAGE',
      data: {
        chat_session_seq: 1,
        event_ts: now(),
        turn_id: 'existing-turn-1',
        message_id: 'existing-message-1',
        content: 'An existing message',
        thinking_level: 'none',
        parent_turn_id: null,
      },
    }))
  }

  window.webkit = {
    messageHandlers: {
      arbol: {
        postMessage(message) {
          if (message.kind === 'request') request(message.callbackId, message.method, message.params || {})
          else if (message.kind === 'native') ok(message.callbackId)
          else if (message.kind === 'subscribe') subscribe(message.subId, message.stream, message.params || {})
        },
      },
    },
  }
})

const textarea = page.locator('[contenteditable="true"]')
const draftA = 'draft A survives an immediate UI switch\nwith its second line intact'
const draftB = 'draft B remains scoped to its own chat session'

async function openSession(sessionId) {
  await page.evaluate((sid) => {
    window.dispatchEvent(new CustomEvent('arbol-open', { detail: { session_id: sid, restore_draft: true } }))
  }, sessionId)
}

async function storedText(sessionId) {
  return page.evaluate((sid) => window.__draftE2E.draft(sid)?.text || null, sessionId)
}

try {
  const open = encodeURIComponent(JSON.stringify({ session_id: 'draft-e2e-a', restore_draft: true }))
  await page.goto(`${baseUrl}/index.html?open=${open}`, { waitUntil: 'networkidle' })
  await textarea.waitFor({ state: 'visible' })

  // Switch before the 350 ms debounce expires. The navigation boundary must
  // synchronously snapshot the last keystroke and persist it to session A.
  // WebKit commonly represents Enter as sibling block elements rather than a
  // text-node newline. Draft extraction must preserve that visual boundary.
  await textarea.evaluate((el) => {
    el.replaceChildren()
    for (const line of ['draft A survives an immediate UI switch', 'with its second line intact']) {
      const block = document.createElement('div')
      block.textContent = line
      el.append(block)
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertParagraph' }))
  })
  await page.evaluate(() => { window.__draftE2EOldTextarea = document.querySelector('[contenteditable="true"]') })
  // Reproduce the race from the incident in one browser task. The open handler
  // supersedes A's composer synchronously; Svelte has not removed its textarea
  // yet when a queued WebKit input lands. The old callback must be rejected.
  await page.evaluate(() => {
    const stale = window.__draftE2EOldTextarea
    window.dispatchEvent(new CustomEvent('arbol-open', { detail: { session_id: 'draft-e2e-b', restore_draft: true } }))
    stale.value = ''
    stale.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
  })
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"]') !== window.__draftE2EOldTextarea)

  await page.waitForFunction(
    ({ sid, expected }) => window.__draftE2E.draft(sid)?.text === expected,
    { sid: 'draft-e2e-a', expected: draftA },
  )
  await textarea.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.value === '')

  // A native app/window blur is another persistence boundary. Do not wait for
  // debounce: verify the blur flush itself stores B.
  await textarea.fill(draftB)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForFunction(
    ({ sid, expected }) => window.__draftE2E.draft(sid)?.text === expected,
    { sid: 'draft-e2e-b', expected: draftB },
  )

  // Reopen both drafted cards exactly as Willo does and assert the production
  // textarea, not merely localStorage or RPC state, contains the right text.
  await openSession('draft-e2e-a')
  await page.waitForFunction((expected) => document.querySelector('[contenteditable="true"]')?.value === expected, draftA)
  assert.equal(await textarea.evaluate((el) => el.value), draftA)
  assert.equal(await storedText('draft-e2e-a'), draftA)

  await openSession('draft-e2e-b')
  await page.waitForFunction((expected) => document.querySelector('[contenteditable="true"]')?.value === expected, draftB)
  assert.equal(await textarea.evaluate((el) => el.value), draftB)
  assert.equal(await storedText('draft-e2e-b'), draftB)

  // A new-chat Draft must remain independent while an existing session attach
  // is awaiting metadata. A focus callback in that gap used to read the outgoing
  // editor DOM back into shared refs; once the target attached, its own correctly
  // scoped Draft could then be populated with text authored in the new chat.
  const arbolRepoRow = page.locator('[role="button"]').filter({ hasText: 'Arbol' }).first()
  await arbolRepoRow.click()
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.value === '')
  const newChatOnly = 'new-chat text must never enter an existing session'
  await textarea.fill(newChatOnly)
  await page.evaluate(() => window.__draftE2E.blockSessionGet('draft-e2e-leak-target'))
  await openSession('draft-e2e-leak-target')
  await page.waitForFunction(() => window.__draftE2E.calls().some((call) =>
    call.method === 'chat_session.get' && call.params.id === 'draft-e2e-leak-target'))
  // Model native focus/visibility delivery while the old keyed Composer is still
  // mounted and the target session's `chat_session.get` response is pending.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.evaluate(() => window.__draftE2E.releaseSessionGet('draft-e2e-leak-target'))
  await page.getByText('Leak Target', { exact: true }).waitFor({ state: 'visible' })
  const leakTargetComposer = page.getByRole('button', { name: /Press Enter to start new message/ })
  await leakTargetComposer.waitFor({ state: 'visible' })
  await leakTargetComposer.click()
  await textarea.waitFor({ state: 'visible' })
  assert.equal(await textarea.evaluate((el) => el.value), '', 'target session composer displayed the new-chat Draft')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(450)
  const leakState = await page.evaluate((text) => window.__draftE2E.draftsWithText(text), newChatOnly)
  assert(leakState.some((draft) => !draft.chat_session_id),
    `the original standalone Draft was not preserved: ${JSON.stringify(leakState)}`)
  assert(!leakState.some((draft) => draft.chat_session_id === 'draft-e2e-leak-target'),
    `new-chat text leaked into the target session: ${JSON.stringify(leakState)}`)

  // Opening a standalone Draft card by its opaque identity must keep writing to
  // that entity. The neutral composer must not mint a repo-scoped duplicate.
  const callCountBeforeWilloOpen = await page.evaluate(() => window.__draftE2E.calls().length)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arbol-open', {
    detail: { draft_id: 'willo-draft-1' },
  })))
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.value === 'opened from Willo')
  // Reopening the same card exercises duplicate native handoffs as well.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arbol-open', {
    detail: { draft_id: 'willo-draft-1' },
  })))
  await page.waitForTimeout(500)
  const willoOpenState = await page.evaluate((start) => ({
    ids: window.__draftE2E.draftIds(),
    calls: window.__draftE2E.calls().slice(start),
  }), callCountBeforeWilloOpen)
  assert.deepEqual(willoOpenState.ids.filter((id) => id === 'willo-draft-1'), ['willo-draft-1'])
  assert(!willoOpenState.calls.some((c) => c.method === 'draft.upsert' && c.params.draft_id !== 'willo-draft-1' && c.params.text === 'opened from Willo'),
    `opening a Willo Draft minted a duplicate: ${JSON.stringify(willoOpenState.calls)}`)

  await openSession('draft-e2e-existing')
  const collapsedComposer = page.getByRole('button', { name: /Press Enter to start new message/ })
  // Esc in a normal reply composer only collapses it. The user's text remains
  // both in the session draft and in the composer when it is expanded again.
  await collapsedComposer.waitFor({ state: 'visible' })
  await collapsedComposer.click()
  const existingDraft = 'Esc must not delete this reply draft'
  await textarea.fill(existingDraft)
  await textarea.press('Escape')
  await collapsedComposer.waitFor({ state: 'visible' })
  await collapsedComposer.click()
  await page.waitForFunction((expected) => document.querySelector('[contenteditable="true"]')?.value === expected, existingDraft)
  assert.equal(await textarea.evaluate((el) => el.value), existingDraft)
  await page.waitForFunction(
    ({ sid, expected }) => window.__draftE2E.draft(sid)?.text === expected,
    { sid: 'draft-e2e-existing', expected: existingDraft },
  )

  const calls = await page.evaluate(() => window.__draftE2E.calls())
  assert(calls.some((c) => c.method === 'draft.upsert' && c.params.text === draftA && c.params.chat_session_id === 'draft-e2e-a'), 'session A was never persisted with its owner')
  assert(calls.some((c) => c.method === 'draft.upsert' && c.params.text === draftB && c.params.chat_session_id === 'draft-e2e-b'), 'session B was never persisted with its owner')
  assert(calls.some((c) => c.method === 'debug.log' && c.params.tag === 'draft.input.skip' && c.params.reason === 'superseded-composer'), 'the stale keyed-composer race was not exercised')
  const acceptedEmptyTransition = calls.find((c) => c.method === 'debug.log' && c.params.tag === 'draft.input.transition' && c.params.fromHasDraft === true && c.params.toHasDraft === false)
  assert(!acceptedEmptyTransition, `a session/UI switch was accepted as an explicit clear: ${JSON.stringify(acceptedEmptyTransition)}`)
  assert(!calls.some((c) => c.method === 'draft.discard'), 'session/UI switching or Esc unexpectedly discarded a draft')
  assert.equal(pageErrors.length, 0, `renderer errors: ${pageErrors.join('; ')}`)

  console.log('draft-session-switch e2e passed')
} finally {
  await browser.close()
  await server.close()
}
