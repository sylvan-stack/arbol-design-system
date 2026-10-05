import type { ChangeWalkthroughFile, ChangeWalkthroughHunk, ChangeWalkthroughLine, ChangeWalkthroughSummary, CodeVersionHunk, CodeVersionLineRow, CodeVersionSide, SelectedDiffRow } from './types'

export const CONTEXT_LEVELS = [3, 10, 25, 100, 200] as const
export const MAX_SELECTED_ROWS = 200
export const MAX_HANDOFF_BYTES = 16 * 1024

export function nextContext(current: number): number {
  const found = CONTEXT_LEVELS.find((level) => level > current)
  return found ?? CONTEXT_LEVELS[CONTEXT_LEVELS.length - 1]
}

export function reconcileSelectedPath(previous: string | null, before: ChangeWalkthroughFile[], after: ChangeWalkthroughFile[]): string | null {
  if (!after.length) return null
  if (previous && after.some((file) => file.path === previous)) return previous
  const oldIndex = previous ? before.findIndex((file) => file.path === previous) : -1
  return after[Math.max(0, Math.min(oldIndex, after.length - 1))]?.path ?? after[0].path
}

export function contiguousRange(lines: ChangeWalkthroughLine[], anchor: number, focus: number): SelectedDiffRow[] {
  const start = Math.max(0, Math.min(anchor, focus))
  const end = Math.min(lines.length - 1, Math.max(anchor, focus))
  return lines.slice(start, Math.min(end + 1, start + MAX_SELECTED_ROWS)).map((line, offset) => ({ ...line, index: start + offset }))
}

export function summarizeCoordinates(rows: SelectedDiffRow[]): string {
  const old = rows.flatMap((row) => row.old_line == null ? [] : [row.old_line])
  const next = rows.flatMap((row) => row.new_line == null ? [] : [row.new_line])
  const range = (values: number[]) => !values.length ? '—' : values[0] === values[values.length - 1] ? `${values[0]}` : `${values[0]}–${values[values.length - 1]}`
  return `old ${range(old)}, new ${range(next)}`
}

function marker(line: ChangeWalkthroughLine): string {
  if (line.kind === 'addition') return '+'
  if (line.kind === 'deletion') return '-'
  if (line.kind === 'no-newline') return '\\'
  return ' '
}

export function buildAskAgentBlock(input: {
  repo: string
  summary: ChangeWalkthroughSummary
  file: ChangeWalkthroughFile
  rows: SelectedDiffRow[]
}): string {
  const rows = input.rows.slice(0, MAX_SELECTED_ROWS)
  const heading = [
    'Please address this Change Walkthrough selection.', '',
    `Repo: ${input.repo}`,
    `Worktree: ${input.summary.worktree_root}`,
    `Branch: ${input.summary.branch ?? `detached at ${input.summary.head_oid.slice(0, 12)}`}`,
    `File: ${input.file.path}`,
    `Lines: ${summarizeCoordinates(rows)}`,
    `Worktree version: ${input.summary.worktree_version}`, '',
    '```diff',
  ].join('\n')
  const footer = '\n```'
  let body = ''
  for (const row of rows) {
    const candidate = `${body}${marker(row)}${row.text}\n`
    if (new TextEncoder().encode(`${heading}\n${candidate}${footer}`).length > MAX_HANDOFF_BYTES) break
    body = candidate
  }
  return `${heading}\n${body}${footer}`
}

export function appendToDraft(existing: string, block: string): string {
  return existing.trim() ? `${existing.trimEnd()}\n\n---\n\n${block}` : block
}


/**
 * Project unified hunks into one code version.
 *
 * Git represents a replacement as a run of deletions followed by additions.
 * Pairing the two runs by position gives the review UI a deliberately simple
 * and deterministic definition of an edited line. Unpaired rows remain true
 * removals/additions and become a cue on the side where no code line exists.
 */
export function projectCodeVersion(hunks: ChangeWalkthroughHunk[], side: CodeVersionSide): CodeVersionHunk[] {
  let sourceOffset = 0
  return hunks.map((hunk) => {
    const indexed = hunk.lines.map((line, local) => ({ line, source_index: sourceOffset + local }))
    sourceOffset += hunk.lines.length
    const rows: CodeVersionHunk['rows'] = []
    let cursor = 0

    while (cursor < indexed.length) {
      const item = indexed[cursor]
      if (item.line.kind === 'context') {
        rows.push({
          kind: 'line', source_index: item.source_index, line: item.line,
          line_number: side === 'before' ? item.line.old_line! : item.line.new_line!,
          tone: 'context',
        })
        cursor += 1
        continue
      }
      if (item.line.kind === 'no-newline') {
        cursor += 1
        continue
      }

      const block: typeof indexed = []
      while (cursor < indexed.length && indexed[cursor].line.kind !== 'context') {
        if (indexed[cursor].line.kind !== 'no-newline') block.push(indexed[cursor])
        cursor += 1
      }
      const deletions = block.filter(({ line }) => line.kind === 'deletion')
      const additions = block.filter(({ line }) => line.kind === 'addition')
      const edited = Math.min(deletions.length, additions.length)

      if (side === 'before') {
        for (const [index, old] of deletions.entries()) {
          rows.push({
            kind: 'line', source_index: old.source_index, line: old.line,
            line_number: old.line.old_line!, tone: index < edited ? 'edited' : 'removed',
          })
        }
        const added = additions.length - edited
        if (added > 0) rows.push({
          kind: 'cue', source_index: additions[edited].source_index,
          tone: 'added', count: added,
        })
      } else {
        for (const [index, next] of additions.entries()) {
          rows.push({
            kind: 'line', source_index: next.source_index, line: next.line,
            line_number: next.line.new_line!, tone: index < edited ? 'edited' : 'added',
          })
        }
        const removed = deletions.length - edited
        if (removed > 0) rows.push({
          kind: 'cue', source_index: deletions[edited].source_index,
          tone: 'removed', count: removed,
        })
      }
    }
    return { ...hunk, rows }
  })
}

