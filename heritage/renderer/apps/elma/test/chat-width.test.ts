import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  clampChatWidth,
} from '../src/app/chat-width'

test('chat width defaults when the stored value is invalid', () => {
  assert.equal(clampChatWidth(Number.NaN), DEFAULT_CHAT_WIDTH)
})

test('chat width is clamped to usable wide-monitor bounds', () => {
  assert.equal(clampChatWidth(MIN_CHAT_WIDTH - 1), MIN_CHAT_WIDTH)
  assert.equal(clampChatWidth(MAX_CHAT_WIDTH + 1), MAX_CHAT_WIDTH)
  assert.equal(clampChatWidth(1080.4), 1080)
})
