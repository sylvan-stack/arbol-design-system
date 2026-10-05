/** A fully captured review snapshot. Loading and syncing belong to the host app. */
export type HunkReviewPosition = { new_path?: string; old_path?: string; new_line?: number; old_line?: number }
export type HunkReviewComment = { id?: string | number; body?: string; author?: { name?: string }; created_at?: string; resolved?: boolean; system?: boolean; position?: HunkReviewPosition | null }
/** Notes in one provider discussion are rendered together as a review thread. */
export type HunkReviewDiscussion = { id?: string; notes?: HunkReviewComment[] }
export type HunkReviewFile = { path: string; old_path?: string; patch: string; new_file?: boolean; deleted_file?: boolean; renamed_file?: boolean; binary?: boolean }
/** Renderer-only durable Hunk shape. Its patch and provider discussions have already been captured by the caller; this package intentionally makes no RPC or Git/provider requests. */
export type HunkReviewSnapshot = { hunk_id?: string; title?: string; files: HunkReviewFile[]; discussions?: HunkReviewDiscussion[] }
export type HunkReviewMode = 'before' | 'diff' | 'after'
type DiffLineKind = 'context' | 'addition' | 'deletion' | 'no-newline'
export type HunkReviewLine = { kind: DiffLineKind; text: string; oldLine?: number; newLine?: number }
export type HunkReviewBlock = { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: HunkReviewLine[] }
export type HunkReviewCodeTone = 'context' | 'removed' | 'added' | 'edited'
export type HunkReviewCodeRow = { kind: 'line'; line: HunkReviewLine; lineNumber: number; tone: HunkReviewCodeTone } | { kind: 'cue'; tone: 'removed' | 'added'; count: number }
export type HunkReviewCodeBlock = { start: number; rows: HunkReviewCodeRow[] }

export function parseHunkPatch(patch: string): HunkReviewBlock[] {
  const blocks: HunkReviewBlock[] = []; let current: HunkReviewBlock | null = null; let oldLine = 0; let newLine = 0
  for (const line of patch.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (header) { oldLine = Number(header[1]); newLine = Number(header[3]); current = { oldStart: oldLine, oldCount: Number(header[2] ?? 1), newStart: newLine, newCount: Number(header[4] ?? 1), lines: [] }; blocks.push(current) }
    else if (current && line.startsWith('\\ No newline')) current.lines.push({ kind: 'no-newline', text: line })
    else if (current && line.startsWith('+')) current.lines.push({ kind: 'addition', text: line.slice(1), newLine: newLine++ })
    else if (current && line.startsWith('-')) current.lines.push({ kind: 'deletion', text: line.slice(1), oldLine: oldLine++ })
    else if (current && line.startsWith(' ')) current.lines.push({ kind: 'context', text: line.slice(1), oldLine: oldLine++, newLine: newLine++ })
  }
  return blocks
}

/** Project a captured patch into its before or after code view. */
export function projectHunkCodeVersion(blocks: HunkReviewBlock[], mode: 'before' | 'after'): HunkReviewCodeBlock[] {
  return blocks.map((block) => {
    const rows: HunkReviewCodeRow[] = []; let cursor = 0
    while (cursor < block.lines.length) {
      const line = block.lines[cursor]
      if (line.kind === 'context') { rows.push({ kind: 'line', line, lineNumber: mode === 'before' ? line.oldLine! : line.newLine!, tone: 'context' }); cursor += 1; continue }
      if (line.kind === 'no-newline') { cursor += 1; continue }
      const changed: HunkReviewLine[] = []
      while (cursor < block.lines.length && block.lines[cursor].kind !== 'context') { if (block.lines[cursor].kind !== 'no-newline') changed.push(block.lines[cursor]); cursor += 1 }
      const deleted = changed.filter((item) => item.kind === 'deletion'); const added = changed.filter((item) => item.kind === 'addition'); const edited = Math.min(deleted.length, added.length)
      if (mode === 'before') { deleted.forEach((item, index) => rows.push({ kind: 'line', line: item, lineNumber: item.oldLine!, tone: index < edited ? 'edited' : 'removed' })); if (added.length > edited) rows.push({ kind: 'cue', tone: 'added', count: added.length - edited }) }
      else { added.forEach((item, index) => rows.push({ kind: 'line', line: item, lineNumber: item.newLine!, tone: index < edited ? 'edited' : 'added' })); if (deleted.length > edited) rows.push({ kind: 'cue', tone: 'removed', count: deleted.length - edited }) }
    }
    return { start: mode === 'before' ? block.oldStart : block.newStart, rows }
  })
}

/** Split a Git patch captured as one string into its individual file diffs. */
export function filesFromCapturedPatch(patch: string): HunkReviewFile[] {
  const pieces = patch.split(/(?=^diff --git )/m).filter(Boolean)
  return pieces.map((piece, index) => {
    const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(piece); const oldName = /^--- a\/(.+)$/m.exec(piece)?.[1]; const newName = /^\+\+\+ b\/(.+)$/m.exec(piece)?.[1]
    const old_path = oldName === '/dev/null' ? undefined : (oldName ?? header?.[1]); const path = newName === '/dev/null' ? (old_path ?? header?.[1] ?? `File ${index + 1}`) : (newName ?? header?.[2] ?? old_path ?? `File ${index + 1}`)
    return { path, ...(old_path && old_path !== path ? { old_path } : {}), patch: piece, new_file: /new file mode/.test(piece), deleted_file: /deleted file mode/.test(piece), renamed_file: /rename (from|to) /.test(piece), binary: /Binary files .* differ/.test(piece) }
  })
}
