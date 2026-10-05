import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailParserChatNote, emailParserChatNoteClipboard, isViewportDiagnosticTarget, mailApi, mailMessageKey, mailSyncNotice, mailSyncProgressLabel, messagePreview, senderAddress, senderName } from '../src/mailApi'
import { coreCalls, nativeCalls, setNativeResult } from './designSystemStub'

test('sender helpers handle named and bare addresses', () => {
  assert.equal(senderName('"Ada Lovelace" <ada@example.com>'), 'Ada Lovelace')
  assert.equal(senderName('Grace Hopper <grace@example.com>'), 'Grace Hopper')
  assert.equal(senderName('linus@example.com'), 'linus')
  assert.equal(senderAddress('Grace Hopper <grace@example.com>'), 'grace@example.com')
  assert.equal(senderAddress('linus@example.com'), 'linus@example.com')
})

test('message keys use the durable synchronized id', () => {
  assert.equal(mailMessageKey({ id: 'work:42' }), 'work:42')
  assert.notEqual(mailMessageKey({ id: 'work:42' }), mailMessageKey({ id: 'personal:42' }))
})

test('message preview normalizes whitespace and truncates', () => {
  assert.equal(messagePreview('Hello\n\n  there'), 'Hello there')
  assert.equal(messagePreview('abcdef', 5), 'abcd…')
})


test('viewport diagnostic target stays available when its inbox count hint changes', () => {
  assert.equal(isViewportDiagnosticTarget({ id: 'target', content_state: 'partial' }, 'target'), true)
  assert.equal(isViewportDiagnosticTarget({ id: 'target', content_state: 'preview' }, 'target'), true)
  assert.equal(isViewportDiagnosticTarget({ id: 'target', content_state: 'complete' }, 'target'), false)
  assert.equal(isViewportDiagnosticTarget({ id: 'other', content_state: 'partial' }, 'target'), false)
})


