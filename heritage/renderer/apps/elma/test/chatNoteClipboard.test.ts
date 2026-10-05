import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAT_NOTE_CLIPBOARD_HEADER, copyableChatNote, pastedChatNoteContent } from '../src/chat/chatNoteClipboard'

test('extracts content when the clipboard marker is the complete first line', () => {
  assert.equal(pastedChatNoteContent(`${CHAT_NOTE_CLIPBOARD_HEADER}\n# Context\nDetails`), '# Context\nDetails')
  assert.equal(pastedChatNoteContent(`${CHAT_NOTE_CLIPBOARD_HEADER}\r\nWindows text`), 'Windows text')
})

test('does not reinterpret ordinary text or a marker later in the block', () => {
  assert.equal(pastedChatNoteContent('ordinary text'), null)
  assert.equal(pastedChatNoteContent(`prefix\n${CHAT_NOTE_CLIPBOARD_HEADER}\ncontent`), null)
  assert.equal(pastedChatNoteContent(`${CHAT_NOTE_CLIPBOARD_HEADER} extra\ncontent`), null)
})

test('composes the portable Chat Note clipboard format', () => {
  assert.equal(copyableChatNote('content'), '### Chat Note ###\ncontent')
})
