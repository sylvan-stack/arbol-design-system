/* YAML-frontmatter parsing — shared by the generic document header and the
 * Blueprint contract renderer.
 *
 * The renderer carries no YAML dependency (same hand-written-parser discipline
 * as `blocks.ts`), so this parses the small frontmatter shape our corpus uses:
 * scalars (with folded continuation + a trailing `# comment` on plain scalars),
 * flow lists `[a, b]`, block sequences of maps (`- key: value`), and nested
 * maps. It never throws — an unfamiliar shape degrades to a best-effort value,
 * and a document with no `---` frontmatter block returns null. */

/** A parsed frontmatter value: scalar string, list, or nested map. */
export type FrontmatterValue = string | FrontmatterValue[] | { [k: string]: FrontmatterValue }
export type FrontmatterData = Record<string, FrontmatterValue>

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

/** Split a raw document into (frontmatter, body). Returns null when there is no
 * leading `---` frontmatter block — mirrors cli.py's `^---\n(.*?)\n---\n(.*)$`. */
export function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const norm = (content || '').replace(/\r\n/g, '\n')
  const m = FRONTMATTER_RE.exec(norm)
  if (!m) return null
  return { fm: m[1], body: m[2] }
}

type YLine = { indent: number; text: string }

function toYamlLines(fm: string): YLine[] {
  return fm
    .split('\n')
    .map((raw) => ({ indent: raw.match(/^ */)![0].length, text: raw.trim() }))
    // Drop blank lines and whole-line comments; value lines never start with `#`.
    .filter((l) => l.text !== '' && !l.text.startsWith('#'))
}

function unquote(v: string): string {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

/** Strip a trailing ` # comment` from a plain (unquoted) scalar. Quoted values
 * are returned verbatim so a `#` inside a path/anchor survives. */
function stripComment(v: string): string {
  if (/^["']/.test(v.trim())) return v.trim()
  const i = v.indexOf(' #')
  return (i >= 0 ? v.slice(0, i) : v).trim()
}

function parseFlowList(v: string): string[] {
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!inner.trim()) return []
  return inner
    .split(',')
    .map((s) => unquote(s.trim()))
    .filter((s) => s.length > 0)
}

const KEY_RE = /^([\w-]+):(?:[ \t]+(.*))?$/

/** Parse a mapping starting at `i` whose keys sit at column `indent`. Returns
 * the map plus the index of the first line that no longer belongs to it. */
function parseMap(lines: YLine[], i: number, indent: number): [FrontmatterData, number] {
  const map: FrontmatterData = {}
  while (i < lines.length) {
    const ln = lines[i]
    if (ln.indent < indent) break
    if (ln.indent > indent) {
      i++
      continue
    }
    const m = KEY_RE.exec(ln.text)
    if (!m) break
    const key = m[1]
    const rest = (m[2] ?? '').trim()
    i++
    if (rest === '') {
      // Nested block: a deeper sequence or map, else an empty value.
      if (i < lines.length && lines[i].indent > indent) {
        const childIndent = lines[i].indent
        if (lines[i].text.startsWith('- ')) {
          const [seq, ni] = parseSeq(lines, i, childIndent)
          map[key] = seq
          i = ni
        } else {
          const [child, ni] = parseMap(lines, i, childIndent)
          map[key] = child
          i = ni
        }
      } else {
        map[key] = ''
      }
    } else if (rest.startsWith('[')) {
      map[key] = parseFlowList(rest)
    } else {
      // Plain scalar, possibly folded over more-indented continuation lines
      // (a continuation is not a new `- ` item nor a `key:` mapping line).
      let val = rest
      while (
        i < lines.length &&
        lines[i].indent > indent &&
        !lines[i].text.startsWith('- ') &&
        !KEY_RE.test(lines[i].text)
      ) {
        val += ' ' + lines[i].text
        i++
      }
      map[key] = unquote(stripComment(val))
    }
  }
  return [map, i]
}

/** Parse a block sequence at column `indent`: a list of maps (`- key: value`)
 * or of scalars (`- value`). */
function parseSeq(lines: YLine[], i: number, indent: number): [FrontmatterValue[], number] {
  const arr: FrontmatterValue[] = []
  while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('- ')) {
    const inline = lines[i].text.slice(2).trim()
    // A `- key: value` item is a map; a bare `- value` item is a scalar.
    if (KEY_RE.test(inline)) {
      const itemLines: YLine[] = [{ indent: indent + 2, text: inline }]
      i++
      while (i < lines.length && lines[i].indent > indent) {
        itemLines.push(lines[i])
        i++
      }
      const [item] = parseMap(itemLines, 0, indent + 2)
      arr.push(item)
    } else {
      arr.push(unquote(stripComment(inline)))
      i++
    }
  }
  return [arr, i]
}

/** Parse a frontmatter block string into a map. */
export function parseYamlMap(fm: string): FrontmatterData {
  const lines = toYamlLines(fm)
  const baseIndent = lines.length ? Math.min(...lines.map((l) => l.indent)) : 0
  const [map] = parseMap(lines, 0, baseIndent)
  return map
}

/** Parse a document's leading frontmatter into (data, body). Returns null when
 * there is no frontmatter or it holds no fields — callers then render the whole
 * document as plain markdown. */
export function parseFrontmatter(content: string): { data: FrontmatterData; body: string } | null {
  const split = splitFrontmatter(content)
  if (!split) return null
  const data = parseYamlMap(split.fm)
  if (Object.keys(data).length === 0) return null
  return { data, body: split.body }
}
