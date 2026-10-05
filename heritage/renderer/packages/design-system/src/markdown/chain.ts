/* Blueprint Chain document model + parser.
 *
 * A Blueprint Chain (Mycel corpus `~/Artifacts/mycel/chains/<name>.py`) is a
 * deterministic Python program composing Blueprint runs; its RUNBOOK is the
 * `<name>.md` sibling that gets rendered here. The runbook declares `chain:
 * <name>` in frontmatter and lists the chain's steps — its Cells — in a
 * `## Cells` section, one per numbered line in a compact ` · `-delimited form:
 *
 *   1. **Mirror fetch** · *Tool* · in: Jira key · out: raw mirror · gate: exit 0
 *   2. **format-ticket** · *Blueprint* · in: raw mirror · out: `{ws}/ticket.md` · gate: `done_when`
 *
 * A Cell (GLOSSARY › Cell) is one step of a chain — a `tool`, `blueprint`, or
 * `lambda`. This module mirrors that shape so the rendered view shows each Cell
 * as a card with its kind and input → output, instead of a flat list. Parsing
 * the ` · `-delimited prose keeps a single searchable source (the corpus indexes
 * the body; frontmatter is stripped). It never throws — a non-chain document
 * returns `null` so callers fall back to plain Markdown.
 *
 * Frontmatter parsing is shared with the generic header via `frontmatter.ts`. */
import { splitFrontmatter, parseYamlMap } from './frontmatter'

export type ChainCellKind = 'tool' | 'blueprint' | 'lambda' | ''

export type ChainCell = {
  n: number
  name: string
  kind: ChainCellKind
  /** `in:` field — what the Cell consumes. */
  input?: string
  /** `out:` field — what the Cell produces. */
  output?: string
  /** `gate:` field — the code-enforced completion check. */
  gate?: string
  /** Any trailing `note:` / unlabelled remark. */
  note?: string
}

export type ChainMeta = {
  name: string
  summary?: string
  /** Frontmatter `default-recipe:` — the chain's fallback Brain Recipe. */
  defaultRecipe?: string
}

export type ParsedChain = {
  meta: ChainMeta
  cells: ChainCell[]
  /** Body markdown before the `## Cells` section. */
  bodyBefore: string
  /** Body markdown after the `## Cells` section. */
  bodyAfter: string
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** True when a document's frontmatter declares `chain:` — the chain runbook
 * marker. Cheap: only inspects the frontmatter block. */
export function isChain(content: string): boolean {
  const split = splitFrontmatter(content)
  if (!split) return false
  return /(^|\n)chain:[ \t]*\S/.test(split.fm)
}

const KIND_ALIASES: Record<string, ChainCellKind> = {
  tool: 'tool',
  blueprint: 'blueprint',
  bp: 'blueprint',
  lambda: 'lambda',
}

/** Parse one `## Cells` line body (after the `N. `) into a Cell. Fields are
 * ` · `-separated; the first `**bold**` is the name, an `*italic*` token is the
 * kind, and the rest are `label: value` pairs (`in`/`out`/`gate`/`note`). */
function parseCellLine(n: number, body: string): ChainCell {
  const cell: ChainCell = { n, name: '', kind: '' }
  const segs = body.split('·').map((s) => s.trim()).filter(Boolean)
  const notes: string[] = []
  for (const seg of segs) {
    const nameM = /^\*\*(.+?)\*\*$/.exec(seg)
    if (nameM && !cell.name) {
      cell.name = nameM[1].trim()
      continue
    }
    const kindM = /^[*_]?(tool|blueprint|bp|lambda)[*_]?$/i.exec(seg)
    if (kindM && !cell.kind) {
      cell.kind = KIND_ALIASES[kindM[1].toLowerCase()]
      continue
    }
    const fieldM = /^(in|out|gate|note)\s*:\s*(.+)$/i.exec(seg)
    if (fieldM) {
      const val = fieldM[2].trim()
      const key = fieldM[1].toLowerCase()
      if (key === 'in') cell.input = val
      else if (key === 'out') cell.output = val
      else if (key === 'gate') cell.gate = val
      else notes.push(val)
      continue
    }
    // An unlabelled segment (e.g. a stray name without bold) becomes a note.
    if (!cell.name && /^\*?\*?[\w-]/.test(seg)) cell.name = seg.replace(/^\*+|\*+$/g, '').trim()
    else notes.push(seg)
  }
  if (notes.length) cell.note = notes.join(' · ')
  return cell
}

/** Split the body around a `## Cells` section and parse its numbered list. When
 * there is no well-formed Cells list, degrades to the whole body as `bodyBefore`
 * with no cells (the doc then renders as plain Markdown around an empty list). */
function parseCells(body: string): { before: string; cells: ChainCell[]; after: string } {
  const head = /(^|\n)##[ \t]+Cells[ \t]*\n/i.exec(body)
  if (!head) return { before: body.trim(), cells: [], after: '' }
  const before = body.slice(0, head.index).trim()
  const rest = body.slice(head.index + head[0].length)
  const next = /\n##[ \t]+/.exec(rest)
  const section = next ? rest.slice(0, next.index) : rest
  const after = next ? rest.slice(next.index).trim() : ''

  const cells: ChainCell[] = []
  // Split before each top-level "N. " (start of line); ignore any intro/legend.
  for (const raw of section.split(/\n(?=\d+\.[ \t])/)) {
    const item = raw.trim().replace(/\n\s+/g, ' ') // fold wrapped lines
    const hm = /^(\d+)\.[ \t]+/.exec(item)
    if (!hm) continue
    cells.push(parseCellLine(parseInt(hm[1], 10), item.slice(hm[0].length)))
  }
  return { before, cells, after }
}

/** Strip a single leading `# …` title (e.g. `# Runbook: start-new-ticket`) —
 * the chain name already leads the rendered header. */
function stripLeadingTitle(body: string): string {
  return body.replace(/^\s*#[ \t]+[^\n]*\n+/, '')
}

/** Parse a Blueprint Chain runbook. Returns null when the document is not a
 * chain (no `chain:` frontmatter) so callers fall back to plain Markdown. */
export function parseChain(content: string): ParsedChain | null {
  const split = splitFrontmatter(content)
  if (!split) return null
  const fm = parseYamlMap(split.fm)
  const name = str(fm.chain)
  if (!name) return null

  const meta: ChainMeta = {
    name,
    summary: str(fm.summary),
    defaultRecipe: str(fm['default-recipe']),
  }
  const body = stripLeadingTitle(split.body).trim()
  const { before, cells, after } = parseCells(body)
  return { meta, cells, bodyBefore: before, bodyAfter: after }
}
