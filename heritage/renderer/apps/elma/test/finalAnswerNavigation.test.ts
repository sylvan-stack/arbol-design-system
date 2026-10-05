import { test } from 'node:test'
import assert from 'node:assert/strict'

import { finalAnswerScrollTop, isAnswerThresholdBelowViewport, isAnswerThresholdVisible, nextResponseScrollTop } from '../src/chat/finalAnswerNavigation'

function scrollerAt(scrollTop: number, answerTop: number | null = 600) {
  const scrollerTop = 100
  const marker = answerTop === null
    ? null
    : { getBoundingClientRect: () => ({
        top: scrollerTop + answerTop - scrollTop,
        bottom: scrollerTop + answerTop - scrollTop + 100,
      }) }
  return {
    scrollTop,
    scrollHeight: 1400,
    clientHeight: 400,
    getBoundingClientRect: () => ({ top: scrollerTop, bottom: scrollerTop + 400 }),
    querySelector: () => marker,
  } as unknown as HTMLElement
}

test('final answer position is resolved in scroll-container coordinates', () => {
  assert.equal(finalAnswerScrollTop(scrollerAt(200)), 600)
})

test('down navigation visits final answer before response end', () => {
  assert.equal(nextResponseScrollTop(scrollerAt(0), 'down'), 600)
  assert.equal(nextResponseScrollTop(scrollerAt(600), 'down'), 1000)
})

test('up navigation visits final answer before activity start', () => {
  assert.equal(nextResponseScrollTop(scrollerAt(1000), 'up'), 600)
  assert.equal(nextResponseScrollTop(scrollerAt(600), 'up'), 0)
})

test('navigation falls back to edges when no answer threshold exists', () => {
  assert.equal(nextResponseScrollTop(scrollerAt(300, null), 'down'), 1000)
  assert.equal(nextResponseScrollTop(scrollerAt(300, null), 'up'), 0)
})

test('answer threshold is visible when any pixels overlap the viewport', () => {
  assert.equal(isAnswerThresholdVisible(scrollerAt(201)), true) // first pixel enters at the bottom
  assert.equal(isAnswerThresholdVisible(scrollerAt(699)), true) // first pixel remains at the top
})

test('answer threshold is not visible when absent or only touching a viewport edge', () => {
  assert.equal(isAnswerThresholdVisible(scrollerAt(200)), false) // threshold starts at bottom edge
  assert.equal(isAnswerThresholdVisible(scrollerAt(700)), false) // threshold ends at top edge
  assert.equal(isAnswerThresholdVisible(scrollerAt(300, null)), false)
})


test('answer threshold is below the viewport only before the reader reaches it', () => {
  assert.equal(isAnswerThresholdBelowViewport(scrollerAt(199)), true)
  assert.equal(isAnswerThresholdBelowViewport(scrollerAt(200)), true) // touching the bottom edge
  assert.equal(isAnswerThresholdBelowViewport(scrollerAt(201)), false) // first pixel is visible
  assert.equal(isAnswerThresholdBelowViewport(scrollerAt(700)), false) // threshold is above viewport
  assert.equal(isAnswerThresholdBelowViewport(scrollerAt(300, null)), false)
})
