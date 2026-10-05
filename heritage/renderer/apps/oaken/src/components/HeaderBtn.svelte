<script lang="ts">
  import type { Snippet } from 'svelte'
  // Small Header toggle button (▭− / ▭＋ / Fit). (Ported from React.)
  let { children, onclick, on = false, title }:
    { children: Snippet; onclick?: () => void; on?: boolean; title?: string } = $props()
</script>

<button
  {onclick}
  {title}
  style="background:{on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-surface-2)'};
         color:{on ? 'var(--arbol-color-accent-ink)' : 'var(--arbol-color-text)'};
         border:1px solid {on ? 'transparent' : 'var(--arbol-color-border)'};border-radius:6px;
         padding:3px 8px;cursor:pointer;
         font:600 calc(9.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono);white-space:nowrap"
>
  {@render children()}
</button>
