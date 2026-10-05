<script lang="ts" module>
  import type { BlueprintInput } from './blueprint'

  /* Domain types (repo/branch) get an accent badge; the poor scalar types stay
   * neutral. `enum [a, b]` is shown as an `enum` badge with the options split
   * off into the description column. */
  const DOMAIN_TYPES = new Set(['repo', 'branch'])

  function typeLabel(t?: string): { label: string; domain: boolean; options: string } {
    if (!t) return { label: '—', domain: false, options: '' }
    const m = /^enum\s*\[([^\]]*)\]/i.exec(t)
    if (m) return { label: 'enum', domain: false, options: m[1].trim() }
    return { label: t, domain: DOMAIN_TYPES.has(t), options: '' }
  }

  function required(i: BlueprintInput): boolean {
    return i.required === true
  }
</script>

<script lang="ts">
  import MarkdownBlocks from './MarkdownBlocks.svelte'
  import { parseBlueprint } from './blueprint'
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
    /** Reveal `<!-- sources: … -->` refs as chips (the doc views' toggle). */
    showSources?: boolean
  } = $props()

  const parsed = $derived(parseBlueprint(content))
  const bodyBlocks = $derived(parsed ? parseDocMarkdown(parsed.body, { showSources }) : [])
  // When a `## Process` list is present it renders as step cards; the body then
  // splits into the markdown before it (Goal) and after it (Quality bar, Output).
  const beforeBlocks = $derived(parsed ? parseDocMarkdown(parsed.bodyBefore, { showSources }) : [])
  const afterBlocks = $derived(parsed ? parseDocMarkdown(parsed.bodyAfter, { showSources }) : [])

  // recipe: a real name is a hard pin; `inherit` defers to default-recipe.
  const recipe = $derived.by(() => {
    const m = parsed?.meta
    if (!m) return null
    if (m.recipe && m.recipe !== 'inherit') return { pinned: true, name: m.recipe, fallback: '' }
    return { pinned: false, name: m.defaultRecipe || 'caller', fallback: m.defaultRecipe || '' }
  })

  function restrictionVariant(r: string): 'ok' | 'plain' {
    return r === 'read-only' ? 'ok' : 'plain'
  }
</script>

