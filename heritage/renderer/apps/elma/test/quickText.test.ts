import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expandQuickText } from '../src/chat/quickText'

test('leaves ordinary text and newlines unchanged', () => {
  assert.deepEqual(expandQuickText('First line\n\nThird line'), {
    text: 'First line\n\nThird line',
    submit: false,
  })
})

test('removes an ENTER token and requests submission', () => {
  assert.deepEqual(expandQuickText('Send this[ENTER]'), {
    text: 'Send this',
    submit: true,
  })
})

test('recognizes ENTER anywhere and removes every occurrence', () => {
  assert.deepEqual(expandQuickText('[ENTER]one[ENTER]two'), {
    text: 'onetwo',
    submit: true,
  })
})

test('treats differently cased text as literal content', () => {
  assert.deepEqual(expandQuickText('Keep [enter]'), {
    text: 'Keep [enter]',
    submit: false,
  })
})
