<script lang="ts">
  // A single keycap (hotkey-first model). Mono font, per ux-ui-guide §1.9.
  let { k }: { k: string } = $props()
</script>

<kbd
  style="font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted);
         background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);
         border-radius:5px;padding:3px 6px"
>{k}</kbd>
