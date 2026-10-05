<script lang="ts" module>
  import type { ChainCellKind } from './chain'

  /* Each Cell kind reads at a glance: blueprint = the accent agent work, lambda
   * = an inline agent (link hue), tool = deterministic code (neutral). */
  const KIND_LABEL: Record<Exclude<ChainCellKind, ''>, string> = {
    tool: 'Tool',
    blueprint: 'Blueprint',
    lambda: 'lambda',
  }
  function kindLabel(k: ChainCellKind): string {
    return k ? KIND_LABEL[k] : 'step'
  }
</script>

<script lang="ts">
  import MarkdownBlocks from './MarkdownBlocks.svelte'
  import InlineMarkdown from './InlineMarkdown.svelte'
  import { parseChain } from './chain'
  import { parseDocMarkdown } from './sourcerefs'
  import type { TextHighlightSpec } from './markdown'

  let {
    content,
    baseDir,
    docPath,
    onOpenLocalFile,
    highlight = null,
    showSources = false,
  }: {
    content: string
    baseDir?: string
    docPath?: string
    onOpenLocalFile?: (path: string) => void
    highlight?: TextHighlightSpec | null
    showSources?: boolean
  } = $props()

  const parsed = $derived(parseChain(content))
  const beforeBlocks = $derived(parsed ? parseDocMarkdown(parsed.bodyBefore, { showSources }) : [])
  const afterBlocks = $derived(parsed ? parseDocMarkdown(parsed.bodyAfter, { showSources }) : [])
</script>

