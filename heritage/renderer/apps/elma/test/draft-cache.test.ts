import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  discardCachedComposerDraft,
  discardCachedComposerDraftIfUnchanged,
  draftCacheIdentity,
  loadCachedComposerDraft,
  loadCachedDraftForComposer,
  moveCachedComposerDraft,
  newestComposerDraft,
  saveCachedComposerDraft,
} from '../src/app/draft-cache'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('cache identity is session scoped and supports a pre-session repo draft', () => {
  assert.equal(draftCacheIdentity('s1', '/repo/a', 'a'), 'session:s1')
  assert.equal(draftCacheIdentity(null, '/repo/a', 'a'), 'repo:/repo/a')
})

test('composer snapshot is synchronously available after a window switch', () => {
  const storage = new MemoryStorage()
  saveCachedComposerDraft(storage, 'session:s1', { text: 'unfinished', attachments: [], updatedAt: 10 })
  const loaded = loadCachedComposerDraft(storage, 'session:s1')
  assert.equal(loaded?.text, 'unfinished')
  assert.deepEqual(loaded?.attachments, [])
  assert.equal(loaded?.updatedAt, 10)
  assert.ok(loaded?.snapshotId)
})

test('pre-session cache moves to the created session', () => {
  const storage = new MemoryStorage()
  saveCachedComposerDraft(storage, 'repo:/repo/a', { text: 'new chat', attachments: [], updatedAt: 20 })
  assert.equal(moveCachedComposerDraft(storage, 'repo:/repo/a', 'session:s1')?.text, 'new chat')
  assert.equal(loadCachedComposerDraft(storage, 'repo:/repo/a'), null)
  assert.equal(loadCachedComposerDraft(storage, 'session:s1')?.text, 'new chat')
})

test('newest snapshot wins and explicit discard removes only its session', () => {
  const storage = new MemoryStorage()
  const durable = { text: 'server', attachments: [], updatedAt: 10 }
  const cached = { text: 'last keystroke', attachments: [], updatedAt: 11 }
  assert.equal(newestComposerDraft(durable, cached)?.text, 'last keystroke')
  saveCachedComposerDraft(storage, 'session:s1', cached)
  saveCachedComposerDraft(storage, 'session:s2', durable)
  discardCachedComposerDraft(storage, 'session:s1')
  assert.equal(loadCachedComposerDraft(storage, 'session:s1'), null)
  assert.equal(loadCachedComposerDraft(storage, 'session:s2')?.text, 'server')
})


test('existing Chat Session never restores the independent new-chat Draft', () => {
  const storage = new MemoryStorage()
  saveCachedComposerDraft(storage, 'repo:/repo/a', {
    text: 'new chat only',
    attachments: [],
  })

  assert.equal(loadCachedDraftForComposer(storage, 'session-a', '/repo/a', 'a'), null)
  assert.equal(loadCachedDraftForComposer(storage, null, '/repo/a', 'a')?.text, 'new chat only')
})


test('successful send cleanup cannot erase a newer window snapshot', () => {
  const storage = new MemoryStorage()
  const sent = saveCachedComposerDraft(storage, 'session:s1', {
    text: 'submitted text', attachments: [], updatedAt: 10,
  })
  const newer = saveCachedComposerDraft(storage, 'session:s1', {
    text: 'new text from another window', attachments: [], updatedAt: 10,
  })

  assert.equal(discardCachedComposerDraftIfUnchanged(storage, 'session:s1', sent.snapshotId || ''), false)
  assert.equal(loadCachedComposerDraft(storage, 'session:s1')?.snapshotId, newer.snapshotId)
  assert.equal(loadCachedComposerDraft(storage, 'session:s1')?.text, 'new text from another window')
  assert.equal(discardCachedComposerDraftIfUnchanged(storage, 'session:s1', newer.snapshotId || ''), true)
  assert.equal(loadCachedComposerDraft(storage, 'session:s1'), null)
})


test('Chat Notes are part of the synchronous Draft snapshot', () => {
  const storage = new MemoryStorage()
  saveCachedComposerDraft(storage, 'repo:/repo/a', {
    text: '', attachments: [], chatNotes: ['context'],
  })
  assert.deepEqual(loadCachedComposerDraft(storage, 'repo:/repo/a')?.chatNotes, ['context'])
})
