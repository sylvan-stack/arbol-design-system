import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bindDraftToComposer,
  deterministicDraftId,
  draftIdForComposer,
  forgetComposerDraftBinding,
  resetProcessDraftBindingsForTests,
} from '../src/app/draft-bindings'

const bindingKey = (identity: string) => `arbol:elma:composer-draft-binding:v1:${identity}`

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

class FailingStorage extends MemoryStorage {
  override getItem(_key: string): string | null { throw new Error('storage unavailable') }
  override setItem(_key: string, _value: string): void { throw new Error('storage unavailable') }
  override removeItem(_key: string): void { throw new Error('storage unavailable') }
}

test('deterministic Draft identity uses the namespaced SHA-256 vector', () => {
  assert.equal(deterministicDraftId('session:s1'), '39a5bb0f-ccb3-814f-8535-4f1a504e4653')
  assert.equal(deterministicDraftId('repo:/repo/Arbol'), '6e7f31fb-82b6-82a6-8136-ec99e839fbfa')
})

test('storage failure keeps one stable process draft identity', () => {
  resetProcessDraftBindingsForTests()
  const storage = new FailingStorage()
  const first = draftIdForComposer(storage, 'session:s1')
  assert.equal(draftIdForComposer(storage, 'session:s1'), first)
})

test('storage failure keeps one stable draft identity across renderer processes', () => {
  resetProcessDraftBindingsForTests()
  const first = draftIdForComposer(new FailingStorage(), 'session:s1')

  // A second Elma process has independent module memory. If WebKit storage is
  // unavailable in both processes, they must still converge on the same Core
  // Draft identity instead of creating one durable row per process.
  resetProcessDraftBindingsForTests()
  const second = draftIdForComposer(new FailingStorage(), 'session:s1')

  assert.equal(second, first)
})

test('an external persistent binding replacement wins over process-local state', () => {
  resetProcessDraftBindingsForTests()
  const storage = new MemoryStorage()
  const first = draftIdForComposer(storage, 'session:s1')

  // Write through Storage directly to represent a different renderer process;
  // do not call bindDraftToComposer, which would also update this module's Map.
  storage.setItem(bindingKey('session:s1'), 'replacement-from-another-window')

  assert.notEqual(first, 'replacement-from-another-window')
  assert.equal(draftIdForComposer(storage, 'session:s1'), 'replacement-from-another-window')
})

test('conditional binding cleanup preserves a replacement binding', () => {
  resetProcessDraftBindingsForTests()
  const storage = new MemoryStorage()
  bindDraftToComposer(storage, 'session:s1', 'old-draft')
  bindDraftToComposer(storage, 'session:s1', 'new-draft')

  assert.equal(forgetComposerDraftBinding(storage, 'session:s1', 'old-draft'), false)
  assert.equal(draftIdForComposer(storage, 'session:s1'), 'new-draft')
  assert.equal(forgetComposerDraftBinding(storage, 'session:s1', 'new-draft'), true)
  assert.notEqual(draftIdForComposer(storage, 'session:s1'), 'new-draft')
})