{#if !parsed}
  <!-- Not a chain runbook (no `chain:` frontmatter) — fall back to plain markdown. -->
  <MarkdownBlocks blocks={parseDocMarkdown(content, { showSources })} {onOpenLocalFile} {baseDir} {docPath} {highlight} />
{:else}
  {@const meta = parsed.meta}
  <div class="chain">
    <section class="contract">
      <div class="contract-top">
        <span class="kind">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6" /><rect x="2.5" y="8.5" width="7" height="7" rx="3.5" /><rect x="14.5" y="8.5" width="7" height="7" rx="3.5" /></svg>
          Blueprint Chain
        </span>
        <div class="name">{meta.name}</div>
        {#if meta.summary}<p class="summary">{meta.summary}</p>{/if}
        <div class="meta-row">
          <span class="pill mono" title="Cells in this chain">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="5" rx="1.5" /><rect x="4" y="14.5" width="16" height="5" rx="1.5" /></svg>
            {parsed.cells.length} {parsed.cells.length === 1 ? 'Cell' : 'Cells'}
          </span>
          {#if meta.defaultRecipe}
            <span class="pill mono" title="Default Brain Recipe (a blueprint's own pin still wins)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
              <span class="k">recipe</span>{meta.defaultRecipe}
            </span>
          {/if}
        </div>
      </div>
    </section>

    {#if beforeBlocks.length}
      <div class="body"><MarkdownBlocks blocks={beforeBlocks} {onOpenLocalFile} {baseDir} {docPath} {highlight} /></div>
    {/if}

    {#if parsed.cells.length}
      <section class="cells-section">
        <h4 class="cells-h">Cells <span class="count">· {parsed.cells.length}</span></h4>
        <ol class="cells">
          {#each parsed.cells as c (c.n)}
            <li class="cell">
              <div class="rail"><span class="cn">{c.n}</span></div>
              <div class="card">
                <div class="chead">
                  <span class="cname"><InlineMarkdown text={c.name} {onOpenLocalFile} {baseDir} {docPath} /></span>
                  <span class="kind-tag k-{c.kind || 'step'}">{kindLabel(c.kind)}</span>
                </div>
                {#if c.input || c.output}
                  <div class="io">
                    <div class="io-col">
                      <span class="io-lbl in">in</span>
                      <div class="io-val">{#if c.input}<InlineMarkdown text={c.input} {onOpenLocalFile} {baseDir} {docPath} />{:else}<span class="dim">—</span>{/if}</div>
                    </div>
                    <span class="io-arrow" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
                    </span>
                    <div class="io-col">
                      <span class="io-lbl out">out</span>
                      <div class="io-val">{#if c.output}<InlineMarkdown text={c.output} {onOpenLocalFile} {baseDir} {docPath} />{:else}<span class="dim">—</span>{/if}</div>
                    </div>
                  </div>
                {/if}
                {#if c.gate || c.note}
                  <div class="cfoot">
                    {#if c.gate}
                      <span class="gate" title="Code-enforced completion check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                        <span class="glbl">gate</span><InlineMarkdown text={c.gate} {onOpenLocalFile} {baseDir} {docPath} />
                      </span>
                    {/if}
                    {#if c.note}<span class="note"><InlineMarkdown text={c.note} {onOpenLocalFile} {baseDir} {docPath} /></span>{/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if afterBlocks.length}
      <div class="body after"><MarkdownBlocks blocks={afterBlocks} {onOpenLocalFile} {baseDir} {docPath} {highlight} /></div>
    {/if}
  </div>
{/if}

<style>
  .chain {
    color: var(--arbol-color-text);
    font-size: var(--arbol-content-font-size);
  }

  /* -------- contract header (mirrors BlueprintDoc for family consistency) -------- */
  .contract {
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-m);
    overflow: hidden;
    margin-bottom: var(--arbol-space-5);
    background: var(--arbol-color-surface);
  }
  .contract-top {
    padding: var(--arbol-space-5);
    background: linear-gradient(180deg, color-mix(in oklch, var(--arbol-color-accent) 8%, var(--arbol-color-surface)), var(--arbol-color-surface));
  }
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--arbol-color-accent);
    background: var(--arbol-color-accent-soft);
    padding: 5px 9px;
    border-radius: 99px;
    margin-bottom: var(--arbol-space-3);
  }
  .kind svg { width: 13px; height: 13px; }
  .name {
    font: 700 var(--arbol-type-display)/1.15 var(--arbol-font-ui);
    margin: 0 0 6px;
    letter-spacing: -0.01em;
    font-family: var(--arbol-font-mono);
  }
  .summary { color: var(--arbol-color-text-muted); max-width: 66ch; line-height: 1.55; margin: 0; }

  .meta-row { display: flex; flex-wrap: wrap; gap: var(--arbol-space-2); align-items: center; margin-top: var(--arbol-space-4); }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 99px;
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui);
    border: 1px solid var(--arbol-color-border);
    background: var(--arbol-color-surface-2);
    color: var(--arbol-color-text);
    white-space: nowrap;
  }
  .pill svg { width: 12px; height: 12px; opacity: 0.85; }
  .pill.mono { font-family: var(--arbol-font-mono); font-weight: 500; }
  .pill .k { color: var(--arbol-color-text-muted); font-weight: 500; }

  .body { }
  .body.after { margin-top: var(--arbol-space-5); }
  .body :global(h3) { border-bottom: 1px solid var(--arbol-color-hairline); padding-bottom: 5px; }

  /* -------- the Cells flow (the centerpiece) -------- */
  .cells-section { margin-top: var(--arbol-space-5); }
  .cells-h {
    display: flex; align-items: center; gap: 8px; margin: 0 0 var(--arbol-space-3);
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.8px; text-transform: uppercase; color: var(--arbol-color-text-muted);
  }
  .count { color: var(--arbol-color-accent); }

  .cells { list-style: none; margin: 0; padding: 0; }
  .cell { display: grid; grid-template-columns: 30px 1fr; gap: var(--arbol-space-3); }
  /* Left rail: the number badge + a connector line down to the next Cell (the
   * chain/notebook sequence made visible). */
  .rail { position: relative; display: flex; justify-content: center; }
  .cn {
    width: 26px; height: 26px; border-radius: 99px; z-index: 1;
    display: grid; place-items: center;
    font: 700 var(--arbol-type-label)/1 var(--arbol-font-mono);
    background: var(--arbol-color-accent-soft); color: var(--arbol-color-accent);
    border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 30%, var(--arbol-color-border));
  }
  .cell:not(:last-child) .rail::after {
    content: ''; position: absolute; top: 26px; bottom: -12px; left: 50%;
    width: 2px; transform: translateX(-50%);
    background: color-mix(in oklch, var(--arbol-color-accent) 22%, var(--arbol-color-border));
  }
  .cell + .cell { margin-top: 12px; }

  .card {
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-surface);
    padding: 11px 13px;
    min-width: 0;
  }
  .chead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cname { font: 600 var(--arbol-type-body)/1.3 var(--arbol-font-ui); }
  .cname :global(code) { font-family: var(--arbol-font-mono); }
  .kind-tag {
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.4px; text-transform: uppercase;
    padding: 3px 8px; border-radius: 99px; white-space: nowrap;
    border: 1px solid var(--arbol-color-border); color: var(--arbol-color-text-muted);
    background: var(--arbol-color-surface-2);
  }
  .kind-tag.k-blueprint {
    color: var(--arbol-color-accent);
    border-color: color-mix(in oklch, var(--arbol-color-accent) 40%, var(--arbol-color-border));
    background: var(--arbol-color-accent-soft);
  }
  .kind-tag.k-lambda {
    color: var(--arbol-color-link);
    border-color: color-mix(in oklch, var(--arbol-color-link) 40%, var(--arbol-color-border));
    background: color-mix(in oklch, var(--arbol-color-link) 12%, var(--arbol-color-surface));
  }

  /* in → out: the load-bearing separation the whole view is for. */
  .io {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
    gap: 8px;
    margin-top: 10px;
  }
  .io-col {
    display: flex; flex-direction: column; gap: 4px; min-width: 0;
    background: var(--arbol-color-surface-2);
    border: 1px solid var(--arbol-color-hairline);
    border-radius: var(--arbol-radius-s);
    padding: 7px 9px;
  }
  .io-lbl {
    font: 700 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 1px; text-transform: uppercase;
  }
  .io-lbl.in { color: var(--arbol-color-text-muted); }
  .io-lbl.out { color: var(--arbol-color-accent); }
  .io-val { font-size: var(--arbol-type-body); line-height: 1.45; word-break: break-word; }
  .io-val :global(code) { font-family: var(--arbol-font-mono); font-size: var(--arbol-type-label); }
  .io-val .dim { opacity: 0.5; }
  .io-arrow { display: grid; place-items: center; color: var(--arbol-color-text-muted); }
  .io-arrow svg { width: 18px; height: 18px; }

  .cfoot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 9px; }
  .gate {
    display: inline-flex; align-items: center; gap: 5px;
    font: 500 var(--arbol-type-label)/1.3 var(--arbol-font-mono);
    color: var(--arbol-color-ok);
    background: color-mix(in oklch, var(--arbol-color-ok) 11%, var(--arbol-color-surface));
    border: 1px solid color-mix(in oklch, var(--arbol-color-ok) 32%, var(--arbol-color-border));
    padding: 3px 8px; border-radius: 99px;
  }
  .gate svg { width: 11px; height: 11px; flex: none; }
  .gate .glbl { text-transform: uppercase; letter-spacing: 0.6px; opacity: 0.8; }
  .gate :global(code) { font-family: var(--arbol-font-mono); }
  .note { font-size: var(--arbol-type-label); color: var(--arbol-color-text-muted); line-height: 1.4; }
  .note :global(code) { font-family: var(--arbol-font-mono); }

  @media (max-width: 560px) {
    .io { grid-template-columns: 1fr; }
    .io-arrow { transform: rotate(90deg); justify-self: center; }
  }
</style>
