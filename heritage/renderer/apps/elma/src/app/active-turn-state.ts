/* Completion policy for Elma's optimistic local active Turn.
 *
 * The durable chat-session fold is authoritative. `lastTurnTerminal` is a
 * convenience retained only in the current projection snapshot, so it may be
 * absent after catch-up/history paging even though `status: 'idle'` is the
 * terminal truth. Do not leave an optimistic local Turn active in that case.
 */

export type ActiveTurnCompletionInput = {
  foldStatus: string | null | undefined
  terminalPhase: string | null | undefined
  sawRunning: boolean
  newAssistant: boolean
}

export function shouldCompleteActiveTurn(input: ActiveTurnCompletionInput): boolean {
  if (input.foldStatus !== 'idle') return false

  // Seeing this Turn's authoritative fold run and subsequently become idle is
  // sufficient completion evidence. A retained matching completion terminal is
  // only needed for the rare batched snapshot that skipped a visible running
  // state but did add assistant output.
  return input.sawRunning || (input.terminalPhase === 'completed' && input.newAssistant)
}
