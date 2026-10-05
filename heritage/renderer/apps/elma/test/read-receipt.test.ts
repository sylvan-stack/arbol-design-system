import assert from 'node:assert/strict'
import test from 'node:test'
import { createReadReceipt } from '../src/app/read-receipt'

test('reading again clears unread set after an earlier successful acknowledgement', async () => {
  let unread = true
  let calls = 0
  const read = createReadReceipt(async () => { calls++; unread = false })
  await read('session', 'response')
  unread = true // A later completion reasserts unread for the same response.
  await read('session', 'response') // A projection refresh is not a new read.
  assert.equal(calls, 1)
  assert.equal(unread, true)
  await read('session', 'response', true) // Focus, click, or keypress.
  assert.equal(unread, false)
  assert.equal(calls, 2)
})

test('coalesces in-flight interactions and retries failed acknowledgements', async () => {
  let calls = 0
  const read = createReadReceipt(async () => {
    if (++calls === 1) throw new Error('disconnected')
  })
  const first = read('session', 'response', true)
  assert.equal(read('session', 'response', true), first)
  await assert.rejects(first, /disconnected/)
  await read('session', 'response')
  assert.equal(calls, 2)
})

test('new responses and different sessions receive their own acknowledgement', async () => {
  const sessions: string[] = []
  const read = createReadReceipt(async (id) => { sessions.push(id) })
  await read('one', 'response-1')
  await read('one', 'response-2')
  await read('two', 'response-2')
  assert.deepEqual(sessions, ['one', 'one', 'two'])
})
