import type { NativeToolCallView } from '@arbol/events'

/* A single rendered markdown block. The generic kinds (p/h/quote/separator/code/ul/ol/table) are
 * produced by `parseMarkdown` below; `sources` is produced by the doc views'
 * `parseDocMarkdown` (a Source-Refs comment lifted into the flow when the
 * Sources toggle is on); the two extension kinds (thinking and native)
 * are assembled by Elma's chat layer and rendered via MarkdownBlocks'
 * pluggable snippets — design-system only needs their shapes for typing. */
export type AnswerBlock =
  | { t: 'p'; v: string }
  | { t: 'h'; v: string }
  | { t: 'quote'; v: string }
  | { t: 'separator' }
  | { t: 'code'; v: string }
  | { t: 'ul'; v: string[] }
  | { t: 'ol'; v: string[]; start?: number }
  | { t: 'table'; header: string[]; rows: string[][] }
  | { t: 'sources'; refs: string[] }
  | { t: 'thinking'; v: string }
  | { t: 'native'; call: NativeToolCallView }

/* Split a GitHub-Flavored Markdown pipe-table row into cells (common safe subset;
 * escaped pipes kept literal so `A \| B` works inside a cell). */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  let escaped = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (escaped) {
      cell += ch === '|' ? '|' : `\\${ch}`
      escaped = false
      continue
    }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '|') { cells.push(cell.trim()); cell = ''; continue }
    cell += ch
  }
  if (escaped) cell += '\\'
  cells.push(cell.trim())
  return cells
}

const isTableSeparatorCell = (cell: string): boolean => /^:?-{3,}:?$/.test(cell.trim())

function isPotentialTableHeader(line: string): boolean {
  if (!line.includes('|')) return false
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.some((c) => c.length > 0)
}

function isTableSeparatorLine(line: string, expectedCells: number): boolean {
  const cells = splitTableRow(line)
  return cells.length === expectedCells && cells.length > 0 && cells.every(isTableSeparatorCell)
}

function normalizeTableRow(cells: string[], width: number): string[] {
  const out = cells.slice(0, width)
  while (out.length < width) out.push('')
  return out
}

/* Return the opening marker for a CommonMark-style fenced code block. The
 * closing fence must use the same character and contain at least as many marks;
 * this prevents a ``` line inside a ~~~ block (and vice versa) from ending it. */
function codeFence(line: string): string | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
  return match?.[1] || null
}

function isClosingCodeFence(line: string, opening: string): boolean {
  const marker = opening[0]
  const match = line.match(/^\s{0,3}([`~]+)[ \t]*$/)
  return Boolean(match && match[1][0] === marker && match[1].length >= opening.length)
}

/* The markdown-subset parser: backtick/tilde fenced code, ATX headings,
 * blockquotes, Arbol separators, ordered/unordered lists, GFM pipe tables, and
 * blank-line-separated paragraphs.
 * Inline marks are left as-is (rendered by InlineMarkdown). Total + cheap: never
 * throws on partial input. */
export function parseMarkdown(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n')
  let para: string[] = []
  const flushPara = () => {
    if (para.length) {
      const v = para.join(' ').trim()
      if (v) blocks.push({ t: 'p', v })
      para = []
    }
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = codeFence(line)
    if (fence) {
      flushPara()
      const code: string[] = []
      i++
      while (i < lines.length && !isClosingCodeFence(lines[i], fence)) { code.push(lines[i]); i++ }
      if (i < lines.length) i++ // consume the closing fence; partial fences run to EOF
      blocks.push({ t: 'code', v: code.join('\n') })
      continue
    }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/)
    if (heading) { flushPara(); blocks.push({ t: 'h', v: heading[1].trim() }); i++; continue }
    // Arbol's authored section break is a standalone em dash. Accept a run of
    // em dashes too, plus CommonMark thematic breaks, but never a dash in prose.
    if (/^\s*(?:—\s*)+$/.test(line) || /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flushPara(); blocks.push({ t: 'separator' }); i++; continue
    }
    const quote = line.match(/^\s{0,3}>[ \t]?(.*)$/)
    if (quote) {
      flushPara()
      const quoted: string[] = []
      while (i < lines.length) {
        const next = lines[i].match(/^\s{0,3}>[ \t]?(.*)$/)
        if (!next) break
        quoted.push(next[1].trim())
        i++
      }
      const v = quoted.join(' ').replace(/\s+/g, ' ').trim()
      if (v) blocks.push({ t: 'quote', v })
      continue
    }
    if (isPotentialTableHeader(line) && i + 1 < lines.length) {
      const header = splitTableRow(line)
      if (isTableSeparatorLine(lines[i + 1], header.length)) {
        flushPara()
        const rows: string[][] = []
        i += 2
        while (i < lines.length && !/^\s*$/.test(lines[i]) && lines[i].includes('|')) {
          rows.push(normalizeTableRow(splitTableRow(lines[i]), header.length)); i++
        }
        blocks.push({ t: 'table', header, rows })
        continue
      }
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '').trim()); i++ }
      blocks.push({ t: 'ul', v: items })
      continue
    }
    const orderedItem = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (orderedItem) {
      flushPara()
      const start = Number(orderedItem[1])
      const items: string[] = []
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (!item) break
        items.push(item[2].trim())
        i++
      }
      blocks.push({ t: 'ol', v: items, ...(start === 1 ? {} : { start }) })
      continue
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue }
    para.push(line.trim())
    i++
  }
  flushPara()
  return blocks
}
