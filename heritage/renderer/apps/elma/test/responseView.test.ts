import { test } from 'node:test'
import assert from 'node:assert/strict'

import { finalAnswerStartIndex, finalAnswerText, formatFailureTime, formatThinkingMarkdown, formatToolCallDuration, mergeNativeFallback, nativeCallState, nativeCallTimerLabel, nativeResultText, nativeToolOutputPreview, normalizeSettledAnswerOrder, normalizeThinking, prettyJsonText, deferredRenderEvidence, verifyDeferredToolContent } from '../src/chat/responseView'

test('native input objects are pretty-printed with two-space indentation', () => {
  assert.equal(
    prettyJsonText({ command: 'echo ok', nested: { enabled: true } }),
    '{\n  "command": "echo ok",\n  "nested": {\n    "enabled": true\n  }\n}',
  )
})

test('JSON encoded in native output content is pretty-printed', () => {
  assert.equal(
    nativeResultText({ content: '{"ok":true,"items":[1,2]}' }),
    '{\n  "ok": true,\n  "items": [\n    1,\n    2\n  ]\n}',
  )
})

test('native result envelopes are pretty-printed', () => {
  assert.equal(
    nativeResultText({ ok: true, stdout: 'done\n' }),
    '{\n  "ok": true,\n  "stdout": "done\\n"\n}',
  )
})

test('plain and invalid-JSON tool output remains plain text', () => {
  assert.equal(nativeResultText({ content: 'NATIVE_BASH_OK\n' }), 'NATIVE_BASH_OK')
  assert.equal(prettyJsonText('{not json}\n'), '{not json}')
})


test('thinking normalization preserves generated whitespace and token text', () => {
  assert.deepEqual(normalizeThinking(['  first\n', '   ', '\tsecond  ']), ['  first\n', '\tsecond  '])
  assert.deepEqual(normalizeThinking('  one thought  '), ['  one thought  '])
})


test('adjacent bold thinking statuses get readable paragraph boundaries', () => {
  assert.equal(
    formatThinkingMarkdown('**Inspecting logs****Planning fix****Verifying tests**'),
    '**Inspecting logs**\n\n**Planning fix**\n\n**Verifying tests**',
  )
  assert.equal(formatThinkingMarkdown('Keep **ordinary emphasis** inline.'), 'Keep **ordinary emphasis** inline.')
})


test('native Bash calls resolve their live output preview by request id or command alias', () => {
  const preview = { status: 'running' as const, stdout: 'collecting...\n' }
  const call = {
    tool_use_id: 'call-output', turn_id: 'turn-1', tool_name: 'Bash',
    input: { id: 'bash-output', command: 'pytest -q' }, ok: null, invoked_ts: 1_000,
  } as any
  assert.equal(nativeToolOutputPreview(call, { 'bash-output': preview }), preview)
  assert.equal(nativeToolOutputPreview(
    { ...call, input: { command: 'pytest -q' } },
    { 'bash:pytest -q': preview },
  ), preview)
  assert.equal(nativeToolOutputPreview(call, {}), undefined)
})


test('Bash feedback checkpoint is informational rather than failed', () => {
  const checkpoint = {
    tool_use_id: 'call-checkpoint', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: './scripts/rebuild-and-restart.sh' }, ok: false, invoked_ts: 1_000,
    error: 'tool call reached its 5 minutes feedback checkpoint; the command is still running',
  } as any
  assert.equal(nativeCallState(checkpoint), 'checkpoint')
  assert.equal(nativeCallState({ ...checkpoint, error: 'command exited with status 1' }), 'failed')
  assert.equal(nativeCallState({ ...checkpoint, tool_name: 'Read' }), 'failed')
})


test('expanded tool-call duration keeps useful precision for short calls', () => {
  assert.equal(formatToolCallDuration(384), '384ms')
  assert.equal(formatToolCallDuration(1_250), '1.3s')
  assert.equal(formatToolCallDuration(12_999), '13s')
  assert.equal(formatToolCallDuration(80_000), '1:20')
})


test('native tool timer stays hidden through one minute and appears afterward', () => {
  const call = {
    tool_use_id: 'call-timer', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: 'sleep 61' }, ok: null, invoked_ts: 1_000,
  }
  assert.equal(nativeCallTimerLabel(call, 60_999), null)
  assert.equal(nativeCallTimerLabel(call, 61_000), null)
  assert.equal(nativeCallTimerLabel(call, 61_001), '1:00')
  assert.equal(nativeCallTimerLabel(call, 62_000), '1:01')
})