test('Parser Chat Note includes implementation, exact email input, result, and diagnostics', () => {
  const context = {
    parser: {
      parser_id: 'email.gitlab', display_name: 'Gitlab', version: 1,
      output_schema_version: '1.0.0', implementation_path: '/repo/Arbol/daemons/core/arbol_core/email_parsers/gitlab.py',
      workspace_dir: '/repo/Arbol',
    },
    message: {
      id: 'surface-1', sender: 'GitLab <gitlab@example.com>', sender_address: 'gitlab@example.com',
      subject: 'Pipeline failed', date_received: 1_700_000_000_000,
    },
    result: {
      source_item_id: 'source-1', parser_id: 'email.gitlab', parser_version: 1,
      output_schema_version: '1.0.0', status: 'matched', extracted: true,
      data: { kind: 'pipeline.failed' }, stages: [{ name: 'detect', status: 'matched' }], diagnostics: ['matched subject'], cached: false,
      email: {
        source_item_id: 'source-1', source_acceptance_seq: 4, provider_message_id: 'provider-1',
        provider_thread_id: 'thread-1', content_state: 'rendered_complete', content_hash: 'hash',
        sender: 'GitLab <gitlab@example.com>', sender_address: 'gitlab@example.com', subject: 'Pipeline failed',
        occurred_at: 1_700_000_000_000, text: 'Pipeline #42 failed', to: [], cc: [], bcc: [], reply_to: '',
        links: [], attachments: [], capture_method: 'rendered',
      },
    },
  }
  const note = emailParserChatNote(context)
  assert.match(note, /Email Parser test context/)
  assert.match(note, /email\.gitlab/)
  assert.match(note, /email_parsers\/gitlab\.py/)
  assert.match(note, /Pipeline #42 failed/)
  assert.match(note, /pipeline\.failed/)
  assert.match(note, /detect/)
  assert.match(note, /matched subject/)
  assert.match(note, /wait for the user’s message/)
  assert.equal(emailParserChatNoteClipboard(context), `### Chat Note ###\n${note}`)
})


test('email synchronization progress labels cover station status phases', () => {
  assert.equal(mailSyncProgressLabel({ running: true, phase: 'loading_inbox', current: 0, total: 0 }), 'Opening Gmail…')
  assert.equal(mailSyncProgressLabel({ running: true, phase: 'discovering', current: 0, total: 0 }), 'Finding unfetched email threads…')
  assert.equal(mailSyncProgressLabel({ running: true, phase: 'fetching', current: 2, total: 5 }), 'Synchronising 3 of 5…')
  assert.equal(mailSyncProgressLabel({ running: true, phase: 'fetching', current: 2, total: 5, message: 'Synchronising conversation 3 of 5…' }), 'Synchronising conversation 3 of 5…')
})


test('successful Sync notice does not report reconciled attempts as acquisition failures', () => {
  assert.equal(
    mailSyncNotice({
      acquisition_requested: 12,
      acquisition_resolved: 12,
      acquired_conversations: 0,
      acquisition_failed: 12,
      remaining_incomplete: 0,
    }),
    'Synchronized the inbox and reconciled 12 previously incomplete conversation records. All synchronized conversations have complete content.',
  )
  assert.equal(
    mailSyncNotice({ acquisition_requested: 2, acquired_conversations: 2, remaining_incomplete: 0 }),
    'Synchronized the inbox and acquired 2 new or incomplete conversations. All synchronized conversations now have complete content.',
  )
  assert.equal(
    mailSyncNotice({ acquisition_requested: 0, acquired_conversations: 0, remaining_incomplete: 0 }),
    'Inbox is up to date; all synchronized conversations already have complete email content.',
  )
})


test('Synchronise Emails opens only the visible user-mediated native surface', async () => {
  nativeCalls.length = 0
  coreCalls.length = 0
  setNativeResult({ ok: true, opened: true })
  await mailApi.openUserMediatedCapture()
  assert.deepEqual(nativeCalls, [{ method: 'webMail.openUserMediatedCapture', params: {} }])
  assert.deepEqual(coreCalls, [])
})


test('Sync All invokes the dedicated automatic unfetched-thread command', async () => {
  nativeCalls.length = 0
  coreCalls.length = 0
  setNativeResult({ ok: true, started: true, run_id: 'run-1' })
  await mailApi.synchroniseAllUnfetched()
  assert.deepEqual(nativeCalls, [{ method: 'webMail.synchroniseAllUnfetched', params: {} }])
  assert.deepEqual(coreCalls, [])
})

test('legacy hidden Sync fails in renderer without issuing a native command', async () => {
  nativeCalls.length = 0
  await assert.rejects(() => mailApi.sync(), /Hidden Gmail Sync is disabled/)
  assert.deepEqual(nativeCalls, [])
})


test('identity diagnostic uses its dedicated correlated read-only command', async () => {
  nativeCalls.length = 0
  coreCalls.length = 0
  setNativeResult({ ok: true, complete: 0, terminal_reason: 'identity_dry_same_thread_owner' })
  const result = await mailApi.identityDiagnostic('surface-1', 11, 'identity-command-1', 3)
  assert.deepEqual(nativeCalls, [{
    method: 'webMail.identityDiagnostic',
    params: {
      surface_message_id: 'surface-1', expected_thread_count: 11,
      command_id: 'identity-command-1', renderer_sequence: 3,
    },
  }])
  assert.equal(result.terminal_reason, 'identity_dry_same_thread_owner')
  assert.deepEqual(coreCalls.map(({ method, params }) => ({ method, trigger: params.trigger, stage: params.stage, outcome: params.outcome })), [
    { method: 'email.surface.acquisition.trace', trigger: 'force_refetch_identity_dry', stage: 'renderer_command_started', outcome: 'started' },
    { method: 'email.surface.acquisition.trace', trigger: 'force_refetch_identity_dry', stage: 'renderer_command_completed', outcome: 'succeeded' },
  ])
})


test('Force refetch uses its dedicated native command and exact conversation identity', async () => {
  nativeCalls.length = 0
  coreCalls.length = 0
  setNativeResult({ ok: true, captures: 2, complete: 2 })
  const result = await mailApi.forceRefetch(
    'surface-1', 'https://mail.google.com/mail/u/0/#inbox/thread-1', 0, 'command-1', 7,
  )
  assert.deepEqual(nativeCalls, [{
    method: 'webMail.forceRefetch',
    params: {
      surface_message_id: 'surface-1', url: 'https://mail.google.com/mail/u/0/#inbox/thread-1',
      expected_thread_count: 0, command_id: 'command-1', renderer_sequence: 7,
    },
  }])
  assert.equal(result.complete, 2)
  assert.deepEqual(coreCalls.map(({ method, params }) => ({ method, stage: params.stage, outcome: params.outcome, command_id: params.command_id })), [
    { method: 'email.surface.acquisition.trace', stage: 'renderer_command_started', outcome: 'started', command_id: 'command-1' },
    { method: 'email.surface.acquisition.trace', stage: 'renderer_command_completed', outcome: 'succeeded', command_id: 'command-1' },
  ])
})
