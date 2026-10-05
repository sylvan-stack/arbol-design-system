import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadChatScrollPosition, saveChatScrollPosition } from '../src/app/scroll-cache'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('scroll positions are saved independently for every chat session', () => {
  const storage = new MemoryStorage()
  saveChatScrollPosition(storage, 'session-one', 420)
  saveChatScrollPosition(storage, 'session-two', 75.5)

  assert.equal(loadChatScrollPosition(storage, 'session-one'), 420)
  assert.equal(loadChatScrollPosition(storage, 'session-two'), 75.5)
})

test('missing or invalid scroll positions restore to the top', () => {
  const storage = new MemoryStorage()
  assert.equal(loadChatScrollPosition(storage, 'missing'), 0)

  storage.setItem('arbol:elma:chat-scroll:v1:broken', 'not-a-number')
  assert.equal(loadChatScrollPosition(storage, 'broken'), 0)
})

test('negative scroll positions are clamped', () => {
  const storage = new MemoryStorage()
  saveChatScrollPosition(storage, 'session', -100)
  assert.equal(loadChatScrollPosition(storage, 'session'), 0)
})
