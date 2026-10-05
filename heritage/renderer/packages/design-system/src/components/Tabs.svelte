<script lang="ts">
  let { tabs, active, onSelect, vertical = false }:
    {
      tabs: { id: string; label: string }[]
      active: string
      onSelect: (id: string) => void
      vertical?: boolean
    } = $props()
</script>

<div style="display:flex;flex-direction:{vertical ? 'column' : 'row'};gap:var(--arbol-space-1);padding:var(--arbol-space-2)">
  {#each tabs as t}
    {@const on = t.id === active}
    <button
      onclick={() => onSelect(t.id)}
      style="display:flex;align-items:center;gap:var(--arbol-space-2);text-align:left;
             background:{on ? 'var(--arbol-color-surface-2)' : 'transparent'};
             color:{on ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'};
             border:1px solid {on ? 'var(--arbol-color-border)' : 'transparent'};
             border-radius:var(--arbol-radius-m);padding:9px var(--arbol-space-3);
             font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);cursor:pointer;
             transition:background .12s, color .12s"
    >
      <span style="flex:1">{t.label}</span>
      {#if on}<span style="width:4px;height:4px;border-radius:99px;background:var(--arbol-color-accent)"></span>{/if}
    </button>
  {/each}
</div>
