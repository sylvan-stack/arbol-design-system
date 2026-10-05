import { test } from 'node:test'
import assert from 'node:assert/strict'

import { finalAnswerOpeningSpacer, openedChatScrollTarget, responseIsCompleted, scrolledToBottom, scrolledUp } from '../src/chat/autoscroll'

test('an upward scroll disables following while layout jitter does not', () => {
  assert.equal(scrolledUp(500, 480), true)
  assert.equal(scrolledUp(500, 499.5), false)
  assert.equal(scrolledUp(500, 520), false)
})

test('reaching the bottom is detected despite sub-pixel rounding', () => {
  assert.equal(scrolledToBottom(700, 1000, 300), true)
  assert.equal(scrolledToBottom(699.5, 1000, 300), true)
  assert.equal(scrolledToBottom(698, 1000, 300), false)
})



test('only explicit null means the response is still generating', () => {
  assert.equal(responseIsCompleted(null), false)
  assert.equal(responseIsCompleted(1_700_000_000_000), true)
  assert.equal(responseIsCompleted(undefined), true)
})

test('an opened completed chat targets its final answer', () => {
  assert.equal(openedChatScrollTarget(true, true), 'final-answer')
  assert.equal(openedChatScrollTarget(false, true), 'bottom')
  assert.equal(openedChatScrollTarget(true, false), 'bottom')
})


test('completed chat adds enough trailing space to align the final-answer separator at the top', () => {
  // The separator starts at 700, but 1000px of content in a 500px viewport can
  // normally scroll only to 500. The extra 200px makes scrollTop=700 reachable.
  assert.equal(finalAnswerOpeningSpacer(700, 1000, 500), 200)
  assert.equal(finalAnswerOpeningSpacer(300, 1000, 500), 0)

  // Recalculation excludes an existing spacer rather than growing repeatedly.
  assert.equal(finalAnswerOpeningSpacer(700, 1200, 500, 200), 200)
})
