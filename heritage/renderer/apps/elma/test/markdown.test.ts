import { test } from 'vitest'
import assert from 'node:assert/strict'

import { parseMarkdown } from '../../../packages/design-system/src/markdown/blocks'

test('tilde fences render as code blocks', () => {
  assert.deepEqual(
    parseMarkdown('Before\n\n~~~text\nconst answer = 42\n~~~\n\nAfter'),
    [
      { t: 'p', v: 'Before' },
      { t: 'code', v: 'const answer = 42' },
      { t: 'p', v: 'After' },
    ],
  )
})

test('tilde fences remain formatted while streaming without a closing fence', () => {
  assert.deepEqual(
    parseMarkdown('~~~ts\nconst streaming = true'),
    [{ t: 'code', v: 'const streaming = true' }],
  )
})

test('a tilde fence only closes with a matching fence of sufficient length', () => {
  assert.deepEqual(
    parseMarkdown('~~~~text\nfirst\n```\n~~~\nlast\n~~~~'),
    [{ t: 'code', v: 'first\n```\n~~~\nlast' }],
  )
})

test('backtick fences continue to render as code blocks', () => {
  assert.deepEqual(
    parseMarkdown('```js\nconsole.log("ok")\n```'),
    [{ t: 'code', v: 'console.log("ok")' }],
  )
})

test('consecutive blockquote lines become a highlighted quote block', () => {
  assert.deepEqual(
    parseMarkdown('Before\n\n> **Arbol grows** from durable context.\n> It keeps the next line in the same thought.\n\nAfter'),
    [
      { t: 'p', v: 'Before' },
      { t: 'quote', v: '**Arbol grows** from durable context. It keeps the next line in the same thought.' },
      { t: 'p', v: 'After' },
    ],
  )
})

test('a standalone em dash becomes an Arbol separator', () => {
  assert.deepEqual(
    parseMarkdown('Canopy\n\n—\n\nRoots'),
    [
      { t: 'p', v: 'Canopy' },
      { t: 'separator' },
      { t: 'p', v: 'Roots' },
    ],
  )
})

test('em dashes inside prose remain prose', () => {
  assert.deepEqual(
    parseMarkdown('Canopy — roots'),
    [{ t: 'p', v: 'Canopy — roots' }],
  )
})

test('separator and quote markers inside code fences remain code', () => {
  assert.deepEqual(
    parseMarkdown('```md\n> quoted source\n—\n```'),
    [{ t: 'code', v: '> quoted source\n—' }],
  )
})

test('ordered lists preserve their authored starting number across intervening blocks', () => {
  assert.deepEqual(
    parseMarkdown('1. First item\n\n```text\nexample\n```\n\n2. Second item\n\n- detail\n\n3. Third item'),
    [
      { t: 'ol', v: ['First item'] },
      { t: 'code', v: 'example' },
      { t: 'ol', v: ['Second item'], start: 2 },
      { t: 'ul', v: ['detail'] },
      { t: 'ol', v: ['Third item'], start: 3 },
    ],
  )
})

test('a standalone ordered list can start at a number other than one', () => {
  assert.deepEqual(
    parseMarkdown('4) Fourth\n5) Fifth'),
    [{ t: 'ol', v: ['Fourth', 'Fifth'], start: 4 }],
  )
})
