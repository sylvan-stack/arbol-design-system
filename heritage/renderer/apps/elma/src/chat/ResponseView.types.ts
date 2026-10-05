/* ToolOutputPreview shapes — extracted from ResponseView.tsx so consumers (the
 * spine: ElmaPage / live-view plumbing, stories) can import the map type without
 * pulling in the Svelte component. Kept identical to the React originals. */

export type ToolOutputPreview = {
  status?: 'running' | 'completed' | 'failed'
  stdout?: string
  stderr?: string
  updatedAt?: number
  /** Tool execution start timestamp (TOOL_REQUEST_OPENED event time). */
  startedAt?: number
  /** Tool execution end timestamp (settlement event time). */
  endedAt?: number
}

export type ToolOutputPreviewMap = Record<string, ToolOutputPreview>
