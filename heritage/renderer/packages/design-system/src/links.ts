import { callNative } from './bridge/arbol'

export type ArbolUI = 'elma' | 'seqoya' | 'willo' | 'oaken' | 'artifact'
export type DetectedLink = { kind: 'http' | 'file'; text: string; target: string }

// Deliberately conservative for paths: prose is linkified only when it has an
// unmistakable file prefix. Markdown links can still use bare relative paths.
const LINK_RE = /https?:\/\/[^\s<>{}\[\]"']+|file:\/\/[^\s<>{}\[\]"']+|(?<![\w~.])(?:\/Users(?![A-Za-z0-9])|~\/|\.\.?\/)[^\s<>{}\[\]"']+/gi
const TRAILING = /[),.;:!?]+$/

export function detectLinks(text: string): Array<{ text: string; link?: DetectedLink }> {
  const parts: Array<{ text: string; link?: DetectedLink }> = []
  let last = 0
  LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK_RE.exec(text))) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    const raw = match[0]
    const punctuation = raw.match(TRAILING)?.[0] || ''
    const target = raw.slice(0, raw.length - punctuation.length)
    if (target) {
      parts.push({
        text: target,
        link: { kind: /^https?:\/\//i.test(target) ? 'http' : 'file', text: target, target },
      })
    }
    if (punctuation) parts.push({ text: punctuation })
    last = match.index + raw.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}

function explicitTarget(element: Element): DetectedLink | null {
  const marked = element.closest<HTMLElement>('[data-arbol-link-kind]')
  if (marked) {
    const kind = marked.dataset.arbolLinkKind
    const target = marked.dataset.arbolLinkTarget || ''
    if ((kind === 'http' || kind === 'file') && target) return { kind, target, text: marked.textContent || target }
  }
  const anchor = element.closest<HTMLAnchorElement>('a[href]')
  if (!anchor) return null
  const href = anchor.getAttribute('href') || ''
  if (/^https?:\/\//i.test(href)) return { kind: 'http', target: href, text: anchor.textContent || href }
  if (/^(?:file:\/\/|\/Users(?![A-Za-z0-9])|~\/|\.\.?\/)/i.test(href)) {
    return { kind: 'file', target: href, text: anchor.textContent || href }
  }
  return null
}

function eligible(node: Text): boolean {
  const parent = node.parentElement
  if (!parent || !node.data || !LINK_RE.test(node.data)) { LINK_RE.lastIndex = 0; return false }
  LINK_RE.lastIndex = 0
  return !parent.closest('a,textarea,input,select,option,script,style,[contenteditable="true"],[data-arbol-no-linkify],[data-arbol-link-kind]')
}

function linkifyTextNode(node: Text) {
  if (!eligible(node)) return
  const parts = detectLinks(node.data)
  if (!parts.some((part) => part.link)) return
  const fragment = document.createDocumentFragment()
  for (const part of parts) {
    if (!part.link) { fragment.append(document.createTextNode(part.text)); continue }
    const link = document.createElement('span')
    link.className = 'arbol-link arbol-auto-link'
    link.dataset.arbolLinkKind = part.link.kind
    link.dataset.arbolLinkTarget = part.link.target
    link.setAttribute('role', 'link')
    link.setAttribute('tabindex', '0')
    link.title = part.link.target
    link.textContent = part.text
    fragment.append(link)
  }
  node.replaceWith(fragment)
}

function linkify(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { linkifyTextNode(root as Text); return }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment) && root !== document) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  nodes.forEach(linkifyTextNode)
}

async function openLink(link: DetectedLink, ui: ArbolUI) {
  if (link.kind === 'file' && ui === 'elma') {
    window.dispatchEvent(new CustomEvent('arbol-open-file', { detail: { path: link.target } }))
    return
  }
  try {
    await callNative('link.open', { kind: link.kind, target: link.target, source_ui: ui })
  } catch {
    // Browser previews have no native bridge. HTTP still gets a useful fallback;
    // local files intentionally do not escape the browser sandbox.
    if (link.kind === 'http') window.open(link.target, '_blank', 'noopener,noreferrer')
  }
}

let installed = false

/** Install one delegated link surface for an Arbol renderer. It covers ordinary
 * markdown anchors and linkifies URLs/absolute file paths in logs, JSON, code,
 * errors, tables, and any future UI without each component opting in. */
export function installGlobalLinks(ui: ArbolUI) {
  if (installed || typeof document === 'undefined') return
  installed = true
  const style = document.createElement('style')
  style.textContent = '.arbol-auto-link{color:var(--arbol-color-link);text-decoration:underline;text-underline-offset:2px;cursor:pointer}.arbol-auto-link:focus-visible{outline:2px solid var(--arbol-color-accent);outline-offset:2px;border-radius:2px}'
  document.head.append(style)

  linkify(document.body)
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) linkify(node)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const activate = (event: MouseEvent | KeyboardEvent) => {
    if (event instanceof MouseEvent && event.button !== 0) return
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof Element)) return
    const link = explicitTarget(target)
    if (!link) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void openLink(link, ui)
  }
  const openRequested = (event: Event) => {
    const link = (event as CustomEvent<DetectedLink>).detail
    if (link && (link.kind === 'http' || link.kind === 'file')) void openLink(link, ui)
  }
  window.addEventListener('click', activate, true)
  window.addEventListener('keydown', activate, true)
  window.addEventListener('arbol-open-link', openRequested)
}
