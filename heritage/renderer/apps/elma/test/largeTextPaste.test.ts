import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LARGE_TEXT_PASTE_THRESHOLD,
  isLargeTextPaste,
  pastedTextFileLink,
} from '../src/chat/largeTextPaste'

test('only redirects text at or above the large-paste threshold', () => {
  assert.equal(isLargeTextPaste('x'.repeat(LARGE_TEXT_PASTE_THRESHOLD - 1)), false)
  assert.equal(isLargeTextPaste('x'.repeat(LARGE_TEXT_PASTE_THRESHOLD)), true)
})

test('builds a readable local-file Markdown link', () => {
  assert.equal(
    pastedTextFileLink('/tmp/Arbol/pasted-text/example.txt', 12_345),
    '[Pasted text (12,345 characters)](/tmp/Arbol/pasted-text/example.txt)',
  )
})
