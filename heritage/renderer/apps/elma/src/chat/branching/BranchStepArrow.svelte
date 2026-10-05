<script lang="ts">
  /* Single ‹ / › arrow inside the BranchSwitcher. Internal to the branching
   * cluster (not re-exported). */
  let { glyph, disabled, onClick, title }:
    {
      glyph: string
      disabled: boolean
      onClick: () => void
      title: string
    } = $props()

  let hover = $state(false)
</script>

<button
  onclick={disabled ? undefined : onClick}
  {disabled}
  {title}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  style="width:22px;height:22px;flex-shrink:0;display:grid;place-items:center;border-radius:6px;
         cursor:{disabled ? 'default' : 'pointer'};
         background:{hover && !disabled ? 'var(--arbol-color-accent-soft)' : 'transparent'};
         border:1px solid {hover && !disabled
           ? 'color-mix(in oklch, var(--arbol-color-accent) 35%, transparent)'
           : 'transparent'};
         color:{disabled ? 'var(--arbol-color-text-muted)' : 'var(--arbol-color-accent)'};
         opacity:{disabled ? 0.35 : 1};font:600 14px/1 var(--arbol-font-ui);
         transition:background .12s, border-color .12s"
>
  {glyph}
</button>
