/* Framework-agnostic markdown/link helpers extracted from MarkdownView.tsx so the
 * Svelte components (HighlightedText, InlineMarkdown, CodeBlock, …) can share them.
 * No framework imports — pure TS, kept identical to the React original. */

/* A search-highlight spec: a query plus a mutable ordinal counter shared across
 * the whole render pass (so every match gets a globally-unique ordinal and the
 * `targetIndex`-th match is flagged as the scroll target). `counter` is a plain
 * `{ current: number }` ref object the parent owns and resets before each pass. */
export type TextHighlightSpec = {
  query: string
  targetIndex?: number
  counter: { current: number }
}

// Auto-linkify local file/folder references in prose. To avoid linkifying
// ordinary slashed prose (`add/list/remove`, `channels/users`), we only match
// paths with an unambiguous local-path prefix: `/Users/…` (absolute), `~/…`
// (home), or `./…` / `../…` (relative). Folders are allowed — no file-extension
// requirement (what a folder click does is handled separately). `file://` URLs
// are always linked. The leading lookbehind keeps us from matching a fragment
// inside a URL or word (e.g. the `/Users…` inside `foo/Users`).
export const autoLocalFileRe = /(file:\/\/[^\s<>)\]}'"]+|(?<![\w~.])(?:\/Users(?![A-Za-z0-9])|~\/|\.\.?\/)[^\s<>)\]}'"]*)/g
export const trailingLinkPunctuationRe = /[.,;:!?]+$/

export function normalizeLocalFileHref(href: string): string | null {
  const t = href.trim()
  if (!t) return null
  // Drop a #fragment (e.g. a heading anchor) — we open the file, not a section.
  const noHash = t.replace(/#.*$/, '')
  if (t.startsWith('~/')) return noHash
  if (t.startsWith('./') || t.startsWith('../')) return noHash
  if (t.startsWith('/')) return noHash
  if (/^file:\/\//i.test(t)) {
    try {
      const url = new URL(t)
      if (url.host && url.host !== 'localhost') return null
      return decodeURIComponent(url.pathname)
    } catch {
      const stripped = t.replace(/^file:\/\//i, '')
      return stripped.startsWith('/') ? decodeURIComponent(stripped) : null
    }
  }
  return null
}

// Resolve a (possibly relative) local path against a base directory. Absolute
// (`/…`) and home (`~…`) paths pass through; relative segments (`./`, `../`,
// bare `dir/file`) resolve against baseDir so cross-doc references land in the
// right place (the previewed document's folder, not the chat working dir).
export function resolveLocalPath(path: string, baseDir?: string): string {
  if (path.startsWith('/') || path.startsWith('~')) return path
  if (!baseDir) return path
  const segs = baseDir.replace(/\/+$/, '').split('/')
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') segs.pop()
    else segs.push(seg)
  }
  return segs.join('/') || '/'
}

// Split an in-document locator off a link target: `path:line`, `path#L51`/`#51`
// (line numbers) or `path#anchor` (heading id/title). Returns the file part and
// the locator suffix (kept verbatim so it survives resolution for the tooltip
// and is re-parsed when the file opens).
export function splitLocator(t: string): { filePart: string; suffix: string } {
  const colon = t.match(/^(.*?):(\d+)$/)
  if (colon && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return { filePart: colon[1], suffix: `:${colon[2]}` }
  const h = t.indexOf('#')
  if (h >= 0) return { filePart: t.slice(0, h), suffix: t.slice(h) }
  return { filePart: t, suffix: '' }
}

// Resolve a (relative) link target against baseDir while preserving its locator.
export function resolveLink(rawTarget: string, baseDir?: string): string {
  const { filePart, suffix } = splitLocator(rawTarget)
  return resolveLocalPath(filePart, baseDir) + suffix
}

export type LinkInfo = { href: string; title: string; external: boolean; file?: string }

// GitHub-style heading slug: lowercase, drop punctuation, spaces→'-'.
// Matches the `#anchor` ids authors write (e.g. '## Chat Session' → 'chat-session').
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-')
}

// Classify a markdown/auto href into an actionable link, or null when it points
// nowhere we can act on (an unknown scheme, or a `#anchor` with no enclosing
// document). Callers render null as plain text instead of a dead link.
// `docPath` is the path of the document currently being previewed (if any) — a
// bare `#anchor` resolves to a heading WITHIN it. `title`/`href` carry the exact
// destination (incl. locator) for the hover tooltip.
export function classifyHref(rawHref: string, baseDir?: string, docPath?: string): LinkInfo | null {
  const t = rawHref.trim()
  if (!t) return null
  if (t.startsWith('#')) {
    // In-document anchor: a real markdown link, but only actionable when we know
    // the enclosing document (i.e. inside the preview). In chat there's no
    // current document, so it stays plain text.
    if (!docPath) return null
    return { href: docPath + t, title: t, external: false, file: docPath + t }
  }
  if (/^(https?:|mailto:)/i.test(t)) return { href: t, title: t, external: true }
  if (/^file:\/\//i.test(t)) {
    const p = normalizeLocalFileHref(t)
    if (!p) return null
    const full = resolveLink(p, baseDir)
    return { href: full, title: full, external: false, file: full }
  }
  // Reject explicit url schemes (javascript:, data:, vscode:, …) — but split the
  // locator off first so a real path with a `:line` suffix isn't mistaken for one.
  if (/^[a-z][a-z0-9+.-]*:/i.test(splitLocator(t).filePart)) return null
  // Local path: absolute, ~, ./, ../, or a bare relative path (`doc.md`, `dir/`).
  const full = resolveLink(t, baseDir)
  return { href: full, title: full, external: false, file: full }
}

// A standalone local-path token used as an inline-code span — returns the raw
// link target (path plus any `#anchor`/`:line` locator) when the WHOLE code span
// is a local path, else null (stays a plain code chip). A code chip is ONLY a
// link when it starts with an explicit local-path prefix (`/Users/…`, `~/…`,
// `./…`, `../…`, `file://…`); a bare token like `ENTITIES.KINDS` or `array.length`
// has nothing marking it as a path, so it stays code. (Bare relative file refs
// must use markdown-link syntax `[label](path)` to become links.)
export function localPathInCode(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  if (/^(file:\/\/|\/Users(?![A-Za-z0-9])|~\/|\.\.?\/)/.test(t)) return t
  return null
}

export function prettyJson(raw: string): string | null {
  const t = (raw || '').trim()
  if (!t) return null
  const candidates = [
    t,
    t.replace(/,(\s*[}\]])/g, '$1'),
    t.replace(/,(\s*[}\]])/g, '$1').replace(/'/g, '"'),
  ]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const pretty = JSON.stringify(parsed, null, 2)
      return typeof pretty === 'string' ? pretty : null
    } catch {
      /* try the next lenient form */
    }
  }
  return null
}

