<script lang="ts">
  /* Renders an AnswerBlock[] as block-level markdown (paragraphs, headings,
   * quotes, separators, lists, tables, code) plus the two pluggable block kinds (thinking and native tool) that ResponseView wires via snippets. (Ported from
   * MarkdownView's MarkdownBlocks.) */
  import type { Snippet } from 'svelte'
  import type { AnswerBlock } from './blocks'
  import InlineMarkdown from './InlineMarkdown.svelte'
  import CodeBlock from './CodeBlock.svelte'
  import MarkdownTable from './MarkdownTable.svelte'
  import QuoteBlock from './QuoteBlock.svelte'
  import ArbolSeparator from './ArbolSeparator.svelte'
  import { slug, type TextHighlightSpec } from './markdown'
  import { resolveSourceRef } from './sourcerefs'

  const SOURCE_CHIP_STYLE =
    'display:inline-flex;align-items:center;padding:2px 8px;border-radius:var(--arbol-radius-s);' +
    'font:500 var(--arbol-type-label)/1.4 var(--arbol-font-mono);border:1px solid var(--arbol-color-border);' +
    'background:var(--arbol-color-surface-2);word-break:break-all'

  type ThinkingBlock = Extract<AnswerBlock, { t: 'thinking' }>
  type NativeBlock = Extract<AnswerBlock, { t: 'native' }>

  let {
    blocks,
    compact = false,
    copyableBlocks = false,
    renderThinking,
    renderNative,
    highlight = null,
    onOpenLocalFile,
    baseDir,
    docPath,
  }: {
    blocks: AnswerBlock[]
    compact?: boolean
    /** Show copy actions on fenced Markdown and citation blocks. */
    copyableBlocks?: boolean
    renderThinking?: Snippet<[ThinkingBlock, number]>
    renderNative?: Snippet<[NativeBlock, number]>
    highlight?: TextHighlightSpec | null
    onOpenLocalFile?: (path: string) => void
    baseDir?: string
    docPath?: string
  } = $props()
</script>

{#each blocks as b, i (i)}
  {#if b.t === 'thinking'}
    {#if renderThinking}{@render renderThinking(b, i)}{/if}
  {:else if b.t === 'native'}
    {#if renderNative}{@render renderNative(b, i)}{/if}
  {:else if b.t === 'h'}
    <h3 id={slug(b.v)} style="margin:{compact ? '0.45em 0 0.25em' : '1.1em 0 0.4em'};font-size:{compact ? '1.04em' : '1.18em'};font-weight:700;line-height:1.35">
      <InlineMarkdown text={b.v} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
    </h3>
  {:else if b.t === 'quote'}
    <QuoteBlock text={b.v} {compact} copyable={copyableBlocks} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
  {:else if b.t === 'separator'}
    <ArbolSeparator {compact} />
  {:else if b.t === 'code'}
    <CodeBlock text={b.v} copyable={copyableBlocks} style={compact ? 'margin:0.35em 0;padding:var(--arbol-space-2)' : ''} {highlight} {onOpenLocalFile} {baseDir} />
  {:else if b.t === 'table'}
    <MarkdownTable header={b.header} rows={b.rows} {compact} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
  {:else if b.t === 'sources'}
    <!-- A Source-Refs comment revealed by the Sources toggle: quiet chip row,
         in place, clickable where the ref resolves to a local file. -->
    <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:{compact ? '0.35em 0' : '0.6em 0'}">
      <span style="font:600 var(--arbol-type-label)/1.4 var(--arbol-font-mono);letter-spacing:0.5px;text-transform:uppercase;color:var(--arbol-color-text-muted)">sources</span>
      {#each b.refs as ref, j (j)}
        {@const target = resolveSourceRef(ref, baseDir)}
        {#if target && onOpenLocalFile}
          <button
            type="button"
            onclick={() => onOpenLocalFile(target)}
            title={target}
            style="all:unset;box-sizing:border-box;cursor:pointer;{SOURCE_CHIP_STYLE};color:var(--arbol-color-link)"
          >{ref}</button>
        {:else}
          <span title={ref} style="{SOURCE_CHIP_STYLE};color:var(--arbol-color-text-muted)">{ref}</span>
        {/if}
      {/each}
    </div>
  {:else if b.t === 'ul'}
    <ul style="margin:{compact ? '0.25em 0' : '0.4em 0'};padding-left:1.6em;line-height:{compact ? 1.45 : 1.6}">
      {#each b.v as li, j (j)}
        <li style="margin-bottom:{compact ? '0.18em' : '0.35em'}"><InlineMarkdown text={li} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></li>
      {/each}
    </ul>
  {:else if b.t === 'ol'}
    <ol start={b.start} style="margin:{compact ? '0.25em 0' : '0.4em 0'};padding-left:1.6em;line-height:{compact ? 1.45 : 1.6}">
      {#each b.v as li, j (j)}
        <li style="margin-bottom:{compact ? '0.18em' : '0.35em'}"><InlineMarkdown text={li} {highlight} {onOpenLocalFile} {baseDir} {docPath} /></li>
      {/each}
    </ol>
  {:else}
    <p style="margin:{compact ? '0 0 0.35em' : '0 0 0.7em'};line-height:{compact ? 1.5 : 1.65}">
      <InlineMarkdown text={b.v} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
    </p>
  {/if}
{/each}
