/** Branch persistence deduplication for Chat Session attachment.
 *
 * The persisted branch from lightweight session metadata is already Core's
 * truth. Seed the reactive save guard with that value before transcript
 * hydration can select it. A requested search target is deliberately ignored:
 * when it differs from the persisted branch it is a genuine navigation that
 * still needs to be saved after the target Turn is available.
 */
export function persistedActiveBranchKey(
  chatSessionId: string,
  persistedTurnId: string | null | undefined,
): string {
  return chatSessionId && persistedTurnId
    ? `${chatSessionId}:${persistedTurnId}`
    : ''
}
