/* Pure send-guard state for Elma.
 *
 * The shared fold updates asynchronously when a Chat Session is detached. A
 * newly opened chat therefore must not inherit the previous session's
 * `running` status merely because the last fold snapshot is still in memory.
 */

export type ChatMarkedRunningInput = {
  hasBridge: boolean
  attachedSessionId: string | null | undefined
  foldSessionId: string | null | undefined
  foldStatus: string | null | undefined
  activeTurnId: string | null | undefined
  responding: boolean
}

export function chatMarkedRunningState(input: ChatMarkedRunningInput): boolean {
  if (input.activeTurnId) return true
  if (!input.hasBridge) return input.responding
  return Boolean(input.attachedSessionId)
    && input.foldSessionId === input.attachedSessionId
    && input.foldStatus === 'running'
}

/** Activity indicators reflect only Core's folded Running lifecycle. Local Turn
 * state is intentionally excluded: it can lag a terminal event and otherwise
 * leave the status label and header animation active after the response ends. */
export function agentActivityRunningState(foldStatus: string | null | undefined): boolean {
  return foldStatus === 'running'
}


/** A stale local label must never remain visible after Core has folded a
 * terminal state. Terminal labels remain visible; live labels require Running. */
export function agentActivityStatusVisible(
  foldStatus: string | null | undefined,
  kind: 'starting' | 'routing' | 'running' | 'thinking' | 'streaming' | 'tool_running' | 'waiting_for_approval' | 'ready' | 'completed' | 'failed' | 'cancelled',
): boolean {
  const live = kind === 'starting' || kind === 'routing' || kind === 'running' || kind === 'thinking'
    || kind === 'streaming' || kind === 'tool_running' || kind === 'waiting_for_approval'
  return !live || agentActivityRunningState(foldStatus)
}
