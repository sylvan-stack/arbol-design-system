export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'type-changed' | 'conflicted'

export type WorktreeDiffMode = 'master' | 'parent' | 'uncommitted' | 'commit'
export type WalkthroughTotals = { files: number; additions: number; deletions: number; binary_files: number }
export type WalkthroughTarget = {
  target_id: string
  worktree_root: string
  branch: string | null
  detached: boolean
  exists: boolean
  stats_status?: 'clean' | 'changed' | 'unavailable'
  stats_error?: string
  totals?: WalkthroughTotals
  diff_mode?: WorktreeDiffMode
  parent_branch?: string | null
  parent_ref?: string | null
  parent_available?: boolean
  master_ref?: string | null
}
export type WalkthroughRepo = {
  name: string
  repo_root: string
  container: boolean
  launch_chat_match?: boolean
  targets: WalkthroughTarget[]
}
export type ChangeWalkthroughFile = {
  id: string
  path: string
  old_path?: string
  kind: ChangeKind
  binary: boolean
  additions?: number | null
  deletions?: number | null
  staged: boolean
  unstaged: boolean
  untracked: boolean
}
export type DiffViewCommit = { sha: string; message: string; datetime: string; author: { name: string; email: string } }

export type ChangeWalkthroughSummary = {
  target_id: string
  worktree_root: string
  branch: string | null
  base_ref: string
  diff_mode: WorktreeDiffMode
  parent_branch: string | null
  parent_ref: string | null
  parent_available: boolean
  master_ref: string | null
  comparison_mode: 'merge-base' | 'working-copy-only' | 'commit-only'
  merge_base_oid: string
  head_oid: string
  worktree_version: string
  commit_count: number
  has_staged: boolean
  has_unstaged: boolean
  has_untracked: boolean
  totals: WalkthroughTotals
  files: ChangeWalkthroughFile[]
  file_offset: number
  file_limit: number
  has_more_files: boolean
  commits: DiffViewCommit[]
  truncated: boolean
  warnings: string[]
}
export type DiffLineKind = 'context' | 'addition' | 'deletion' | 'no-newline'
export type ChangeWalkthroughLine = { kind: DiffLineKind; text: string; old_line?: number; new_line?: number }
export type ChangeWalkthroughHunk = {
  old_start: number; old_count: number; new_start: number; new_count: number
  lines: ChangeWalkthroughLine[]
}
export type ChangeWalkthroughDiff =
  | { status: 'stale'; worktree_version: string }
  | { status: 'ok'; worktree_version: string; file: ChangeWalkthroughFile; hunks: ChangeWalkthroughHunk[]; truncated: boolean; warning?: string; code_versions?: { before: string[]; with_changes: string[] } }
export type SelectedDiffRow = ChangeWalkthroughLine & { index: number }

export type WalkthroughView = 'diff' | 'before' | 'with'
export type CodeVersionSide = 'before' | 'with'
export type CodeVersionTone = 'context' | 'removed' | 'added' | 'edited'
export type CodeVersionLineRow = {
  kind: 'line'
  source_index: number
  line: ChangeWalkthroughLine
  line_number: number
  tone: CodeVersionTone
}
export type CodeVersionCueRow = {
  kind: 'cue'
  source_index: number
  tone: 'removed' | 'added'
  count: number
}
export type CodeVersionRow = CodeVersionLineRow | CodeVersionCueRow
export type CodeVersionHunk = {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  rows: CodeVersionRow[]
}
