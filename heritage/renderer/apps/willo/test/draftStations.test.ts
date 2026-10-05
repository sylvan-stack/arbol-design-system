import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stationAppearsDrafted } from '../src/helpers'
import { applyPendingSessionPatches, mergeDraftsIntoStations, removeDraftFromStations } from '../src/stations'

test('reply Draft decorates only its owning Chat Session', () => {
  const merged = mergeDraftsIntoStations(
    [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }],
    [{
      draft_id: 'd1', chat_session_id: 's1', text_preview: 'private reply',
      attachment_count: 0, updated_at: 20,
    }],
  )

  assert.equal(merged.length, 2)
  assert.deepEqual(merged.find((item) => item.id === 's1'), {
    id: 's1', title: 'One', hasDraft: true, draftId: 'd1',
    draftText: 'private reply', draftAttachmentCount: 0, updated_at: 20,
  })
  assert.equal(merged.find((item) => item.id === 's2')?.hasDraft, undefined)
  assert(!merged.some((item) => item.id === 'draft:d1'))
})

test('standalone Draft remains a neutral Draft card', () => {
  const merged = mergeDraftsIntoStations(
    [{ id: 's1', title: 'One' }],
    [{ draft_id: 'standalone', chat_session_id: null, text_preview: 'new chat' }],
  )
  assert.equal(merged.length, 2)
  assert.equal(merged[1].id, 'draft:standalone')
  assert.equal(merged[1].entityKind, 'draft')
})

test('historical empty unowned Draft rows never become visible cards', () => {
  const historicalRows = [
    {
      draft_id: 'd:3eabfe95-9d8a-4375-bc5e-f4a7b7cffb12',
      chat_session_id: null,
      text_preview: '',
      attachment_count: 0,
      chat_note_count: 0,
      revision: 1,
      created_at: 1,
      updated_at: 2,
    },
    {
      draft_id: 'd:b108cf6c-f2dc-4119-820b-14507e2e6c96',
      chat_session_id: null,
      text_preview: '   \n',
      attachment_count: 0,
      chat_note_count: 0,
      revision: 1,
      created_at: 3,
      updated_at: 4,
    },
  ]

  // Initial load, refresh, reconnect and restart all invoke the same pure
  // authoritative snapshot projection. Every invocation must remain empty.
  for (let invocation = 0; invocation < 4; invocation += 1) {
    assert.deepEqual(mergeDraftsIntoStations([], historicalRows), [])
  }
})

test('recoverable standalone Drafts remain visible for every content kind', () => {
  const merged = mergeDraftsIntoStations([], [
    { draft_id: 'text', chat_session_id: null, text_preview: 'recover me' },
    { draft_id: 'attachment', chat_session_id: null, text_preview: '', attachment_count: 1 },
    { draft_id: 'note', chat_session_id: null, text_preview: '', chat_note_count: 1 },
  ])

  assert.deepEqual(merged.map((item) => item.id), [
    'draft:text',
    'draft:attachment',
    'draft:note',
  ])
})

test('session-owned Draft never degrades into a neutral card when owner is outside the page', () => {
  const merged = mergeDraftsIntoStations([], [
    { draft_id: 'd1', chat_session_id: 'session-outside-limit', text_preview: 'private reply' },
  ])
  assert.deepEqual(merged, [])
})


test('running Chat Sessions do not appear in the Drafted section', () => {
  assert.equal(stationAppearsDrafted({ id: 'running-draft', status: 'running', hasDraft: true }), false)
  assert.equal(stationAppearsDrafted({ id: 'idle-draft', status: 'idle', hasDraft: true }), true)
  assert.equal(stationAppearsDrafted({ id: 'standalone-draft', entityKind: 'draft', hasDraft: true }), true)
})


