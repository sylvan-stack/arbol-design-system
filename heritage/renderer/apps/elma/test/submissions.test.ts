import { test } from 'node:test'
import assert from 'node:assert/strict'

import { editReplacementParams, newSubmissionId, sessionSendParams, turnSubmissionParams } from '../src/app/submissions'

test('one send operation mints one stable submission identity', () => {
  let calls = 0
  const submissionId = newSubmissionId(() => `submission-${++calls}`)

  const firstAttempt = sessionSendParams({ id: 'session-1', text: 'hello', submissionId })
  const transportRetry = sessionSendParams({ id: 'session-1', text: 'hello', submissionId })

  assert.equal(calls, 1)
  assert.equal(firstAttempt.submission_id, 'submission-1')
  assert.equal(transportRetry.submission_id, 'submission-1')
  assert.deepEqual(transportRetry, firstAttempt)
})

test('session send command carries the Elma surface and optional values', () => {
  assert.deepEqual(sessionSendParams({
    id: 'session-1',
    text: 'hello',
    submissionId: 'submission-1',
    primaryRepository: '/repo/Arbol',
    workspaceDirs: ['/repo/Arbol'],
    model: 'model-1',
    parentTurnId: 'turn-0',
    attachments: [{ type: 'image' }],
  }), {
    id: 'session-1',
    text: 'hello',
    submission_id: 'submission-1',
    surface: { kind: 'ui', name: 'elma' },
    primary_repository: '/repo/Arbol',
    workspace_dirs: ['/repo/Arbol'],
    model: 'model-1',
    parent_turn_id: 'turn-0',
    attachments: [{ type: 'image' }],
  })
})

test('empty submission identities are rejected before transport', () => {
  assert.throws(
    () => sessionSendParams({ id: 'session-1', text: 'hello', submissionId: '  ' }),
    /must not be empty/,
  )
})


test('edit replacement carries a stable identity and Elma surface', () => {
  const input = {
    sessionId: 'session-1', turnId: 'old-turn', text: 'replacement',
    submissionId: 'edit-1', primaryRepository: '/repo/Arbol',
    workspaceDirs: ['/repo/Arbol'],
  }
  assert.deepEqual(editReplacementParams(input), {
    chat_session_id: 'session-1',
    turn_id: 'old-turn',
    text: 'replacement',
    submission_id: 'edit-1',
    surface: { kind: 'ui', name: 'elma' },
    primary_repository: '/repo/Arbol',
    workspace_dirs: ['/repo/Arbol'],
  })
  assert.deepEqual(editReplacementParams(input), editReplacementParams(input))
})


test('source-neutral reply submission carries existing destination', () => {
  const params = turnSubmissionParams({
    chatSessionId: 'session-1', text: 'reply', submissionId: 'reply-1',
  })
  assert.equal(params.chat_session_id, 'session-1')
  assert.equal(params.chat_session_creation, undefined)
})


test('Turn submission carries Draft Chat Notes without Draft identity', () => {
  const params = turnSubmissionParams({
    text: 'question', submissionId: 'with-note',
    chatSessionCreation: { workspaceDirs: [] },
    chatNotes: ['initial context'],
  })
  assert.deepEqual(params.chat_notes, ['initial context'])
  assert.equal(params.draft_id, undefined)
})


test('new Chat Session composition carries the explicit fast-mode selection', () => {
  const params = turnSubmissionParams({
    chatSessionCreation: {
      workspaceDirs: ['/repo/Arbol'],
      providerPreference: 'codex',
      fastMode: true,
    },
    text: 'hello',
    submissionId: 'submission-fast',
  })
  assert.equal(
    (params.chat_session_creation as { fast_mode?: boolean }).fast_mode,
    true,
  )
})
