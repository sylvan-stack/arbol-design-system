<script lang="ts">
  /* Chip-bearing button that opens a checkbox popover (repo default/prohibited
   * fields). (Ported from React.) */
  let { options, selected, onChange, placeholder = 'Select…' }:
    {
      options: { value: string; label: string }[]
      selected: string[]
      onChange: (next: string[]) => void
      placeholder?: string
    } = $props()

  let open = $state(false)
  let root: HTMLDivElement | undefined = $state()

  const set = $derived(new Set(selected))
  function toggle(v: string) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange([...next])
  }
  const labelFor = (v: string) => (options.find((o) => o.value === v) || { label: v }).label || v

  $effect(() => {
    const h = (e: MouseEvent) => { if (root && !root.contains(e.target as Node)) open = false }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  })
</script>

<div style="position:relative" bind:this={root}>
  <button type="button" onclick={() => (open = !open)}
    style="width:100%;text-align:left;display:flex;align-items:center;gap:6px;min-height:34px;flex-wrap:wrap;
           background:var(--arbol-color-surface-2);color:{selected.length ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'};
           border:1px solid {open ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
           border-radius:var(--arbol-radius-m);padding:6px var(--arbol-space-3);
           font:400 var(--arbol-type-body)/1.2 var(--arbol-font-ui);cursor:pointer"
  >
    {#if selected.length === 0}<span style="flex:1">{placeholder}</span>{/if}
    {#each selected as v}
      <span style="display:inline-flex;align-items:center;gap:5px;background:var(--arbol-color-accent-soft);
                   color:var(--arbol-color-accent);border-radius:var(--arbol-radius-s);padding:2px 7px;
                   font:500 var(--arbol-type-label)/1.3 var(--arbol-font-mono);white-space:nowrap">
        {labelFor(v)}
        <span role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); toggle(v) }}
          style="cursor:pointer;opacity:0.7;font-size:12px">×</span>
      </span>
    {/each}
    <span style="margin-left:auto;padding-left:6px;color:var(--arbol-color-text-muted);font-size:10px">▼</span>
  </button>
  {#if open}
    <div style="position:absolute;top:calc(100% + 5px);left:0;right:0;z-index:30;max-height:220px;overflow:auto;
                background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
                border-radius:var(--arbol-radius-m);box-shadow:var(--arbol-shadow-pop);padding:4px">
      {#if options.length === 0}
        <div style="padding:var(--arbol-space-3);color:var(--arbol-color-text-muted)">No repos found</div>
      {/if}
      {#each options as o}
        {@const on = set.has(o.value)}
        <label style="display:flex;align-items:center;gap:var(--arbol-space-2);padding:7px var(--arbol-space-2);
                      cursor:pointer;border-radius:var(--arbol-radius-s);
                      background:{on ? 'var(--arbol-color-accent-soft)' : 'transparent'}">
          <span style="width:15px;height:15px;border-radius:4px;flex-shrink:0;
                       border:1px solid {on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
                       background:{on ? 'var(--arbol-color-accent)' : 'transparent'};
                       color:var(--arbol-color-accent-ink);display:grid;place-items:center;font-size:10px">{on ? '✓' : ''}</span>
          <input type="checkbox" checked={on} onchange={() => toggle(o.value)} style="display:none" />
          <span style="font:400 var(--arbol-type-body)/1.2 var(--arbol-font-mono)">{o.label}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
