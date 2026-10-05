/* Blueprint document model + parser.
 *
 * A Blueprint (Mycel corpus `~/Artifacts/mycel/blueprints/*.md`) is a typed,
 * non-deterministic function written as Markdown + YAML frontmatter: the
 * frontmatter is a validated CONTRACT (name/summary/typed inputs/outputs/
 * done_when/restrictions/recipe), the body is the instructions the executing
 * agent follows (Goal / Process / Quality bar, an optional `## Steps` roster,
 * an optional `## Output` response spec). See ~/Artifacts/Arbol/plans/blueprints.md
 * and the engine parser at blueprint/blueprint_engine/cli.py — this mirrors its
 * frontmatter + step splitting so the rendered view matches how a run reads.
 *
 * Frontmatter parsing (the YAML-subset reader) is shared with the generic
 * document header via `frontmatter.ts`; this module adds only the
 * blueprint-specific shape on top (typed inputs/outputs, `## Steps` roster).
 * It never throws — a non-blueprint document returns `null` so callers fall
 * back to plain Markdown. */
import { splitFrontmatter, parseYamlMap, type FrontmatterData } from './frontmatter'

export type BlueprintInput = {
  name: string
  type?: string
  required?: boolean
  default?: string
  description?: string
}

export type BlueprintOutput = {
  artifact: string
  must: string[]
}

export type BlueprintStep = {
  n: number
  /** Optional step name from `### Step N. <name>`. */
  name: string
  /** The step's instruction body (raw markdown). */
  text: string
}

export type BlueprintMeta = {
  name: string
  summary?: string
  inputs: BlueprintInput[]
  outputs: BlueprintOutput[]
  doneWhen?: string
  restrictions: string[]
  /** Frontmatter `recipe:` — a hard pin, or `inherit` (default). */
  recipe?: string
  /** Frontmatter `default-recipe:` — fallback when `recipe: inherit`. */
  defaultRecipe?: string
}

export type ParsedBlueprint = {
  meta: BlueprintMeta
  /** Instruction body with any `## Steps` section and leading `# …` title
   * removed — rendered through the normal markdown pipeline. Used as the whole
   * body when there is no `## Process` split. */
  body: string
  /** Parsed `## Steps` roster (empty for a single-step blueprint). */
  steps: BlueprintStep[]
  /** Parsed `## Process` numbered steps — the informal step form every daily
   * blueprint uses (empty when the doc has no `## Process` list). Rendered as
   * separated cards so each step reads distinctly. */
  process: BlueprintStep[]
  /** Body markdown before the `## Process` section (e.g. Goal). */
  bodyBefore: string
  /** Body markdown after the `## Process` section (e.g. Quality bar, Output). */
  bodyAfter: string
}

/** True when a document's frontmatter declares `role: blueprint`. Cheap enough
 * to call on every previewed file: it only inspects the frontmatter block. */