test('discard event immediately removes its standalone Draft card', () => {
  const sessions = mergeDraftsIntoStations(
    [{ id: 's1', title: 'Existing chat' }],
    [{ draft_id: 'sent-new-chat', chat_session_id: null, text_preview: 'sent text' }],
  )

  assert.deepEqual(
    removeDraftFromStations(sessions, 'sent-new-chat'),
    [{ id: 's1', title: 'Existing chat' }],
  )
})

test('discard event immediately clears only the matching reply Draft decoration', () => {
  const sessions = mergeDraftsIntoStations(
    [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', hasDraft: true, draftId: 'other' }],
    [{ draft_id: 'sent-reply', chat_session_id: 's1', text_preview: 'sent reply', attachment_count: 1 }],
  )

  assert.deepEqual(removeDraftFromStations(sessions, 'sent-reply'), [
    { id: 's1', title: 'One', updated_at: 0 },
    { id: 's2', title: 'Two', hasDraft: true, draftId: 'other' },
  ])
})


test('pending optimistic session patch survives a stale snapshot', () => {
  const pending = new Map([
    ['s1', { mutation: 1, patch: { onGoing: false } }],
  ])
  assert.deepEqual(
    applyPendingSessionPatches([
      { id: 's1', title: 'One', onGoing: true },
      { id: 's2', title: 'Two', onGoing: true },
    ], pending),
    [
      { id: 's1', title: 'One', onGoing: false },
      { id: 's2', title: 'Two', onGoing: true },
    ],
  )
})

test('agentic stations inherit parent chrome without changing execution snapshots', async () => {
  const { stationIsAgentic, withParentStationState } = await import('../src/stations')
  const sessions = [
    { id: 'parent', status: 'running', onGoing: true, isUnread: false },
    { id: 'child', initiator_kind: 'agent' as const, parent_chat_session_id: 'parent', status: 'error', last_error: 'child failure' },
    { id: 'grandchild', initiator_kind: 'delegate' as const, parent_chat_session_id: 'child' },
    { id: 'steward', initiator_kind: 'steward' as const, status: 'idle', onGoing: true },
    { id: 'draft', entityKind: 'draft' as const },
  ]
  const projected = withParentStationState(sessions)
  assert.deepEqual(projected.filter(stationIsAgentic).map(s => s.id), ['child', 'grandchild', 'steward'])
  for (const s of projected.slice(1, 3)) {
    assert.equal(s.status, 'running')
    assert.equal(s.onGoing, true)
    assert.equal(s.last_error, null)
  }
  assert.equal(sessions[1].status, 'error')
  const changed = withParentStationState([{ ...sessions[0], status: 'idle', onGoing: false, isUnread: true }, ...sessions.slice(1)])
  assert.equal(changed[2].onGoing, false)
  assert.equal(changed[2].isUnread, true)
  assert.equal(changed[2].status, 'idle')
})

test('parents outside the snapshot use Core inheritance and missing parents retain own state', async () => {
  const { withParentStationState } = await import('../src/stations')
  const [child, orphan] = withParentStationState([
    { id: 'child', initiator_kind: 'agent', parent_chat_session_id: 'parent', status: 'running',
      parent_chat_session: { id: 'parent', ongoing_chat_session_id: 'root', status: 'idle', onGoing: false, isUnread: true } },
    { id: 'orphan', initiator_kind: 'delegate', parent_chat_session_id: 'deleted', status: 'running', onGoing: true },
  ])
  assert.equal(child.status, 'idle')
  assert.equal(child.isUnread, true)
  assert.equal(child.onGoing, false)
  assert.equal(orphan.status, 'running')
  assert.equal(orphan.onGoing, true)
})

test('invalid parent cycles retain each station own state', async () => {
  const { withParentStationState } = await import('../src/stations')
  const rows = [
    { id: 'a', initiator_kind: 'agent' as const, parent_chat_session_id: 'b', status: 'running', onGoing: true },
    { id: 'b', initiator_kind: 'agent' as const, parent_chat_session_id: 'a', status: 'idle', onGoing: false },
  ]
  assert.deepEqual(withParentStationState(rows), rows)
})