/* A JSON syntax token: either inert text or a colored span. The Svelte
 * JsonCodeBlock walks this list instead of building React nodes. */
export type JsonToken = { text: string; kind: 'plain' | 'key' | 'string' | 'primitive' }

export function tokenizeJson(pretty: string): JsonToken[] {
  const tokens: JsonToken[] = []
  const re = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(pretty)) !== null) {
    if (m.index > last) tokens.push({ text: pretty.slice(last, m.index), kind: 'plain' })
    const token = m[0]
    const isKey = token.startsWith('"') && /^\s*:/.test(pretty.slice(re.lastIndex))
    const kind: JsonToken['kind'] = isKey ? 'key' : token.startsWith('"') ? 'string' : 'primitive'
    tokens.push({ text: token, kind })
    last = m.index + token.length
  }
  if (last < pretty.length) tokens.push({ text: pretty.slice(last), kind: 'plain' })
  return tokens
}

/* Split a run of text on a highlight query into alternating plain/match segments,
 * each match carrying its global ordinal and whether it is the scroll target.
 * Mutates `highlight.counter.current` exactly like the React HighlightedText did. */
export type HighlightSegment = { text: string; match: false } | { text: string; match: true; target: boolean }

export function splitHighlight(text: string, highlight?: TextHighlightSpec | null): HighlightSegment[] {
  const q = highlight?.query.trim() || ''
  if (!q || !highlight) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const segs: HighlightSegment[] = []
  let from = 0
  while (from <= text.length) {
    const i = lower.indexOf(needle, from)
    if (i < 0) break
    if (i > from) segs.push({ text: text.slice(from, i), match: false })
    const ordinal = highlight.counter.current++
    const isTarget = highlight.targetIndex === undefined || ordinal === highlight.targetIndex
    segs.push({ text: text.slice(i, i + q.length), match: true, target: isTarget })
    from = i + Math.max(1, q.length)
  }
  if (from < text.length) segs.push({ text: text.slice(from), match: false })
  return segs.length ? segs : [{ text, match: false }]
}

