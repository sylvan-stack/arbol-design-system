/* Agent status types — extracted from AgentStatusBar.tsx so many consumers
 * (ResponseView, ElmaPage, stories, …) can import them without pulling in the
 * Svelte component. Kept identical to the React originals. */

export type AgentStatusKind =
  | 'ready'
  | 'starting'
  | 'routing'
  | 'running'
  | 'thinking'
  | 'streaming'
  | 'tool_running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentStatusState {
  kind: AgentStatusKind
  label: string
  detail?: string
  /** Epoch milliseconds when the failed terminal event was recorded. */
  failedAt?: number
}