test('native tool timer hides short settled calls and freezes durations over one minute', () => {
  const base = {
    tool_use_id: 'call-settled', turn_id: 'turn-1', tool_name: 'Read',
    input: { file_path: '/tmp/a' }, ok: true, invoked_ts: 5_000,
  }
  assert.equal(nativeCallTimerLabel({ ...base, settled_ts: 5_634 }, 999_999), null)
  assert.equal(nativeCallTimerLabel({ ...base, settled_ts: 64_000 }, 999_999), null)
  assert.equal(nativeCallTimerLabel({ ...base, settled_ts: 65_000 }, 999_999), null)
  assert.equal(nativeCallTimerLabel({ ...base, settled_ts: 65_001 }, 999_999), '1:00')
  assert.equal(nativeCallTimerLabel({ ...base, settled_ts: 3_665_000 }, 999_999), '1:01:00')
})


test('native tool timer treats missing invocation timestamps as just received', () => {
  const call = {
    tool_use_id: 'call-missing-ts', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: 'sleep 80' }, ok: null,
  } as any
  assert.equal(nativeCallTimerLabel(call, 90_000), null)
})


test('final answer starts at the first prose block after the last activity block', () => {
  const blocks = [
    { t: 'p', v: 'I will inspect it.' },
    { t: 'thinking', v: 'Checking.' },
    { t: 'native', call: { tool_use_id: 'c', turn_id: 't', tool_name: 'Read', input: {}, ok: true, invoked_ts: 1 } },
    { t: 'h', v: 'Result' },
    { t: 'p', v: 'The answer.' },
  ] as any
  assert.equal(finalAnswerStartIndex(blocks), 3)
})

test('every completed non-empty response has a final-answer boundary', () => {
  assert.equal(finalAnswerStartIndex([{ t: 'p', v: 'A direct answer.' }]), 0)
  assert.equal(finalAnswerStartIndex([{ t: 'thinking', v: 'Activity without prose.' }]), 1)
  assert.equal(finalAnswerStartIndex([]), -1)
})


test('final answer copy text excludes reasoning and native tool calls', () => {
  const blocks = [
    { t: 'thinking', v: 'Inspecting private reasoning.' },
    { t: 'native', call: { tool_use_id: 'c', turn_id: 't', tool_name: 'Read', input: {}, ok: true, invoked_ts: 1 } },
    { t: 'h', v: 'Result' },
    { t: 'p', v: 'The final answer.' },
    { t: 'ul', v: ['One', 'Two'] },
    { t: 'code', v: 'const done = true' },
  ] as any
  assert.equal(
    finalAnswerText(blocks),
    '# Result\n\nThe final answer.\n\n- One\n- Two\n\n```\nconst done = true\n```',
  )
})


test('failure timestamps include the date and second-level time', () => {
  const formatted = formatFailureTime(Date.UTC(2024, 0, 2, 3, 4, 5), 'en-US')
  assert.match(formatted, /2024/)
  assert.match(formatted, /:04:05/)
  assert.equal(formatFailureTime(Number.NaN, 'en-US'), '')
})


test('settled fallback native calls precede prose even when timestamps put them later', () => {
  const call = {
    tool_use_id: 'call-1', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: 'printf ok' }, ok: true, invoked_ts: 200,
  } as any
  const blocks = mergeNativeFallback(
    [{ t: 'p', v: 'Final answer.' }],
    [call],
    50,
    75,
    100,
  )
  assert.deepEqual(blocks.map((block: any) => block.t), ['native', 'p'])
  assert.equal(finalAnswerStartIndex(blocks), 1)
})


test('settled inline native activity cannot remain below the final answer', () => {
  const call = {
    tool_use_id: 'call-late', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: 'printf ok' }, ok: true, invoked_ts: 200, seq: 12,
  } as any
  const blocks = normalizeSettledAnswerOrder([
    { t: 'p', v: 'Native tool call completed successfully.' },
    { t: 'native', call },
  ] as any)
  assert.deepEqual(blocks.map((block: any) => block.t), ['native', 'p'])
  assert.equal(finalAnswerStartIndex(blocks), 1)
})


test('settled ordering keeps all activity above the threshold and all prose below it', () => {
  const call = (id: string) => ({
    tool_use_id: id, turn_id: 'turn-1', tool_name: 'Read', input: {},
    ok: true, invoked_ts: 100,
  }) as any
  const blocks = normalizeSettledAnswerOrder([
    { t: 'p', v: 'I will inspect it.' },
    { t: 'native', call: call('first') },
    { t: 'h', v: 'Result' },
    { t: 'p', v: 'The final answer.' },
    { t: 'native', call: call('late') },
  ] as any)
  assert.deepEqual(blocks.map((block: any) => block.t), ['native', 'native', 'p', 'h', 'p'])
  assert.equal(finalAnswerStartIndex(blocks), 2)
})


