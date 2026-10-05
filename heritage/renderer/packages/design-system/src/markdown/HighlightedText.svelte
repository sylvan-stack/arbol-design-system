<script lang="ts">
  /* Renders a text run, wrapping every occurrence of the active search query in a
   * <mark>. The targeted match carries data-elma-search-hit="target" so the
   * scroller can find and center it. (Ported from MarkdownView's HighlightedText.) */
  import { splitHighlight, SEARCH_MARK_STYLE, type TextHighlightSpec } from './markdown'

  let { text, highlight = null }: { text: string; highlight?: TextHighlightSpec | null } = $props()

  // Re-run on every change to text/highlight; splitHighlight mutates the shared
  // counter, so this evaluates once per render pass at the call site's order.
  const segments = $derived(splitHighlight(text, highlight))
</script>
{#each segments as seg, i (i)}{#if seg.match}<mark class="elma-search-hit" data-elma-search-hit={seg.target ? 'target' : undefined} style={SEARCH_MARK_STYLE}>{seg.text}</mark>{:else}{seg.text}{/if}{/each}
