export type EditReplacementOutcome = {
  ok: true
  submission_id: string
  replaced_turn_id: string
  replacement_turn_id: string
  replacement_parent_turn_id: string | null
  replacement_disposition: 'root' | 'reply'
  active_live_leaf_turn_id: string | null
  accepted_chat_session_seq?: number
  accepted_revision?: number
}

export type EditReplacementState = {
  selectedTurnId: string | null
  composerParentTurnId: string | null
  persistedBranchKey: string | null
  pendingNavigationTurnId: string | null
  cachedSubmissionParentTurnId: string | null
}

/** One pure transition for every identity Elma can carry across an edit. */
export function adoptEditReplacement(
  state: EditReplacementState,
  outcome: EditReplacementOutcome,
): EditReplacementState {
  const replacement = outcome.active_live_leaf_turn_id || outcome.replacement_turn_id
  const pendingNavigationTurnId = state.pendingNavigationTurnId === outcome.replaced_turn_id
    ? replacement
    : state.pendingNavigationTurnId
  return {
    selectedTurnId: replacement,
    composerParentTurnId: replacement,
    persistedBranchKey: replacement,
    pendingNavigationTurnId,
    cachedSubmissionParentTurnId: replacement,
  }
}
