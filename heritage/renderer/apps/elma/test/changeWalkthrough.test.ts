import assert from 'node:assert/strict'
import test from 'node:test'
import { appendToDraft, buildAskAgentBlock, contiguousRange, nextContext, projectCodeVersion, projectFullCodeVersion, reconcileSelectedPath, selectCodeVersionRange, summarizeCoordinates } from '../src/change-walkthrough/state'
import type { ChangeWalkthroughFile, ChangeWalkthroughSummary } from '../src/change-walkthrough/types'

const files = (paths: string[]): ChangeWalkthroughFile[] => paths.map((path, index) => ({
  id: String(index), path, kind: 'modified', binary: false, additions: 1, deletions: 1,
  staged: false, unstaged: true, untracked: false,
}))

test('reconciles a selected file deterministically', () => {
  assert.equal(reconcileSelectedPath('b', files(['a', 'b', 'c']), files(['a', 'b', 'd'])), 'b')
  assert.equal(reconcileSelectedPath('b', files(['a', 'b', 'c']), files(['a', 'c'])), 'c')
  assert.equal(reconcileSelectedPath('a', files(['a']), []), null)
})

test('selects a bounded contiguous range and coordinates', () => {
  const lines = [
    { kind: 'context' as const, text: 'a', old_line: 4, new_line: 4 },
    { kind: 'deletion' as const, text: 'b', old_line: 5 },
    { kind: 'addition' as const, text: 'c', new_line: 5 },
  ]
  const rows = contiguousRange(lines, 2, 0)
  assert.equal(rows.length, 3)
  assert.equal(summarizeCoordinates(rows), 'old 4–5, new 4–5')
})

test('cycles context and clamps', () => {
  assert.equal(nextContext(3), 10)
  assert.equal(nextContext(100), 200)
  assert.equal(nextContext(200), 200)
})

test('formats deterministic bounded handoff and preserves a draft', () => {
  const summary = {
    target_id: 't', worktree_root: '/repo/feature', branch: 'feature', base_ref: 'main',
    comparison_mode: 'merge-base', merge_base_oid: 'base', head_oid: 'head', worktree_version: 'version',
    commit_count: 1, has_staged: false, has_unstaged: true, has_untracked: false,
    totals: { files: 1, additions: 1, deletions: 1, binary_files: 0 }, files: files(['a.ts']),
    file_offset: 0, file_limit: 200, has_more_files: false, truncated: false, warnings: [], commits: [],
    diff_mode: 'master', parent_branch: null, parent_ref: null, parent_available: false, master_ref: 'main',
  } satisfies ChangeWalkthroughSummary
  const rows = contiguousRange([
    { kind: 'deletion', text: 'old', old_line: 2 }, { kind: 'addition', text: 'new', new_line: 2 },
  ], 0, 1)
  const block = buildAskAgentBlock({ repo: 'Arbol', summary, file: summary.files[0], rows })
  assert.match(block, /Worktree: \/repo\/feature/)
  assert.match(block, /-old\n\+new/)
  assert.equal(appendToDraft('Keep this', block).startsWith('Keep this\n\n---'), true)
})


test('projects replacements and surplus lines into before/with code views', () => {
  const hunks = [{
    old_start: 9, old_count: 4, new_start: 9, new_count: 4,
    lines: [
      { kind: 'context' as const, text: 'before', old_line: 9, new_line: 9 },
      { kind: 'deletion' as const, text: 'old one', old_line: 10 },
      { kind: 'deletion' as const, text: 'old two', old_line: 11 },
      { kind: 'addition' as const, text: 'new one', new_line: 10 },
      { kind: 'context' as const, text: 'after', old_line: 12, new_line: 11 },
      { kind: 'addition' as const, text: 'extra one', new_line: 12 },
      { kind: 'addition' as const, text: 'extra two', new_line: 13 },
    ],
  }]

  const before = projectCodeVersion(hunks, 'before')[0].rows
  assert.deepEqual(before.map((row) => row.kind === 'line' ? [row.line.text, row.tone] : [`+${row.count}`, row.tone]), [
    ['before', 'context'], ['old one', 'edited'], ['old two', 'removed'], ['after', 'context'], ['+2', 'added'],
  ])

  const withChanges = projectCodeVersion(hunks, 'with')[0].rows
  assert.deepEqual(withChanges.map((row) => row.kind === 'line' ? [row.line.text, row.tone] : [`-${row.count}`, row.tone]), [
    ['before', 'context'], ['new one', 'edited'], ['-1', 'removed'], ['after', 'context'], ['extra one', 'added'], ['extra two', 'added'],
  ])
})

test('selects visible code-version lines using authoritative diff indexes', () => {
  const projected = projectCodeVersion([{
    old_start: 1, old_count: 2, new_start: 1, new_count: 2,
    lines: [
      { kind: 'deletion', text: 'old', old_line: 1 },
      { kind: 'addition', text: 'new', new_line: 1 },
      { kind: 'context', text: 'kept', old_line: 2, new_line: 2 },
    ],
  }], 'with')[0].rows.filter((row) => row.kind === 'line')
  const rows = selectCodeVersionRange(projected, 0, 1)
  assert.deepEqual(rows.map((row) => [row.index, row.text]), [[1, 'new'], [2, 'kept']])
})


test('projects affected colors and cues into complete code versions', () => {
  const hunks = [{
    old_start: 2, old_count: 3, new_start: 2, new_count: 3,
    lines: [
      { kind: 'deletion' as const, text: 'old edit', old_line: 2 },
      { kind: 'deletion' as const, text: 'removed', old_line: 3 },
      { kind: 'addition' as const, text: 'new edit', new_line: 2 },
      { kind: 'context' as const, text: 'tail', old_line: 4, new_line: 3 },
      { kind: 'addition' as const, text: 'inserted', new_line: 4 },
    ],
  }]
  const before = projectFullCodeVersion(['head', 'old edit', 'removed', 'tail'], hunks, 'before')[0].rows
  assert.deepEqual(before.map((row) => row.kind === 'line' ? [row.line_number, row.tone] : [`+${row.count}`, row.tone]), [
    [1, 'context'], [2, 'edited'], [3, 'removed'], [4, 'context'], ['+1', 'added'],
  ])
  const withChanges = projectFullCodeVersion(['head', 'new edit', 'tail', 'inserted'], hunks, 'with')[0].rows
  assert.deepEqual(withChanges.map((row) => row.kind === 'line' ? [row.line_number, row.tone] : [`-${row.count}`, row.tone]), [
    [1, 'context'], [2, 'edited'], ['-1', 'removed'], [3, 'context'], [4, 'added'],
  ])
})

import { isWalkthroughBranch, isWalkthroughBranchCommandClick } from '../src/change-walkthrough/branchWalkthrough'

test('recognizes only supported Cmd-click walkthrough branch names', () => {
  for (const branch of ['sub/branch-name', 'feature/branch-name', 'trc/branch-name', 'fix/branch-name']) {
    assert.equal(isWalkthroughBranch(branch), true)
  }
  for (const branch of ['main', 'chore/branch-name', 'feature/', 'feature/a/b', 'feature branch']) {
    assert.equal(isWalkthroughBranch(branch), false)
  }
  assert.equal(isWalkthroughBranchCommandClick({ metaKey: true } as MouseEvent, 'fix/branch-name'), true)
  assert.equal(isWalkthroughBranchCommandClick({ metaKey: false } as MouseEvent, 'fix/branch-name'), false)
})
