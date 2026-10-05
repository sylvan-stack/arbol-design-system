import { test } from 'node:test'
import assert from 'node:assert/strict'

import { enabledThinkingLevels, modelAfterOptionsRefresh, nextModelSelection, thinkingAfterModelChange } from '../src/app/model-selection'

const options = [{ value: 'model-a' }, { value: 'model-b' }]

test('keeps an explicit model while the attached IP is temporarily unresolved', () => {
  assert.equal(modelAfterOptionsRefresh('model-b', false, [{ value: 'model-a' }]), 'model-b')
  assert.equal(modelAfterOptionsRefresh('model-b', false, []), 'model-b')
})

test('keeps an explicit model allowed by the resolved IP', () => {
  assert.equal(modelAfterOptionsRefresh('model-b', true, options), 'model-b')
})

test('clears a model that is invalid for a resolved IP', () => {
  assert.equal(modelAfterOptionsRefresh('old-provider-model', true, options), '')
})

test('keeps the provider-default selection', () => {
  assert.equal(modelAfterOptionsRefresh('', true, options), '')
})

test('cycles immediately from the implicitly displayed provider default', () => {
  assert.equal(nextModelSelection('model-a', options), 'model-b')
  assert.equal(nextModelSelection('model-b', options), 'model-a')
})

test('selects the first model when the displayed model is not in the options', () => {
  assert.equal(nextModelSelection('unknown', options), 'model-a')
  assert.equal(nextModelSelection('model-a', []), '')
})


test('uses the model-specific thinking allow-list and keeps legacy settings unrestricted', () => {
  const settings = { fable: ['medium', 'high'], haiku: ['none', 'minimum'], spark: ['none'] }
  assert.deepEqual(enabledThinkingLevels(settings, 'fable'), ['medium', 'high'])
  assert.deepEqual(enabledThinkingLevels(settings, 'spark'), ['none'])
  assert.deepEqual(enabledThinkingLevels(settings, 'unknown'), ['none', 'minimum', 'medium', 'high', 'xhigh', 'max', 'ultra'])
})

test('moves to the first allowed level when a model switch invalidates thinking', () => {
  assert.equal(thinkingAfterModelChange('high', ['none', 'minimum']), 'none')
  assert.equal(thinkingAfterModelChange('medium', ['medium', 'high']), 'medium')
})
