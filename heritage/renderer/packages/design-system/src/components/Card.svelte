<script lang="ts">
  import type { Snippet } from 'svelte'
  let { children, onclick, interactive = false, style = '' }:
    {
      children: Snippet
      onclick?: (e: MouseEvent) => void
      interactive?: boolean
      style?: string
    } = $props()

  let hover = $state(false)
  const clickable = $derived(!!onclick || interactive)
</script>

<div
  {onclick}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  style="background:var(--arbol-color-surface);border:1px solid {hover && clickable ? 'var(--arbol-color-text-muted)' : 'var(--arbol-color-border)'};
         border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);
         cursor:{clickable ? 'pointer' : 'default'};
         box-shadow:{hover && clickable ? 'var(--arbol-shadow-2)' : 'var(--arbol-shadow-1)'};
         transition:box-shadow .15s ease, border-color .15s ease, transform .15s ease;
         transform:{hover && clickable ? 'translateY(-1px)' : 'none'};{style}"
>
  {@render children()}
</div>
