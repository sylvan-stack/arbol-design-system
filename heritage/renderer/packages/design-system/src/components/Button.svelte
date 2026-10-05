<script lang="ts">
  import type { Snippet } from 'svelte'
  let { children, onclick, kind = 'default', disabled = false, size = 'm', title }:
    {
      children: Snippet
      onclick?: (e: MouseEvent) => void
      kind?: 'default' | 'primary' | 'ghost' | 'soft'
      disabled?: boolean
      size?: 's' | 'm'
      title?: string
    } = $props()

  let hover = $state(false)

  const bg = $derived(
    kind === 'primary' ? 'var(--arbol-color-accent)'
    : kind === 'ghost' ? 'transparent'
    : kind === 'soft' ? 'var(--arbol-color-accent-soft)'
    : 'var(--arbol-color-surface-2)',
  )
  const color = $derived(
    kind === 'primary' ? 'var(--arbol-color-accent-ink)'
    : kind === 'soft' ? 'var(--arbol-color-accent)'
    : 'var(--arbol-color-text)',
  )
  const pad = $derived(size === 's' ? '5px 10px' : 'var(--arbol-space-2) var(--arbol-space-3)')
  const border = $derived(kind === 'ghost' || kind === 'default'
    ? '1px solid var(--arbol-color-border)' : '1px solid transparent')
</script>

<button
  {onclick}
  {disabled}
  {title}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  style="background:{bg};color:{color};border:{border};border-radius:var(--arbol-radius-m);
         padding:{pad};font:500 {size === 's' ? '12px' : 'var(--arbol-type-body)'}/1 var(--arbol-font-ui);
         letter-spacing:0.1px;cursor:{disabled ? 'default' : 'pointer'};opacity:{disabled ? 0.45 : 1};
         white-space:nowrap;filter:{hover && !disabled ? 'brightness(1.08)' : 'none'};
         transition:filter .12s ease, transform .12s ease;
         transform:{hover && !disabled ? 'translateY(-0.5px)' : 'none'}"
>
  {@render children()}
</button>
