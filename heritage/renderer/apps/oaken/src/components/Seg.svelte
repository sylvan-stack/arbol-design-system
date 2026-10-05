<script lang="ts">
  // Segmented toggle (Feed / Split). (Ported from React; generic <T> → string.)
  let { options, value, onChange }:
    {
      options: { value: string; label: string; title?: string }[]
      value: string
      onChange: (v: string) => void
    } = $props()
</script>

<div style="display:flex;gap:3px;background:var(--arbol-color-surface-2);
            border:1px solid var(--arbol-color-border);border-radius:7px;padding:2px">
  {#each options as o}
    {@const on = o.value === value}
    <button
      onclick={() => onChange(o.value)}
      title={o.title}
      style="background:{on ? 'var(--arbol-color-accent)' : 'transparent'};
             color:{on ? 'var(--arbol-color-accent-ink)' : 'var(--arbol-color-text-muted)'};
             border:0;border-radius:5px;padding:4px 9px;cursor:pointer;
             font:600 calc(10px * var(--arbol-font-scale))/1 var(--arbol-font-ui);white-space:nowrap"
    >
      {o.label}
    </button>
  {/each}
</div>
