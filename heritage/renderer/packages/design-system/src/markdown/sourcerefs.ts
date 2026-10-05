/* Source Refs — `<!-- sources: … -->` provenance comments in corpus documents.
 *
 * The convention (GLOSSARY › Source Ref) puts refs in HTML comments precisely so
 * a rendered document is NOT polluted by them. Our markdown parser is not
 * spec-compliant HTML — a raw comment would render as literal text — so the doc
 * views parse bodies through `parseDocMarkdown`, which strips every HTML
 * comment by default (restoring the invisible-by-design behavior) and, when the
 * reader flips the Sources toggle, lifts each `sources:` comment into a
 * `{ t: 'sources' }` block IN PLACE — per-section refs stay attached to the
 * section they follow, mirroring how ingest attaches them to that section's
 * chunk. Non-`sources:` comments are always dropped.
 *
 * Ref forms (natural keys, per the authoring rule): `repo:path[#symbol]` for
 * repo-hosted code, `path[#anchor]` for sibling artifacts. Chips resolve
 * best-effort: repo-prefixed refs map onto the local worktree layout; relative
 * paths resolve against the document's own directory; anything else renders as
 * a plain (non-clickable) chip. */

import { parseMarkdown, type AnswerBlock } from './blocks'
import { resolveLocalPath } from './markdown'

const SOURCES_COMMENT_RE = /<!--\s*sources:([\s\S]*?)-->/gi
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

function refsOf(inner: string): string[] {
  return inner
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** True when a document body carries at least one `<!-- sources: … -->` ref —
 * drives the visibility of the Sources toggle. */
export function hasSourceRefs(content: string): boolean {
  SOURCES_COMMENT_RE.lastIndex = 0
  return SOURCES_COMMENT_RE.test(content || '')
}

/** Total refs across all `sources:` comments (the toggle's count). */
export function countSourceRefs(content: string): number {
  SOURCES_COMMENT_RE.lastIndex = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = SOURCES_COMMENT_RE.exec(content || '')) !== null) n += refsOf(m[1]).length
  return n
}

/* The worktree-container convention (GLOSSARY › worktree containers): container
 * repos live at ~/repo/<name>/<branch>/ with a clean default worktree always
 * present — main/ for Arbol. Other `~/repo/*` checkouts are plain repos.
 * Unknown prefixes (e.g. `jira-mirror:`) stay non-clickable rather than
 * guessing. */
const WORKTREE_CONTAINERS: Record<string, string> = {
  arbol: 'main',
}
const PLAIN_REPOS = new Set(['design-system', 'hyperkey', 'arco', 'integrations', 'effector', 'scratch'])

const REPO_REF_RE = /^([\w][\w.-]*):(.+)$/

/** Best-effort file target for a Source Ref; null when unresolvable (the chip
 * then renders non-clickable). The `#symbol` locator is kept on the target so
 * the preview's heading/line scroll logic can use it where it applies. */
export function resolveSourceRef(ref: string, baseDir?: string): string | null {
  const t = (ref || '').trim()
  if (!t) return null
  const m = REPO_REF_RE.exec(t)
  if (m && !m[1].includes('/') && m[2].includes('/')) {
    const repo = m[1]
    const key = repo.toLowerCase()
    const wt = WORKTREE_CONTAINERS[key]
    if (wt) return `~/repo/${repo}/${wt}/${m[2]}`
    if (PLAIN_REPOS.has(key)) return `~/repo/${repo}/${m[2]}`
    return null // unknown prefix (jira-mirror:, …) — don't guess
  }
  if (m && !m[2].includes('/')) return null // opaque `kind:name` refs
  // A plain path ref (possibly `file.md#Heading`) — resolve like any local link.
  return resolveLocalPath(t, baseDir)
}

/** Parse a document body for the doc views: all HTML comments removed; with
 * `showSources`, each `sources:` comment becomes a `{ t: 'sources' }` block at
 * its own position in the flow. */
export function parseDocMarkdown(text: string, opts?: { showSources?: boolean }): AnswerBlock[] {
  const src = (text || '').replace(/\r\n/g, '\n')
  if (!opts?.showSources) {
    return parseMarkdown(src.replace(HTML_COMMENT_RE, ''))
  }
  const blocks: AnswerBlock[] = []
  SOURCES_COMMENT_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = SOURCES_COMMENT_RE.exec(src)) !== null) {
    const before = src.slice(last, m.index).replace(HTML_COMMENT_RE, '')
    if (before.trim()) blocks.push(...parseMarkdown(before))
    const refs = refsOf(m[1])
    if (refs.length) blocks.push({ t: 'sources', refs })
    last = m.index + m[0].length
  }
  const rest = src.slice(last).replace(HTML_COMMENT_RE, '')
  if (rest.trim()) blocks.push(...parseMarkdown(rest))
  return blocks
}
