<script lang="ts">
  /* Blockquotes are treated as highlighted thoughts: semantic blockquote markup,
   * an accent/green living edge, and a quiet oversized quote sign. */
  import InlineMarkdown from './InlineMarkdown.svelte'
  import CopyBlockButton from './CopyBlockButton.svelte'
  import type { TextHighlightSpec } from './markdown'

  let {
    text,
    compact = false,
    copyable = false,
    highlight = null,
    onOpenLocalFile,
    baseDir,
    docPath,
  }: {
    text: string
    compact?: boolean
    copyable?: boolean
    highlight?: TextHighlightSpec | null
    onOpenLocalFile?: (path: string) => void
    baseDir?: string
    docPath?: string
  } = $props()
</script>

<div class="quote-block" class:compact class:copyable>
  {#if copyable}<CopyBlockButton {text} label="Copy citation" />{/if}
  <blockquote>
    <span class="living-edge" aria-hidden="true"></span>
    <span class="quote-mark" aria-hidden="true">“</span>
    <div class="quote-copy">
      <InlineMarkdown {text} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
    </div>
  </blockquote>
</div>

<style>
  .quote-block {
    position: relative;
    margin: 0.75em 0 1em;
  }

  .quote-block.compact { margin: 0.45em 0 0.6em; }

  blockquote {
    position: relative;
    margin: 0;
    padding: 0.9em 1.1em 0.95em 1.35em;
    overflow: clip;
    border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 24%, var(--arbol-color-border));
    border-radius: var(--arbol-radius-m);
    color: var(--arbol-color-text);
    background:
      radial-gradient(circle at 5% 12%, color-mix(in oklch, var(--arbol-color-accent) 12%, transparent), transparent 38%),
      linear-gradient(120deg, color-mix(in oklch, var(--arbol-color-accent-soft) 66%, transparent), color-mix(in oklch, var(--arbol-color-surface) 76%, transparent));
    box-shadow: inset 0 1px 0 color-mix(in oklch, var(--arbol-color-text) 5%, transparent);
  }

  .compact blockquote { padding: 0.65em 0.85em 0.7em 1.1em; }
  .copyable .quote-copy { padding-right: 2.4em; }

  .living-edge {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: linear-gradient(to bottom, var(--arbol-color-accent), color-mix(in oklch, var(--arbol-color-accent) 48%, var(--arbol-color-ok)), var(--arbol-color-ok));
    box-shadow: 2px 0 12px color-mix(in oklch, var(--arbol-color-accent) 22%, transparent);
  }

  .quote-mark {
    position: absolute;
    top: -0.18em;
    right: 0.18em;
    font: 700 4.8em/1 var(--arbol-font-ui);
    color: color-mix(in oklch, var(--arbol-color-accent) 15%, transparent);
    pointer-events: none;
    user-select: none;
  }

  .compact .quote-mark { font-size: 3.8em; }
  .quote-copy { position: relative; padding-right: 1.5em; font-size: 1.01em; font-weight: 500; line-height: 1.62; }
  .compact .quote-copy { padding-right: 1em; line-height: 1.5; }
  .compact.copyable .quote-copy { padding-right: 2.4em; }
</style>
