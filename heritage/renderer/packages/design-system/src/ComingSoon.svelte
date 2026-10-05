<script lang="ts">
  // Placeholder Viewport for UIs whose content isn't built yet. (Ported from React.)
  import UIShell from './chrome/UIShell.svelte'
  let { title }: { title: string } = $props()
</script>

<UIShell {title}>
  {#snippet status()}<span>Coming soon</span>{/snippet}
  <div style="height:100%;display:flex;align-items:center;justify-content:center;
              color:var(--arbol-color-text-muted);flex-direction:column;gap:var(--arbol-space-2)">
    <div style="font-size:var(--arbol-type-title);color:var(--arbol-color-text)">{title}</div>
    <div>This UI isn’t built yet.</div>
  </div>
</UIShell>
