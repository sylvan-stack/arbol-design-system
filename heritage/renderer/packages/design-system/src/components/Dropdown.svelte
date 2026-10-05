<script lang="ts">
  // Custom dropdown — a popover list (replaces native <select> so the menu
  // matches the warm surfaces + accent across themes). (Ported from React.)
  let { value, options, onChange }:
    {
      value: string
      options: { value: string; label: string }[]
      onChange: (v: string) => void
    } = $props()

  let open = $state(false)
  let root: HTMLDivElement | undefined = $state()
  const cur = $derived(options.find((o) => o.value === value) || options[0] || { label: '', value: '' })

  $effect(() => {
    const h = (e: MouseEvent) => { if (root && !root.contains(e.target as Node)) open = false }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  })
</script>

<div style="position:relative" bind:this={root}>
  <button
    type="button"
    onclick={() => (open = !open)}
    style="width:100%;text-align:left;display:flex;align-items:center;gap:8px;
           background:var(--arbol-color-surface-2);color:var(--arbol-color-text);
           border:1px solid {open ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
           border-radius:var(--arbol-radius-m);padding:var(--arbol-space-2) var(--arbol-space-3);
           font:400 var(--arbol-type-body)/1.2 var(--arbol-font-ui);cursor:pointer"
  >
    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{cur.label}</span>
    <span style="color:var(--arbol-color-text-muted);font-size:10px;
                 transform:{open ? 'rotate(180deg)' : 'none'};transition:transform .12s">▼</span>
  </button>
  {#if open}
    <div style="position:absolute;top:calc(100% + 5px);left:0;right:0;z-index:50;max-height:240px;
                overflow:auto;background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
                border-radius:var(--arbol-radius-m);box-shadow:var(--arbol-shadow-pop);padding:4px">
      {#each options as o}
        {@const on = o.value === value}
        <button
          type="button"
          onclick={() => { onChange(o.value); open = false }}
          style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;
                 background:{on ? 'var(--arbol-color-accent-soft)' : 'transparent'};border:0;
                 border-radius:var(--arbol-radius-s);padding:7px var(--arbol-space-2);cursor:pointer;
                 color:{on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text)'};
                 font:500 var(--arbol-type-body)/1.2 var(--arbol-font-ui)"
        >
          <span style="flex:1">{o.label}</span>
          {#if on}<span style="font-size:12px">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
