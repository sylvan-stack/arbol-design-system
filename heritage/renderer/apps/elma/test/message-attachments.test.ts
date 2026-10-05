import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMessageAttachments } from '../src/app/message-attachments'
import { editReplacementParams } from '../src/app/submissions'

test('retry resolves persisted transcript image references to the inline RPC contract', async () => {
  const stored = { sha256: 'image-hash', mime_type: 'image/png', byte_len: 3, filename: 'screenshot.png' }
  const reads: string[] = []
  const attachments = await resolveMessageAttachments([stored], async (sha) => {
    reads.push(sha)
    return { mime_type: 'image/png', data: 'YWJj', byte_len: 3 }
  })
  const request = editReplacementParams({
    sessionId: 'session', turnId: 'failed', text: '', submissionId: 'retry', attachments,
  })
  assert.deepEqual(reads, ['image-hash'])
  assert.deepEqual(request.attachments, [
    { type: 'image', mime_type: 'image/png', data: 'YWJj', name: 'screenshot.png', size: 3 },
  ])
  assert.equal('data' in stored, false, 'hydration must not mutate the transcript')
})

test('mixed stored and fresh images preserve attachment order and skip inline blob reads', async () => {
  const inline = { type: 'image' as const, mime_type: 'image/jpeg', data: 'aW1n', name: 'new.jpg' }
  const result = await resolveMessageAttachments([
    { sha256: 'first', mime_type: 'image/png', filename: 'first.png' }, inline,
    { sha256: 'last', mime_type: 'image/png', filename: 'last.png' },
  ], async (sha) => ({ mime_type: 'image/png', data: sha, byte_len: 3 }))
  assert.deepEqual(result.map((image) => image.name), ['first.png', 'new.jpg', 'last.png'])
  assert.equal(result[1], inline)
})

test('missing stored images fail the whole submission rather than silently removing the image', async () => {
  await assert.rejects(resolveMessageAttachments([
    { sha256: 'missing', mime_type: 'image/png', filename: 'screenshot.png' },
  ], async () => { throw new Error('blob not found') }), /Could not load attached image screenshot.png: blob not found/)
})

test('text-only turns do not read blobs', async () => {
  assert.deepEqual(await resolveMessageAttachments(undefined, async () => { throw new Error('unexpected read') }), [])
})
