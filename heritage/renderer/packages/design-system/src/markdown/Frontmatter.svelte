<script lang="ts" module>
  import type { FrontmatterValue, FrontmatterData } from './frontmatter'

  /* `role` / `status` lead as badges; everything else becomes a labelled row.
   * A tiny palette maps the well-known corpus roles/states to a semantic tone
   * so a `heartwood` (historical) or `generated` doc reads at a glance; unknown
   * values fall back to a neutral badge. */
  type Tone = 'accent' | 'ok' | 'warn' | 'muted'

  const ROLE_TONE: Record<string, Tone> = {
    blueprint: 'accent',
    authored: 'muted',
    derived: 'accent',
    generated: 'muted',
    unclassified: 'muted',
  }
  const STATUS_TONE: Record<string, Tone> = {
    heartwood: 'warn',
    draft: 'warn',
    active: 'ok',
    shipped: 'ok',
    done: 'ok',
  }

  function roleTone(v: string): Tone { return ROLE_TONE[v.toLowerCase()] ?? 'muted' }
  function statusTone(v: string): Tone { return STATUS_TONE[v.toLowerCase()] ?? 'accent' }

  const isUrl = (s: string): boolean => /^https?:\/\//i.test(s.trim())
  const isBool = (s: string): boolean => s === 'true' || s === 'false'

  // A human label for a frontmatter key: `done_when` → "done when".
  function keyLabel(k: string): string {
    return k.replace(/[_-]+/g, ' ')
  }

  // Keys promoted to the badge row; the rest render in the definition grid.
  const BADGE_KEYS = new Set(['role', 'status'])

  function isScalar(v: FrontmatterValue): v is string {
    return typeof v === 'string'
  }
  function isList(v: FrontmatterValue): v is FrontmatterValue[] {
    return Array.isArray(v)
  }

  // A one-line rendering of a nested map (`{key: value}`) for the rare object
  // value in a generic document's frontmatter.
  function inlineMap(v: FrontmatterData): string {
    return Object.entries(v)
      .map(([k, val]) => `${keyLabel(k)}: ${isScalar(val) ? val : Array.isArray(val) ? val.join(', ') : '…'}`)
      .join(' · ')
  }
</script>

<script lang="ts">
  let {
    data,
  }: {
    data: FrontmatterData
  } = $props()

  const entries = $derived(Object.entries(data))
  const badges = $derived(entries.filter(([k, v]) => BADGE_KEYS.has(k) && typeof v === 'string') as [string, string][])
  const rows = $derived(entries.filter(([k]) => !BADGE_KEYS.has(k)))

  function toneOf(key: string, value: string): Tone {
    return key === 'role' ? roleTone(value) : statusTone(value)
  }
</script>

<section class="fm" aria-label="Document properties">
  {#if badges.length}
    <div class="badges">
      {#each badges as [k, v] (k)}
        <span class="badge {toneOf(k, v)}">
          {#if k === 'status'}<span class="dot"></span>{/if}{v}
        </span>
      {/each}
    </div>
  {/if}

  {#if rows.length}
    <dl class="grid">
      {#each rows as [k, v] (k)}
        <dt>{keyLabel(k)}</dt>
        <dd>
          {#if isList(v)}
            {#if v.length}
              <span class="pills">
                {#each v as item, i (i)}
                  <span class="pill">{isScalar(item) ? item : inlineMap(item as FrontmatterData)}</span>
                {/each}
              </span>
            {:else}
              <span class="dim">—</span>
            {/if}
          {:else if isScalar(v)}
            {#if isUrl(v)}
              <a class="link" href={v} target="_blank" rel="noreferrer">{v}</a>
            {:else if isBool(v)}
              <span class="pill {v === 'true' ? 'on' : ''}">{v}</span>
            {:else if v}
              {v}
            {:else}
              <span class="dim">—</span>
            {/if}
          {:else}
            <span class="mono">{inlineMap(v as FrontmatterData)}</span>
          {/if}
        </dd>
      {/each}
    </dl>
  {/if}
</section>

<style>
  /* A quiet metadata strip above the body — a hairline separates it from the
   * prose, and it never competes with the document's own headings. */
  .fm {
    margin: 0 0 var(--arbol-space-4);
    padding: 0 0 var(--arbol-space-3);
    border-bottom: 1px solid var(--arbol-color-hairline);
  }
  .badges { display: flex; flex-wrap: wrap; gap: var(--arbol-space-2); }
  .badges:not(:last-child) { margin-bottom: var(--arbol-space-3); }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border-radius: 99px;
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 0.6px;
    text-transform: uppercase;
    border: 1px solid var(--arbol-color-border);
    background: var(--arbol-color-surface-2);
    color: var(--arbol-color-text-muted);
  }
  .badge .dot { width: 6px; height: 6px; border-radius: 99px; background: currentColor; }
  .badge.accent {
    color: var(--arbol-color-accent);
    border-color: color-mix(in oklch, var(--arbol-color-accent) 40%, var(--arbol-color-border));
    background: var(--arbol-color-accent-soft);
  }
  .badge.ok {
    color: var(--arbol-color-ok);
    border-color: color-mix(in oklch, var(--arbol-color-ok) 40%, var(--arbol-color-border));
    background: color-mix(in oklch, var(--arbol-color-ok) 12%, var(--arbol-color-surface));
  }
  .badge.warn {
    color: var(--arbol-color-warn);
    border-color: color-mix(in oklch, var(--arbol-color-warn) 42%, var(--arbol-color-border));
    background: color-mix(in oklch, var(--arbol-color-warn) 12%, var(--arbol-color-surface));
  }

  .grid {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 5px var(--arbol-space-4);
    margin: 0;
    align-items: baseline;
  }
  dt {
    font: 600 var(--arbol-type-label)/1.4 var(--arbol-font-mono);
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--arbol-color-text-muted);
    white-space: nowrap;
  }
  dd {
    margin: 0;
    min-width: 0;
    color: var(--arbol-color-text);
    font: 400 var(--arbol-type-body)/1.5 var(--arbol-font-ui);
    word-break: break-word;
  }
  .dim { opacity: 0.55; }
  .mono { font-family: var(--arbol-font-mono); font-size: var(--arbol-type-label); }
  .link { color: var(--arbol-color-link); text-decoration: none; }
  .link:hover { text-decoration: underline; }

  .pills { display: inline-flex; flex-wrap: wrap; gap: 5px; }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--arbol-radius-s);
    font: 500 var(--arbol-type-label)/1.4 var(--arbol-font-mono);
    border: 1px solid var(--arbol-color-border);
    background: var(--arbol-color-surface-2);
    color: var(--arbol-color-text);
  }
  .pill.on {
    color: var(--arbol-color-ok);
    border-color: color-mix(in oklch, var(--arbol-color-ok) 35%, var(--arbol-color-border));
    background: color-mix(in oklch, var(--arbol-color-ok) 10%, var(--arbol-color-surface));
  }
</style>
