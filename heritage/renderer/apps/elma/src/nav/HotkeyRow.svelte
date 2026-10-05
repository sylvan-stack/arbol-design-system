<script lang="ts">
  /* A single hotkey-index row: optional icon, label, optional trailing note, and
   * optional keycaps. Rows are clickable for convenience. Internal to the nav
   * cluster. `icon`/`trailing` (React ReactNode props) become optional Snippets. */
  import type { Snippet } from 'svelte'
  import NavKeys from './NavKeys.svelte'

  let { icon, label, keys, active = false, muted = false, disabled = false, trailing, onClick }:
    {
      icon?: Snippet
      label: string
      keys?: string[] | null
      active?: boolean
      muted?: boolean
      disabled?: boolean
      trailing?: Snippet
      onClick?: () => void
    } = $props()

  let hover = $state(false)
  const clickable = $derived(!!onClick && !disabled)

  const bg = $derived(
    active
      ? 'var(--arbol-color-accent-soft)'
      : hover && clickable
        ? 'var(--arbol-color-surface-2)'
        : 'transparent',
  )
  const color = $derived(
    active
      ? 'var(--arbol-color-accent)'
      : muted || disabled
        ? 'var(--arbol-color-text-muted)'
        : 'var(--arbol-color-text)',
  )
</script>

<div
  onclick={disabled ? undefined : onClick}
  role={clickable ? 'button' : undefined}
  tabindex={clickable ? 0 : undefined}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  style="display:flex;align-items:center;gap:var(--arbol-space-2);padding:7px var(--arbol-space-3);
         margin:1px var(--arbol-space-2);border-radius:var(--arbol-radius-m);
         cursor:{clickable ? 'pointer' : 'default'};opacity:{disabled ? 0.45 : 1};background:{bg};
         border:1px solid {active ? 'color-mix(in oklch, var(--arbol-color-accent) 35%, transparent)' : 'transparent'};
         color:{color};transition:background .12s, color .12s"
>
  {#if icon}<span style="display:inline-flex;flex-shrink:0">{@render icon()}</span>{/if}
  <span
    style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
           font:500 var(--arbol-type-body)/1.2 var(--arbol-font-ui)"
  >
    {label}
  </span>
  {#if trailing}{@render trailing()}{/if}
  {#if keys}<NavKeys {keys} />{/if}
</div>