{#if !parsed}
  <!-- Not actually a blueprint (detection/parse disagreed) — fall back cleanly. -->
  <MarkdownBlocks blocks={parseDocMarkdown(content, { showSources })} {onOpenLocalFile} {baseDir} {docPath} {highlight} />
{:else}
  {@const meta = parsed.meta}
  <div class="bp">
    <section class="contract">
      <div class="contract-top">
        <span class="kind">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h10M4 17h7" /><circle cx="18.5" cy="15.5" r="3" /><path d="m20.7 17.7 1.8 1.8" /></svg>
          Blueprint
        </span>
        <div class="name">{meta.name || 'Untitled blueprint'}</div>
        {#if meta.summary}<p class="summary">{meta.summary}</p>{/if}
      </div>

      {#if recipe || meta.restrictions.length}
        <div class="meta-row">
          {#if recipe}
            <span class="ml">Recipe</span>
            <span class="pill mono" title={recipe.pinned ? 'Hard-pinned recipe' : 'inherit → default when no caller recipe'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
              {#if !recipe.pinned}<span class="k">inherit →</span>{/if}{recipe.name}
            </span>
          {/if}
          {#if meta.restrictions.length}
            <span class="ml">Restrictions</span>
            {#each meta.restrictions as r (r)}
              <span class="pill {restrictionVariant(r)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                {r}
              </span>
            {/each}
          {/if}
        </div>
      {/if}

      {#if meta.inputs.length}
        <div class="params">
          <h4>Inputs <span class="count">· {meta.inputs.length}</span></h4>
          <div class="io">
            {#each meta.inputs as inp (inp.name)}
              {@const ty = typeLabel(inp.type)}
              <div class="cell"><span class="pname">{inp.name}</span></div>
              <div class="cell"><span class="type {ty.domain ? 'domain' : ''}">{ty.label}</span></div>
              <div class="cell">
                <span class="req {required(inp) ? 'required' : 'optional'}"><span class="dot"></span>{required(inp) ? 'required' : 'optional'}</span>
              </div>
              <div class="cell desc">
                {#if inp.description}{inp.description}{/if}
                {#if ty.options}<span class="opts">one of: {ty.options}</span>{/if}
                {#if inp.default}<span class="default">default {inp.default}</span>{/if}
                {#if !inp.description && !ty.options && !inp.default}<span class="dim">—</span>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if meta.outputs.length}
        <div class="params">
          <h4>Outputs <span class="count">· {meta.outputs.length}</span></h4>
          <div class="out">
            {#each meta.outputs as o, oi (oi)}
              <div class="artifact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg>
                <code>{o.artifact}</code>
              </div>
              {#if o.must.length}
                <div class="musts">
                  {#each o.must as mst (mst)}
                    <span class="must"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5" /></svg>{mst}</span>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      {#if meta.doneWhen}
        <div class="donewhen">
          <div class="dw-lbl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>Done when</div>
          <p>{meta.doneWhen}</p>
        </div>
      {/if}
    </section>

    {#if parsed.process.length}
      {#if beforeBlocks.length}
        <div class="body">
          <MarkdownBlocks blocks={beforeBlocks} {onOpenLocalFile} {baseDir} {docPath} {highlight} />
        </div>
      {/if}
      <section class="steps-section">
        <h4 class="steps-h">Process <span class="count">· {parsed.process.length}</span></h4>
        <div class="steps">
          {#each parsed.process as s (s.n)}
            <div class="step">
              <span class="sn">{s.n}</span>
              <div class="sbody">
                {#if s.name}<div class="st">{s.name}</div>{/if}
                {#if s.text}
                  <div class="stext"><MarkdownBlocks blocks={parseDocMarkdown(s.text, { showSources })} compact {onOpenLocalFile} {baseDir} {docPath} /></div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
      {#if afterBlocks.length}
        <div class="body after">
          <MarkdownBlocks blocks={afterBlocks} {onOpenLocalFile} {baseDir} {docPath} {highlight} />
        </div>
      {/if}
    {:else}
      <div class="body">
        <MarkdownBlocks blocks={bodyBlocks} {onOpenLocalFile} {baseDir} {docPath} {highlight} />
      </div>
    {/if}

    {#if parsed.steps.length}
      <section class="steps-section">
        <h4 class="steps-h">Steps <span class="count">· {parsed.steps.length}</span></h4>
        <div class="steps">
          {#each parsed.steps as s (s.n)}
            <div class="step">
              <span class="sn">{s.n}</span>
              <div class="sbody">
                {#if s.name}<div class="st">{s.name}</div>{/if}
                {#if s.text}
                  <div class="stext"><MarkdownBlocks blocks={parseDocMarkdown(s.text, { showSources })} compact {onOpenLocalFile} {baseDir} {docPath} /></div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .bp {
    color: var(--arbol-color-text);
    font-size: var(--arbol-content-font-size);
  }

  .contract {
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-m);
    overflow: hidden;
    margin-bottom: var(--arbol-space-5);
    background: var(--arbol-color-surface);
  }
  .contract-top {
    padding: var(--arbol-space-5);
    border-bottom: 1px solid var(--arbol-color-hairline);
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
  }
  .summary {
    color: var(--arbol-color-text-muted);
    max-width: 66ch;
    line-height: 1.55;
    margin: 0;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--arbol-space-2);
    padding: var(--arbol-space-3) var(--arbol-space-5);
    border-bottom: 1px solid var(--arbol-color-hairline);
    align-items: center;
  }
  .ml {
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--arbol-color-text-muted);
  }
  .ml:not(:first-child) { margin-left: var(--arbol-space-2); }
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
  .pill .k { color: var(--arbol-color-text-muted); font-weight: 500; }
  .pill.mono { font-family: var(--arbol-font-mono); font-weight: 500; }
  .pill.ok {
    border-color: color-mix(in oklch, var(--arbol-color-ok) 45%, var(--arbol-color-border));
    color: var(--arbol-color-ok);
    background: color-mix(in oklch, var(--arbol-color-ok) 12%, var(--arbol-color-surface));
  }

  .params { padding: var(--arbol-space-4) var(--arbol-space-5) var(--arbol-space-5); }
  .params + .params { border-top: 1px solid var(--arbol-color-hairline); }
  h4, .steps-h {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--arbol-space-3);
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--arbol-color-text-muted);
  }
  .count { color: var(--arbol-color-accent); }

  .io { display: grid; grid-template-columns: auto auto auto 1fr; }
  .cell {
    padding: 9px 12px;
    border-top: 1px solid var(--arbol-color-hairline);
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  /* First row (four cells) has no top border. */
  .io .cell:nth-child(-n + 4) { border-top: none; }
  .pname { font: 600 var(--arbol-type-body)/1.3 var(--arbol-font-mono); color: var(--arbol-color-text); white-space: nowrap; }
  .type {
    font: 500 var(--arbol-type-label)/1 var(--arbol-font-mono);
    padding: 3px 7px;
    border-radius: var(--arbol-radius-s);
    background: var(--arbol-color-surface-2);
    border: 1px solid var(--arbol-color-border);
    color: var(--arbol-color-text-muted);
    white-space: nowrap;
  }
  .type.domain {
    color: var(--arbol-color-accent);
    border-color: color-mix(in oklch, var(--arbol-color-accent) 40%, var(--arbol-color-border));
    background: var(--arbol-color-accent-soft);
  }
  .req { font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .req .dot { width: 7px; height: 7px; border-radius: 99px; }
  .req.required { color: var(--arbol-color-accent); }
  .req.required .dot { background: var(--arbol-color-accent); }
  .req.optional { color: var(--arbol-color-text-muted); }
  .req.optional .dot { background: transparent; border: 1px solid var(--arbol-color-text-muted); }
  .desc { color: var(--arbol-color-text-muted); line-height: 1.5; flex-wrap: wrap; }
  .desc .dim { opacity: 0.6; }
  .desc .opts { color: var(--arbol-color-text); font-family: var(--arbol-font-mono); font-size: var(--arbol-type-label); }
  .desc .default {
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
    font-size: var(--arbol-type-label);
    background: var(--arbol-color-surface-2);
    padding: 1px 6px;
    border-radius: var(--arbol-radius-s);
    border: 1px solid var(--arbol-color-border);
  }

  .out { display: flex; flex-direction: column; gap: var(--arbol-space-3); }
  .artifact {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border-radius: var(--arbol-radius-s);
    background: var(--arbol-color-surface-2);
    border: 1px solid var(--arbol-color-border);
    min-width: 0;
  }
  .artifact svg { width: 15px; height: 15px; color: var(--arbol-color-text-muted); flex: none; }
  .artifact code { font: 500 var(--arbol-type-body)/1.4 var(--arbol-font-mono); color: var(--arbol-color-text); word-break: break-word; }
  .musts { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 2px; }
  .must {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 500 var(--arbol-type-label)/1 var(--arbol-font-mono);
    color: var(--arbol-color-ok);
    background: color-mix(in oklch, var(--arbol-color-ok) 11%, var(--arbol-color-surface));
    border: 1px solid color-mix(in oklch, var(--arbol-color-ok) 35%, var(--arbol-color-border));
    padding: 4px 8px;
    border-radius: 99px;
  }
  .must svg { width: 11px; height: 11px; }

  .donewhen {
    margin: 0 var(--arbol-space-5) var(--arbol-space-5);
    padding: var(--arbol-space-4);
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-accent-soft);
    border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 30%, var(--arbol-color-border));
    border-left: 3px solid var(--arbol-color-accent);
  }
  .dw-lbl {
    display: flex;
    align-items: center;
    gap: 7px;
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--arbol-color-accent);
    margin-bottom: 7px;
  }
  .dw-lbl svg { width: 13px; height: 13px; }
  .donewhen p { margin: 0; line-height: 1.6; color: var(--arbol-color-text); }

  /* The instruction body inherits MarkdownBlocks' own block styles; we only add
   * a divider rhythm for its section headings via a top margin on the wrapper. */
  .body :global(h3) {
    border-bottom: 1px solid var(--arbol-color-hairline);
    padding-bottom: 5px;
  }

  .body.after { margin-top: var(--arbol-space-5); }
  .steps-section { margin-top: var(--arbol-space-5); }
  .steps { display: flex; flex-direction: column; gap: 8px; }
  .step {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: start;
    padding: 11px 13px;
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-surface);
  }
  .sn {
    width: 24px;
    height: 24px;
    border-radius: 99px;
    display: grid;
    place-items: center;
    font: 700 var(--arbol-type-label)/1 var(--arbol-font-mono);
    background: var(--arbol-color-accent-soft);
    color: var(--arbol-color-accent);
  }
  .sbody { min-width: 0; }
  .st { font: 600 var(--arbol-type-body)/1.3 var(--arbol-font-ui); margin-bottom: 2px; }
  .stext { color: var(--arbol-color-text-muted); }
</style>
