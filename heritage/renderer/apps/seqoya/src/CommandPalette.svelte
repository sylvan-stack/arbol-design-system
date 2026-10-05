<script lang="ts">
  /* ⌘K command palette (§1.9, hotkey-first): fuzzy-filter a flat action list and
   * run the selected. (Ported from React.) */
  import type { PaletteAction } from './types'

  let { open, onClose, actions }:
    { open: boolean; onClose: () => void; actions: PaletteAction[] } = $props()

  let q = $state('')
  let sel = $state(0)

  $effect(() => { if (open) { q = ''; sel = 0 } })

  const matches = $derived(actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase())))
  function run(a: PaletteAction) { a.run(); onClose() }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, matches.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0) }
    else if (e.key === 'Enter' && matches[sel]) run(matches[sel])
    else if (e.key === 'Escape') onClose()
  }
</script>

{#if open}
  <div
    role="presentation"
    onmousedown={(e) => { if (e.target === e.currentTarget) onClose() }}
    style="position:fixed;inset:0;background:color-mix(in oklch, var(--arbol-color-bg) 50%, transparent);
           backdrop-filter:blur(2px);display:grid;place-items:start center;padding-top:96px;z-index:2000;
           animation:arbolfade .12s ease"
  >
    <div style="width:min(560px, 92%);background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
                border-radius:var(--arbol-radius-l);box-shadow:var(--arbol-shadow-pop);overflow:hidden;animation:arbolpop .14s ease">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        autofocus
        bind:value={q}
        placeholder="Type a command…"
        oninput={() => (sel = 0)}
        onkeydown={onKey}
        style="width:100%;background:transparent;border:0;outline:none;color:var(--arbol-color-text);
               font:400 var(--arbol-type-title)/1 var(--arbol-font-ui);
               padding:var(--arbol-space-4) var(--arbol-space-5);border-bottom:1px solid var(--arbol-color-border);box-sizing:border-box"
      />
      <div style="max-height:320px;overflow:auto;padding:6px">
        {#if matches.length === 0}
          <div style="padding:16px;color:var(--arbol-color-text-muted)">No commands.</div>
        {/if}
        {#each matches as a, i (a.label)}
          <button
            onmouseenter={() => (sel = i)}
            onclick={() => run(a)}
            style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;
                   background:{i === sel ? 'var(--arbol-color-surface-2)' : 'transparent'};border:0;cursor:pointer;
                   border-radius:var(--arbol-radius-s);padding:10px 12px;color:var(--arbol-color-text);
                   font:500 var(--arbol-type-body)/1 var(--arbol-font-ui)"
          >
            <span style="color:var(--arbol-color-text-muted);width:16px;display:flex">›</span>
            <span style="flex:1">{a.label}</span>
            {#if a.hint}
              <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);font-family:var(--arbol-font-mono)">{a.hint}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