/* ── Inline markdown tokenizer ─────────────────────────────────────────────
 * The React renderer recursed through nested inline marks building ReactNodes.
 * In Svelte we tokenize into a flat node tree and let a recursive .svelte
 * component render it. Each node is one of the inline mark kinds. */
export type InlineNode =
  | { t: 'text'; text: string }
  | { t: 'autolinks'; text: string }
  | { t: 'code'; text: string }
  | { t: 'codelink'; text: string; href: string }
  | { t: 'strong'; children: InlineNode[] }
  | { t: 'em'; children: InlineNode[] }
  | { t: 'link'; info: LinkInfo; children: InlineNode[] }
  // A markdown link whose href is non-actionable: render the label as plain text.
  | { t: 'plainlabel'; children: InlineNode[] }

/* Parse one level of inline markdown into a node tree. `text`/`autolinks` leaves
 * still need auto-link + highlight processing at render time (the .svelte
 * components do that). Mirrors renderInline()'s regex + branch order exactly. */
export function parseInline(text: string, baseDir?: string, docPath?: string): InlineNode[] {
  const nodes: InlineNode[] = []
  const re = /`([^`]+)`|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\[([^\]\n]+)\]\(([^)\n]+)\)|\*([^*\s](?:[\s\S]*?[^*\s])?)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ t: 'autolinks', text: text.slice(last, m.index) })
    if (m[1] !== undefined) {
      const codePath = localPathInCode(m[1])
      if (codePath) nodes.push({ t: 'codelink', text: m[1], href: resolveLink(codePath, baseDir) })
      else nodes.push({ t: 'code', text: m[1] })
    } else if (m[2] !== undefined || m[3] !== undefined) {
      nodes.push({ t: 'strong', children: parseInline(m[2] ?? m[3], baseDir, docPath) })
    } else if (m[4] !== undefined && m[5] !== undefined) {
      const info = classifyHref(m[5], baseDir, docPath)
      const children = parseInline(m[4], baseDir, docPath)
      nodes.push(info ? { t: 'link', info, children } : { t: 'plainlabel', children })
    } else if (m[6] !== undefined) {
      nodes.push({ t: 'em', children: parseInline(m[6], baseDir, docPath) })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push({ t: 'autolinks', text: text.slice(last) })
  return nodes
}

/* Split a text run on auto-linkable local-file references. Mirrors
 * renderTextWithAutoLinks(): alternating plain text and recognized links. */
export type AutoLinkSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; info: LinkInfo }

export function splitAutoLinks(text: string): AutoLinkSegment[] {
  const segs: AutoLinkSegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  autoLocalFileRe.lastIndex = 0
  while ((m = autoLocalFileRe.exec(text)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', text: text.slice(last, m.index) })
    const raw = m[0]
    const trailing = raw.match(trailingLinkPunctuationRe)?.[0] || ''
    const href = raw.slice(0, raw.length - trailing.length)
    const info = classifyHref(href)
    if (info) segs.push({ kind: 'link', text: href, info })
    else segs.push({ kind: 'text', text: href })
    if (trailing) segs.push({ kind: 'text', text: trailing })
    last = m.index + raw.length
  }
  if (last < text.length) segs.push({ kind: 'text', text: text.slice(last) })
  return segs.length ? segs : [{ kind: 'text', text }]
}

/* The shared inline-code chip style string (was inlineCodeStyle CSSProperties). */
export const INLINE_CODE_STYLE =
  'display:inline-block;padding:0 0.28em;border-radius:5px;background:var(--arbol-color-surface);' +
  'border:1px solid var(--arbol-color-border);font:0.92em/1.35 var(--arbol-font-mono);color:var(--arbol-color-text)'

/* The shared search-mark style string (was searchMarkStyle CSSProperties). */
export const SEARCH_MARK_STYLE =
  'border-radius:4px;padding:0 2px;background:color-mix(in oklch, var(--arbol-color-warn) 48%, transparent);' +
  'color:var(--arbol-color-text);box-shadow:0 0 0 1px color-mix(in oklch, var(--arbol-color-warn) 34%, transparent)'

/* The shared fenced-code / pre block style string (was baseCodeStyle). */
export const BASE_CODE_STYLE =
  'margin:0.7em 0;padding:var(--arbol-space-4);overflow:auto;background:var(--arbol-color-surface);' +
  'border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);' +
  'font:400 0.86em/1.6 var(--arbol-font-mono);color:var(--arbol-color-text-muted);white-space:pre'
