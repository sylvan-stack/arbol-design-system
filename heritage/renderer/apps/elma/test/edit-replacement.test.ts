import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptEditReplacement } from '../src/app/edit-replacement'

const outcome = {
  ok: true as const, submission_id: 'edit-1', replaced_turn_id: 'removed',
  replacement_turn_id: 'replacement', replacement_parent_turn_id: null,
  replacement_disposition: 'root' as const, active_live_leaf_turn_id: 'replacement',
  accepted_chat_session_seq: 9,
}

test('edit replacement adopts selected Turn, composer parent, persistence and queued navigation together', () => {
  assert.deepEqual(adoptEditReplacement({
    selectedTurnId: 'removed', composerParentTurnId: 'removed',
    persistedBranchKey: 'removed', pendingNavigationTurnId: 'removed',
    cachedSubmissionParentTurnId: 'removed',
  }, outcome), {
    selectedTurnId: 'replacement', composerParentTurnId: 'replacement',
    persistedBranchKey: 'replacement', pendingNavigationTurnId: 'replacement',
    cachedSubmissionParentTurnId: 'replacement',
  })
})

test('edit replacement does not redirect navigation aimed at unrelated content', () => {
  assert.equal(adoptEditReplacement({
    selectedTurnId: 'removed', composerParentTurnId: 'removed',
    persistedBranchKey: 'removed', pendingNavigationTurnId: 'sibling',
    cachedSubmissionParentTurnId: 'removed',
  }, outcome).pendingNavigationTurnId, 'sibling')
})
