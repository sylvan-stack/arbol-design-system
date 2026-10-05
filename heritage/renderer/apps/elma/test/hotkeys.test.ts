import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isArchiveSessionHotkey } from '../src/app/hotkeys'

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'Backspace',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent
}

test('Cmd+Backspace is the archive session hotkey', () => {
  assert.equal(isArchiveSessionHotkey(key()), true)
})

test('archive hotkey rejects missing Cmd and additional modifiers', () => {
  assert.equal(isArchiveSessionHotkey(key({ metaKey: false })), false)
  assert.equal(isArchiveSessionHotkey(key({ shiftKey: true })), false)
  assert.equal(isArchiveSessionHotkey(key({ altKey: true })), false)
  assert.equal(isArchiveSessionHotkey(key({ ctrlKey: true })), false)
})

test('archive hotkey rejects other Cmd keys', () => {
  assert.equal(isArchiveSessionHotkey(key({ key: 'Delete' })), false)
})
