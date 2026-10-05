<script lang="ts">
  // Theme pill + popover ladder (dark → light). (Ported from React.)
  import { THEMES } from '../themes'

  let { theme, onTheme }: { theme: string; onTheme: (id: string) => void } = $props()

  let open = $state(false)
  let root: HTMLDivElement | undefined = $state()

  const cur = $derived(THEMES.find((t) => t.id === theme) || THEMES[0])

  $effect(() => {
    const h = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) open = false
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  })
</script>

<div style="position:relative" bind:this={root}>
  <button
    type="button"
    onclick={() => (open = !open)}
    title="Switch color schema"
    style="display:flex;align-items:center;gap:7px;cursor:pointer;
           background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);
           border-radius:99px;padding:4px 9px 4px 5px;color:var(--arbol-color-text-muted);
           font:500 var(--arbol-type-label)/1 var(--arbol-font-ui)"
  >
    <span style="width:14px;height:14px;border-radius:99px;background:{cur.bg};
                 border:1px solid rgba(128,128,128,0.4);display:grid;place-items:center;flex-shrink:0">
      <span style="width:7px;height:7px;border-radius:99px;background:{cur.accent}"></span>
    </span>
    {cur.name}
    <span style="font-size:9px;opacity:0.7">▼</span>
  </button>

  {#if open}
    <div
      style="position:absolute;top:calc(100% + 8px);right:0;z-index:40;min-width:210px;
             max-height:420px;overflow:auto;background:var(--arbol-color-surface);
             border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
             box-shadow:var(--arbol-shadow-pop);padding:5px"
    >
      <div style="display:flex;align-items:center;gap:6px;font-size:var(--arbol-type-label);
                  color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.7px;
                  font-weight:600;padding:5px 8px 8px;white-space:nowrap">
        Color schema
        <span style="flex:1"></span>
        <span style="font:500 9px/1 var(--arbol-font-mono);letter-spacing:0.3px;white-space:nowrap">dark → light</span>
      </div>
      <div style="display:flex;height:5px;border-radius:99px;overflow:hidden;margin:0 6px 7px">
        {#each THEMES as t}
          <span style="flex:1;background:{t.bg}"></span>
        {/each}
      </div>
      {#each THEMES as t, i}
        {@const on = t.id === theme}
        <button
          type="button"
          onclick={() => { onTheme(t.id); open = false }}
          style="display:flex;align-items:center;gap:9px;width:100%;text-align:left;
                 background:{on ? 'var(--arbol-color-surface-2)' : 'transparent'};
                 border:1px solid {on ? 'var(--arbol-color-border)' : 'transparent'};
                 border-radius:var(--arbol-radius-s);padding:6px 8px;cursor:pointer;
                 color:var(--arbol-color-text);font:500 var(--arbol-type-body)/1 var(--arbol-font-ui)"
        >
          <span style="width:16px;text-align:right;color:var(--arbol-color-text-muted);
                       font:500 var(--arbol-type-label)/1 var(--arbol-font-mono)">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style="width:16px;height:16px;border-radius:99px;background:{t.bg};
                       border:1px solid rgba(128,128,128,0.4);display:grid;place-items:center;flex-shrink:0">
            <span style="width:8px;height:8px;border-radius:99px;background:{t.accent}"></span>
          </span>
          <span style="flex:1">{t.name}</span>
          {#if on}<span style="color:var(--arbol-color-accent);font-size:12px">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
