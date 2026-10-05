import { test } from 'node:test'
import assert from 'node:assert/strict'

import { addOrReplaceTag, applyTagInput, cockpitTags, defaultTagSymbol, matchingTagSuggestion, parseTagToken, removeTag, withTagSymbol } from '../src/chat/sessionTags'

test('Chat Session tags parse plain names and name=value metadata', () => {
  assert.deepEqual(parseTagToken('review'), { name: 'review' })
  assert.deepEqual(parseTagToken('priority=high'), { name: 'priority', value: 'high' })
  assert.equal(parseTagToken('priority='), null)
  assert.equal(parseTagToken('not valid'), null)
})

test('duplicate tag names are replaced case-insensitively', () => {
  assert.deepEqual(
    addOrReplaceTag([{ name: 'Priority', value: 'low' }], { name: 'priority', value: 'high' }),
    [{ name: 'priority', value: 'high' }],
  )
})

test('leading equals assigns a value to the immediately preceding rendered tag', () => {
  assert.deepEqual(
    applyTagInput([{ name: 'review' }, { name: 'priority' }], '=high'),
    [{ name: 'review' }, { name: 'priority', value: 'high' }],
  )
  assert.deepEqual(
    applyTagInput([{ name: 'priority', value: 'low' }], '=high'),
    [{ name: 'priority', value: 'high' }],
  )
  assert.equal(applyTagInput([], '=high'), null)
  assert.equal(applyTagInput([{ name: 'priority' }], '='), null)
})

test('normal tag input remains supported when applying input', () => {
  assert.deepEqual(
    applyTagInput([{ name: 'review' }], 'priority=high'),
    [{ name: 'review' }, { name: 'priority', value: 'high' }],
  )
})

test('repo suggestions complete an unused prefix', () => {
  assert.equal(matchingTagSuggestion(['priority', 'review'], 'pri', []), 'priority')
  assert.equal(matchingTagSuggestion(['priority'], 'pri', [{ name: 'Priority' }]), null)
  assert.equal(matchingTagSuggestion(['priority'], 'priority=', []), null)
})


test('Meta Cockpit leads with active and inactive VIP tags before ordinary tags', () => {
  assert.deepEqual(
    cockpitTags(
      [{ name: 'review' }, { name: 'priority', value: 'high' }],
      [{ name: 'blocked', vip: true }, { name: 'priority', vip: true }],
    ),
    [
      { tag: { name: 'blocked' }, vip: true, active: false },
      { tag: { name: 'priority', value: 'high' }, vip: true, active: true },
      { tag: { name: 'review' }, vip: false, active: true },
    ],
  )
})

test('Meta Cockpit removes tags case-insensitively', () => {
  assert.deepEqual(removeTag([{ name: 'Review' }, { name: 'priority' }], 'review'), [{ name: 'priority' }])
})


test('Willo symbols default to four name characters and accept configurable 3–4 character badges', () => {
  assert.equal(defaultTagSymbol('priority'), 'PRIO')
  assert.equal(defaultTagSymbol('go'), 'GO·')
  assert.deepEqual(withTagSymbol({ name: 'priority' }, 'P1!'), { name: 'priority', symbol: 'P1!' })
  assert.deepEqual(withTagSymbol({ name: 'review' }, ''), { name: 'review', symbol: 'REVI' })
  assert.equal(withTagSymbol({ name: 'priority' }, 'P'), null)
  assert.equal(withTagSymbol({ name: 'priority' }, 'FIVE!'), null)
})


test('VIP short codes survive deactivation, reactivation, and another chat', () => {
  const definitions = [{ name: 'priority', vip: true, symbol: 'P1!' }]
  const initial = [{ name: 'Priority', symbol: 'P1!', value: 'high' }]
  const inactive = cockpitTags(removeTag(initial, 'priority'), definitions)[0]
  assert.deepEqual(inactive, {
    tag: { name: 'priority', symbol: 'P1!' }, vip: true, active: false,
  })
  const reactivated = addOrReplaceTag([], inactive.tag)
  assert.deepEqual(cockpitTags(reactivated, definitions)[0], {
    tag: { name: 'priority', symbol: 'P1!' }, vip: true, active: true,
  })
  assert.equal(cockpitTags([], definitions)[0].tag.symbol, 'P1!')
  assert.equal(cockpitTags(initial, definitions)[0].tag.value, 'high')
})
