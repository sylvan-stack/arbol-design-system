<script lang="ts">
  /* The agent's reasoning for this turn, in a collapsible block above the answer.
   * Expanded by default so generated reasoning is visible; stays manually
   * toggleable and does not hide the content when the turn settles. Keyed by
   * turn at the call site. (Ported from ResponseView's ThinkingBlock.) */
  import { Dot } from '@arbol/design-system'
  import { MarkdownBlocks, parseMarkdown } from '@arbol/design-system'
  import type { TextHighlightSpec } from '@arbol/design-system'
  import { formatThinkingMarkdown } from './responseView'

  let { text, responding, index, total, highlight = null }:
    { text: string; responding: boolean; index?: number; total?: number; highlight?: TextHighlightSpec | null } = $props()

  // Reasoning must not disappear behind a title when a response settles. A user
  // may still collapse it explicitly; a newly mounted block starts expanded.
  let open = $state(true)

  const heading = $derived(total && total > 1 ? `Thinking ${index}/${total}` : 'Thinking')
  const blocks = $derived(parseMarkdown(formatThinkingMarkdown(text)))
</script>

{#if text}
  <div style="margin:0 0 0.9em;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);overflow:hidden">
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={open}
      title={open ? 'Collapse reasoning' : 'Expand reasoning'}
      style="all:unset;box-sizing:border-box;display:flex;align-items:center;gap:var(--arbol-space-2);width:100%;padding:var(--arbol-space-2) var(--arbol-space-3);cursor:pointer;font:400 0.84em/1.5 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
    >
      <span aria-hidden="true" style="display:inline-block;transform:{open ? 'rotate(90deg)' : 'none'};transition:transform 120ms ease;opacity:0.6;flex-shrink:0">▸</span>
      <span style="font-weight:600;flex-shrink:0">{heading}</span>
      {#if responding}<Dot color="var(--arbol-color-accent)" pulse />{/if}
    </button>
    {#if open}
      <div class="thinking-content">
        <MarkdownBlocks {blocks} compact {highlight} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .thinking-content {
    margin: 0;
    padding: var(--arbol-space-3) var(--arbol-space-4);
    border-top: 1px solid var(--arbol-color-border);
    background: var(--arbol-color-surface-2);
    color: var(--arbol-color-text-muted);
    font-size: 0.86em;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  /* Provider status thoughts commonly arrive as consecutive bold phrases. Once
     formatThinkingMarkdown separates them, present them as a quiet activity list
     instead of a wall of asterisks and monospaced prose. */
  .thinking-content :global(p:has(> strong:only-child)) {
    position: relative;
    padding-left: 1.15em;
  }

  .thinking-content :global(p:has(> strong:only-child)::before) {
    content: '·';
    position: absolute;
    left: 0.15em;
    color: var(--arbol-color-accent);
    font-weight: 800;
  }

  .thinking-content :global(strong) {
    color: color-mix(in srgb, var(--arbol-color-text) 82%, var(--arbol-color-text-muted));
    font-weight: 600;
  }

  .thinking-content :global(pre) {
    max-width: 100%;
  }
</style>
