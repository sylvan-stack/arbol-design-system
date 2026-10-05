<script lang="ts">
  /* Shared button for the approval cards (split out of ToolApprovalCard). */
  import type { Snippet } from 'svelte'

  let {
    variant,
    disabled,
    onClick,
    children,
  }: {
    variant: 'primary' | 'ghost' | 'danger'
    disabled?: boolean
    onClick: () => void
    children: Snippet
  } = $props()

  const base = $derived(
    [
      'all:unset',
      'box-sizing:border-box',
      `cursor:${disabled ? 'default' : 'pointer'}`,
      `opacity:${disabled ? 0.5 : 1}`,
      'padding:var(--arbol-space-2) var(--arbol-space-4)',
      'border-radius:var(--arbol-radius-s)',
      'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui)',
      'text-align:center',
    ].join(';'),
  )
  const skin = $derived(
    variant === 'primary'
      ? 'background:var(--arbol-color-accent);color:var(--arbol-color-on-accent, #fff);border:1px solid transparent'
      : variant === 'danger'
        ? 'background:transparent;color:var(--arbol-color-danger, #c0392b);border:1px solid var(--arbol-color-border)'
        : 'background:transparent;color:var(--arbol-color-text);border:1px solid var(--arbol-color-border)',
  )
</script>

<button type="button" {disabled} onclick={onClick} style="{base};{skin}">
  {@render children()}
</button>