test('settled ordering handles non-prose metadata after a late native call', () => {
  const call = {
    tool_use_id: 'call-with-sources', turn_id: 'turn-1', tool_name: 'Bash',
    input: { command: 'printf ok' }, ok: true, invoked_ts: 200,
  } as any
  const blocks = normalizeSettledAnswerOrder([
    { t: 'p', v: 'Native tool call completed successfully.' },
    { t: 'native', call },
    { t: 'sources', v: [] },
  ] as any)
  assert.deepEqual(blocks.map((block: any) => block.t), ['native', 'p', 'sources'])
  assert.equal(finalAnswerStartIndex(blocks), 1)
})

test('externalized tool content renders only after complete digest verification', async () => {
  const { createHash, webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  const body = Buffer.from(JSON.stringify({ format: 'arbol-tool-settlement-json-v1', result: { stdout: 'verified' } }))
  const digest = createHash('sha256').update(body).digest('hex')
  const value = await verifyDeferredToolContent([{
    data: body.toString('base64'), offset: 0, next_offset: body.length, complete: true,
    total_bytes: body.length, sha256: digest, content_format: 'arbol-tool-settlement-json-v1',
  }], digest, body.length)
  assert.deepEqual(value.result, { stdout: 'verified' })
  const damaged = Buffer.from(body); damaged[damaged.length - 2] ^= 1
  await assert.rejects(() => verifyDeferredToolContent([{
    data: damaged.toString('base64'), offset: 0, next_offset: damaged.length, complete: true,
    total_bytes: damaged.length, sha256: digest, content_format: 'arbol-tool-settlement-json-v1',
  }], digest, damaged.length), /digest mismatch/)
})


test('deferred telemetry correlates multi-page ranges and successful validation ordering', async () => {
  const { createHash, webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  const body = Buffer.from(JSON.stringify({ format: 'arbol-tool-settlement-json-v1', result: { stdout: 'verified' } }))
  const digest = createHash('sha256').update(body).digest('hex')
  const split = 17
  const pages = [body.subarray(0, split), body.subarray(split)].map((chunk, index) => {
    const offset = index ? split : 0
    return {
      data: chunk.toString('base64'), offset, next_offset: offset + chunk.length,
      complete: index === 1, total_bytes: body.length, sha256: digest,
      content_format: 'arbol-tool-settlement-json-v1',
      continuation: index === 0 ? 'raw-secret-must-not-be-observed' : null,
    }
  })
  const evidence: any[] = []
  await verifyDeferredToolContent(pages, digest, body.length, (event) => evidence.push(event))
  assert.deepEqual(evidence.filter((event) => event.stage === 'range_validated').map((event) => ({
    requested: event.requested_offset, returned: event.returned_offset, bytes: event.returned_bytes,
    continuation: event.continuation_offset, bounded: event.range_within_256_kib,
  })), [
    { requested: 0, returned: 0, bytes: split, continuation: split, bounded: true },
    { requested: split, returned: split, bytes: body.length - split, continuation: null, bounded: true },
  ])
  assert.deepEqual(evidence.slice(2).map((event) => event.stage), [
    'encoded_length_validated', 'digest_validated', 'fatal_utf8_validated',
    'json_validated', 'settlement_format_validated', 'all_validations_completed',
  ])
  assert.ok(!JSON.stringify(evidence).includes('raw-secret'))
  assert.ok(!JSON.stringify(evidence).includes('verified'))
})

test('failed deferred checks emit no later validation or render success', async () => {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  const body = Buffer.from('{"format":"wrong"}')
  const evidence: any[] = []
  await assert.rejects(() => verifyDeferredToolContent([{
    data: body.toString('base64'), offset: 0, next_offset: body.length, complete: true,
    total_bytes: body.length, sha256: '0'.repeat(64), content_format: 'arbol-tool-settlement-json-v1',
  }], '0'.repeat(64), body.length, (event) => evidence.push(event)), /digest mismatch/)
  assert.deepEqual(evidence.map((event) => event.stage), ['range_validated', 'encoded_length_validated'])
  assert.throws(() => deferredRenderEvidence(false, '0'.repeat(64), body.length), /validation did not complete/)
  assert.equal(evidence.some((event) => event.stage === 'all_validations_completed'), false)
})

test('render completion evidence is available only after all validations complete', () => {
  assert.deepEqual(deferredRenderEvidence(true, 'a'.repeat(64), 42), {
    stage: 'rendered', reference_sha256: 'a'.repeat(64), reference_encoded_bytes: 42,
  })
})
