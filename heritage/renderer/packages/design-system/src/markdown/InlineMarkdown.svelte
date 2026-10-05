<script lang="ts">
  /* A small, safe inline-markdown renderer (code, strong, emphasis, links). Raw
   * HTML is left as text, so user/agent messages can use markdown without opening
   * an HTML injection path. Recurses through itself for nested marks. The token
   * tree is built by parseInline()/splitAutoLinks() in markdown.ts; this component
   * only renders. (Ported from MarkdownView's renderInline/InlineMarkdown.) */
  import HighlightedText from './HighlightedText.svelte'
  import EntityChip from '../entities/EntityChip.svelte'
  import { splitEntityUris } from '../entities/entityUri'
  import InlineMarkdownSelf from './InlineMarkdown.svelte'
  import {
    parseInline,
    splitAutoLinks,
    INLINE_CODE_STYLE,
    type InlineNode,
    type TextHighlightSpec,
  } from './markdown'

  let {
    text,
    highlight = null,
    onOpenLocalFile,
    baseDir,
    docPath,
    nodes,
  }: {
    text?: string
    highlight?: TextHighlightSpec | null
    onOpenLocalFile?: (path: string) => void
    baseDir?: string
    docPath?: string
    // Internal: when recursing we pass an already-parsed child node list instead
    // of re-parsing raw text. Public callers pass `text`.
    nodes?: InlineNode[]
  } = $props()

  const renderNodes = $derived(nodes ?? parseInline(text || '', baseDir, docPath))

  function openLocalFile(path: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenLocalFile) onOpenLocalFile(path)
    else window.dispatchEvent(new CustomEvent('arbol-open-link', { detail: { kind: 'file', target: path, text: path } }))
  }
</script>

{#each renderNodes as node, i (i)}{#if node.t === 'text'}{#each splitEntityUris(node.text) as entitySeg, j (j)}{#if entitySeg.kind === 'entity'}<EntityChip uri={entitySeg.uri} />{:else}<HighlightedText text={entitySeg.text} {highlight} />{/if}{/each}{:else if node.t === 'autolinks'}{#each splitEntityUris(node.text) as entitySeg, j (j)}{#if entitySeg.kind === 'entity'}<EntityChip uri={entitySeg.uri} />{:else}{#each splitAutoLinks(entitySeg.text) as seg, k (k)}{#if seg.kind === 'link'}{#if seg.info.external}<a href={seg.info.href} title={seg.info.title} target="_blank" rel="noreferrer" class="arbol-link"><HighlightedText text={seg.text} {highlight} /></a>{:else}<a href={seg.info.href} title={seg.info.title} onclick={(e) => openLocalFile(seg.info.file as string, e)} class="arbol-link"><HighlightedText text={seg.text} {highlight} /></a>{/if}{:else}<HighlightedText text={seg.text} {highlight} />{/if}{/each}{/if}{/each}{:else if node.t === 'code'}<code style={INLINE_CODE_STYLE}><HighlightedText text={node.text} {highlight} /></code>{:else if node.t === 'codelink'}<a href={node.href} title={node.href} onclick={(e) => openLocalFile(node.href, e)} class="arbol-link" style="{INLINE_CODE_STYLE};color:var(--arbol-color-link)"><HighlightedText text={node.text} {highlight} /></a>{:else if node.t === 'strong'}<strong><InlineMarkdownSelf nodes={node.children} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></strong>{:else if node.t === 'em'}<em><InlineMarkdownSelf nodes={node.children} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></em>{:else if node.t === 'link'}{#if node.info.external}<a href={node.info.href} title={node.info.title} target="_blank" rel="noreferrer" class="arbol-link"><InlineMarkdownSelf nodes={node.children} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></a>{:else}<a href={node.info.href} title={node.info.title} onclick={(e) => openLocalFile(node.info.file as string, e)} class="arbol-link"><InlineMarkdownSelf nodes={node.children} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></a>{/if}{:else if node.t === 'plainlabel'}<InlineMarkdownSelf nodes={node.children} {highlight} {onOpenLocalFile} {baseDir} {docPath} />{/if}{/each}