export function selectCodeVersionRange(rows: CodeVersionLineRow[], anchor: number, focus: number): SelectedDiffRow[] {
  const start = Math.max(0, Math.min(anchor, focus))
  const end = Math.min(rows.length - 1, Math.max(anchor, focus))
  return rows.slice(start, Math.min(end + 1, start + MAX_SELECTED_ROWS)).map((row) => ({
    ...row.line,
    index: row.source_index,
  }))
}


/** Build the complete old/new file while retaining authoritative diff coloring. */
export function projectFullCodeVersion(
  code: string[], hunks: ChangeWalkthroughHunk[], side: CodeVersionSide,
): CodeVersionHunk[] {
  const tones = new Map<number, { tone: CodeVersionLineRow['tone']; source_index: number; line: ChangeWalkthroughLine }>()
  const cues = new Map<number, { tone: 'removed' | 'added'; count: number; source_index: number }[]>()
  let sourceOffset = 0

  const addCue = (position: number, tone: 'removed' | 'added', count: number, source_index: number) => {
    if (count <= 0) return
    const at = Math.max(1, Math.min(code.length + 1, position))
    cues.set(at, [...(cues.get(at) ?? []), { tone, count, source_index }])
  }

  for (const hunk of hunks) {
    const indexed = hunk.lines.map((line, local) => ({ line, source_index: sourceOffset + local }))
    sourceOffset += hunk.lines.length
    let cursor = 0
    let oldPosition = hunk.old_start
    let newPosition = hunk.new_start
    while (cursor < indexed.length) {
      const item = indexed[cursor]
      if (item.line.kind === 'context') {
        oldPosition += 1
        newPosition += 1
        cursor += 1
        continue
      }
      if (item.line.kind === 'no-newline') {
        cursor += 1
        continue
      }
      const blockOldPosition = oldPosition
      const blockNewPosition = newPosition
      const block: typeof indexed = []
      while (cursor < indexed.length && indexed[cursor].line.kind !== 'context') {
        const current = indexed[cursor]
        if (current.line.kind !== 'no-newline') block.push(current)
        if (current.line.kind === 'deletion') oldPosition += 1
        if (current.line.kind === 'addition') newPosition += 1
        cursor += 1
      }
      const deletions = block.filter(({ line }) => line.kind === 'deletion')
      const additions = block.filter(({ line }) => line.kind === 'addition')
      const edited = Math.min(deletions.length, additions.length)
      if (side === 'before') {
        deletions.forEach((old, index) => tones.set(old.line.old_line!, {
          tone: index < edited ? 'edited' : 'removed', source_index: old.source_index, line: old.line,
        }))
        if (additions.length > edited) addCue(blockOldPosition + deletions.length, 'added', additions.length - edited, additions[edited].source_index)
      } else {
        additions.forEach((next, index) => tones.set(next.line.new_line!, {
          tone: index < edited ? 'edited' : 'added', source_index: next.source_index, line: next.line,
        }))
        if (deletions.length > edited) addCue(blockNewPosition + additions.length, 'removed', deletions.length - edited, deletions[edited].source_index)
      }
    }
  }

  const rows: CodeVersionHunk['rows'] = []
  for (let position = 1; position <= code.length + 1; position += 1) {
    for (const cue of cues.get(position) ?? []) rows.push({ kind: 'cue', ...cue })
    if (position > code.length) continue
    const affected = tones.get(position)
    const text = code[position - 1]
    const line: ChangeWalkthroughLine = affected?.line ?? {
      kind: 'context', text,
      ...(side === 'before' ? { old_line: position } : { new_line: position }),
    }
    rows.push({
      kind: 'line', line_number: position, line,
      source_index: affected?.source_index ?? -(position + 1),
      tone: affected?.tone ?? 'context',
    })
  }
  return [{
    old_start: 1, old_count: side === 'before' ? code.length : 0,
    new_start: 1, new_count: side === 'with' ? code.length : 0,
    rows,
  }]
}