export function isBlueprint(content: string): boolean {
  const split = splitFrontmatter(content)
  if (!split) return false
  return /(^|\n)role:[ \t]*blueprint\b/.test(split.fm)
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().toLowerCase()
  if (t === 'true' || t === 'yes') return true
  if (t === 'false' || t === 'no') return false
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

const _STEP_HEAD = /^Step\s+(\d+)\s*[.:]?\s*(.*)$/i

/** Split a body into (preamble, steps) around a `## Steps` section, mirroring
 * cli.py `_parse_steps`. Numbering is obligatory; a malformed roster degrades
 * to no steps (the whole body stays as preamble) rather than throwing. */
function parseSteps(body: string): { preamble: string; steps: BlueprintStep[] } {
  const parts = body.split(/(?:^|\n)##[ \t]+Steps[ \t]*\n/i)
  if (parts.length === 1) return { preamble: body.trim(), steps: [] }
  let preamble = parts[0].trim()
  const chunks = ('\n' + parts[1]).split(/\n###[ \t]+/)
  const intro = chunks[0].trim()
  if (intro) preamble = (preamble + '\n\n' + intro).trim()
  const steps: BlueprintStep[] = []
  for (const c of chunks.slice(1)) {
    const chunk = c.trim()
    if (!chunk) continue
    const nl = chunk.indexOf('\n')
    const head = (nl === -1 ? chunk : chunk.slice(0, nl)).trim()
    const rest = nl === -1 ? '' : chunk.slice(nl + 1).trim()
    const m = _STEP_HEAD.exec(head)
    if (!m) return { preamble: body.trim(), steps: [] } // not a well-formed roster
    steps.push({ n: parseInt(m[1], 10), name: (m[2] || '').trim().replace(/\.$/, ''), text: rest })
  }
  const ordered = steps.every((s, idx) => s.n === idx + 1)
  if (!ordered) return { preamble: body.trim(), steps: [] }
  return { preamble, steps }
}

/** Remove a single leading `# …` title (e.g. `# Blueprint: Code Review`) — the
 * name already leads the contract header, so the H1 would be redundant. */
function stripLeadingTitle(body: string): string {
  return body.replace(/^\s*#[ \t]+[^\n]*\n+/, '')
}

/** A Process item opens with a bold **Title.** by convention (plans/blueprints.md
 * "## Process"). Split it off as the card heading; the rest is the card body. */
function splitProcessItem(item: string): { name: string; text: string } {
  const m = /^\*\*(.+?)\*\*[.:]?[ \t]*/.exec(item)
  if (!m) return { name: '', text: item.trim() }
  return { name: m[1].trim().replace(/[.:]\s*$/, ''), text: item.slice(m[0].length).trim() }
}

/** Dedent continuation lines by up to `n` leading spaces so an item's wrapped
 * text and nested bullets parse as markdown at the item root. */
function dedent(text: string, n: number): string {
  const re = new RegExp(`^ {1,${n}}`)
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : l.replace(re, '')))
    .join('\n')
}

/** Split a body around a `## Process` section, parsing its top-level ordered
 * list into step cards. Degrades to `{ before: body, process: [], after: '' }`
 * (whole body rendered plainly) when there is no well-formed Process list — so
 * a blueprint that phrases Process differently never loses content. */
function parseProcess(body: string): { before: string; process: BlueprintStep[]; after: string } {
  const head = /(^|\n)##[ \t]+Process[ \t]*\n/i.exec(body)
  if (!head) return { before: body, process: [], after: '' }
  const before = body.slice(0, head.index).trim()
  const rest = body.slice(head.index + head[0].length)
  const next = /\n##[ \t]+/.exec(rest)
  const section = next ? rest.slice(0, next.index) : rest
  const after = next ? rest.slice(next.index).trim() : ''

  const first = /(^|\n)\d+\.[ \t]/.exec(section)
  if (!first) return { before: body.trim(), process: [], after: '' }
  const introEnd = first.index + (first[1] ? 1 : 0)
  const intro = section.slice(0, introEnd).trim()
  const list = section.slice(introEnd)

  const process: BlueprintStep[] = []
  for (const raw of list.split(/\n(?=\d+\.[ \t])/)) {
    const item = raw.trimEnd()
    const hm = /^(\d+)\.[ \t]+/.exec(item)
    if (!hm) continue
    const { name, text } = splitProcessItem(dedent(item.slice(hm[0].length), hm[0].length))
    process.push({ n: parseInt(hm[1], 10), name, text })
  }
  if (process.length < 2 || !process.every((s, i) => s.n === i + 1)) {
    return { before: body.trim(), process: [], after: '' }
  }
  return { before: intro ? `${before}\n\n${intro}`.trim() : before, process, after }
}

function toInput(m: FrontmatterData): BlueprintInput {
  return {
    name: str(m.name) ?? '',
    type: str(m.type),
    required: asBool(m.required),
    default: str(m.default),
    description: str(m.description),
  }
}

function toOutput(m: FrontmatterData): BlueprintOutput {
  const must = Array.isArray(m.must) ? (m.must as unknown[]).map((x) => String(x)) : []
  return { artifact: str(m.artifact) ?? '', must }
}

/** Parse a Blueprint document. Returns null when it is not a blueprint (no
 * `role: blueprint` frontmatter) so callers can fall back to plain Markdown. */
export function parseBlueprint(content: string): ParsedBlueprint | null {
  const split = splitFrontmatter(content)
  if (!split) return null
  const fm = parseYamlMap(split.fm)
  if (str(fm.role) !== 'blueprint') return null

  const inputs = Array.isArray(fm.inputs) ? (fm.inputs as FrontmatterData[]).map(toInput) : []
  const outputs = Array.isArray(fm.outputs) ? (fm.outputs as FrontmatterData[]).map(toOutput) : []
  const restrictions = Array.isArray(fm.restrictions)
    ? (fm.restrictions as unknown[]).map((x) => String(x))
    : str(fm.restrictions)
      ? [str(fm.restrictions)!]
      : []

  const meta: BlueprintMeta = {
    name: str(fm.name) ?? '',
    summary: str(fm.summary),
    inputs,
    outputs,
    doneWhen: str(fm.done_when),
    restrictions,
    recipe: str(fm.recipe),
    defaultRecipe: str(fm['default-recipe']),
  }

  // HTML comments (the `<!-- sources: … -->` blocks) stay in the body — the
  // doc renderer strips or reveals them per the Sources toggle.
  const { preamble, steps } = parseSteps(split.body)
  const body = stripLeadingTitle(preamble).trim()
  // Only pull Process into cards when the doc has no formal `## Steps` roster —
  // the two are alternatives, and a formal roster already renders as cards.
  const proc = steps.length ? { before: body, process: [], after: '' } : parseProcess(body)
  return { meta, body, steps, process: proc.process, bodyBefore: proc.before, bodyAfter: proc.after }
}
