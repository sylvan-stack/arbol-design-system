<script lang="ts">
  /* Small square icon button used in the pinned bar's hover cluster (Edit /
   * Remove). Danger variant tints to --arbol-color-err on hover. */
  import type { Snippet } from 'svelte'

  let { children, onClick, title, danger = false }:
    {
      children: Snippet
      onClick: () => void
      title: string
      danger?: boolean
    } = $props()

  let hover = $state(false)
  const hot = $derived(danger ? 'var(--arbol-color-err)' : 'var(--arbol-color-text)')
  const bg = $derived(
    hover
      ? danger
        ? 'color-mix(in oklch, var(--arbol-color-err) 16%, transparent)'
        : 'var(--arbol-color-surface-2)'
      : 'transparent',
  )
  const border = $derived(
    hover
      ? danger
        ? 'color-mix(in oklch, var(--arbol-color-err) 40%, transparent)'
        : 'var(--arbol-color-border)'
      : 'transparent',
  )
</script>

<button
  onclick={onClick}
  {title}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  style="width:24px;height:24px;flex-shrink:0;display:grid;place-items:center;border-radius:6px;cursor:pointer;
         background:{bg};border:1px solid {border};color:{hover ? hot : 'var(--arbol-color-text-muted)'};
         transition:background .12s, border-color .12s, color .12s"
>
  {@render children()}
</button>
