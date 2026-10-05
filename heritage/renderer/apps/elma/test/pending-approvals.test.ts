import assert from 'node:assert/strict'
import test from 'node:test'
import { initialChatSession } from '@arbol/events'
import { approvalsFromView } from '../src/chat/usePendingApprovals'
import { approvalIncidentReport } from '../src/chat/ToolApprovalCard.helpers'

test('pending approvals are read directly from the materialized chat view', () => {
  const view = initialChatSession('session-1')
  view.toolRequests.r1 = {
    request_id: 'r1', batch_id: 'b1', kind: 'bash', phase: 'pending',
    decision: null, ok: null, reason: 'needs permission',
  }
  view.toolRequestParams.r1 = { command: 'echo fixed' }
  assert.deepEqual(approvalsFromView(view), [{
    request_id: 'r1', kind: 'bash', params: { command: 'echo fixed' },
    reason: 'needs permission',
  }])
})

test('settled requests and non-native decisions are omitted', () => {
  const view = initialChatSession('session-1')
  view.toolRequests.done = {
    request_id: 'done', batch_id: 'b1', kind: 'read', phase: 'settled',
    decision: 'run', ok: true,
  }
  assert.deepEqual(approvalsFromView(view), [])
})

test('native origin is reconstructed from the durable request id', () => {
  const view = initialChatSession('session-1')
  view.toolRequests['nt-tool-1'] = {
    request_id: 'nt-tool-1', batch_id: 'b1', kind: 'write', phase: 'pending',
    decision: null, ok: null,
  }
  assert.equal(approvalsFromView(view)[0]?.origin, 'native')
})

test('structured every-time policy reaches the protected approval card', () => {
  const view = initialChatSession('session-1')
  view.toolRequests.protected = {
    request_id: 'protected', batch_id: 'b1', kind: 'bash', phase: 'pending',
    decision: null, ok: null, reason: 'Explicit approval is required',
    canonical_kind: 'bash:protected-lifecycle', approval_policy: 'every_time',
  }
  view.toolRequestParams.protected = { command: 'lifecycle-command' }
  assert.deepEqual(approvalsFromView(view)[0], {
    request_id: 'protected', kind: 'bash', params: { command: 'lifecycle-command' },
    reason: 'Explicit approval is required', canonical_kind: 'bash:protected-lifecycle',
    approval_policy: 'every_time',
  })
})


test('permission incident report includes its unique id and complete requested action', () => {
  const report = approvalIncidentReport({
    request_id: 'request-incident-7', kind: 'bash',
    params: { command: 'rm -rf build', timeout_seconds: 300 },
    reason: 'This command can remove files', origin: 'native',
    canonical_kind: 'bash:destructive', approval_policy: 'every_time',
  })
  assert.match(report, /ID: request-incident-7/)
  assert.match(report, /Tool: bash/)
  assert.match(report, /Reason: This command can remove files/)
  assert.match(report, /rm -rf build/)
  assert.match(report, /"timeout_seconds": 300/)
})
