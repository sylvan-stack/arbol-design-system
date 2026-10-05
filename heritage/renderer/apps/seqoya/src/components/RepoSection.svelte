<script lang="ts">
  import type { Snippet } from 'svelte'

  let { title, count, open = $bindable(false), metadata, actions, children }: {
    title: string
    count: number
    open?: boolean
    metadata?: Snippet
    actions?: Snippet
    children: Snippet
  } = $props()
  const id = $props.id()
</script>

<section class="repo-section">
  <div class="section-header">
    <div class="section-heading">
      <button class="section-toggle" type="button" aria-expanded={open} aria-controls={id}
              onclick={() => { open = !open }}>
        <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span class="section-name">{title}</span>
        <span class="repo-count">{count} {count === 1 ? 'repo' : 'repos'}</span>
      </button>
      {#if metadata}<div class="section-meta">{@render metadata()}</div>{/if}
    </div>
    {#if actions}<div class="section-actions">{@render actions()}</div>{/if}
  </div>
  <div id={id} hidden={!open}>{@render children()}</div>
</section>

<style>
  .repo-section { min-width: 0; border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-s); overflow: hidden; }
  .section-header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--arbol-color-surface-2); }
  .section-heading { flex: 1; min-width: 0; }
  .repo-section .section-toggle { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 4px 0; border: 0; border-radius: 0; background: transparent; color: var(--arbol-color-text); font: 600 var(--arbol-type-body)/1.3 var(--arbol-font-ui); text-align: left; cursor: pointer; }
  .section-toggle:hover { color: var(--arbol-color-accent); }
  .section-toggle:focus-visible { outline: 2px solid var(--arbol-color-accent); outline-offset: 2px; }
  .chevron { width: 12px; flex-shrink: 0; }
  .section-name { overflow-wrap: anywhere; }
  .repo-count { color: var(--arbol-color-text-muted); font-size: var(--arbol-type-label); font-weight: 400; white-space: nowrap; }
  .section-meta { margin: 4px 0 0 20px; }
  .section-actions { flex-shrink: 0; }
  @media (max-width: 800px) {
    .section-header { flex-wrap: wrap; }
    .section-heading { flex-basis: 100%; }
    .section-actions { width: 100%; }
  }
</style>
