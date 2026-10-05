<script lang="ts">
  /* A single row in the Quick Actions palette. Internal to the quick cluster
   * (not re-exported). */
  import type { QuickAction } from './QuickActions.types'

  let { action, selected, onHover }:
    {
      action: QuickAction
      selected: boolean
      onHover: () => void
    } = $props()

  const dim = $derived(action.disabled)
</script>

<button
  onclick={dim ? undefined : action.onRun}
  onmouseenter={onHover}
  disabled={dim}
  style="width:100%;text-align:left;display:flex;align-items:center;gap:var(--arbol-space-3);padding:var(--arbol-space-3);
         border-radius:var(--arbol-radius-m);margin-bottom:3px;cursor:{dim ? 'default' : 'pointer'};opacity:{dim ? 0.4 : 1};
         background:{selected && !dim ? 'var(--arbol-color-accent-soft)' : 'transparent'};
         border:1px solid {selected && !dim
           ? 'color-mix(in oklch, var(--arbol-color-accent) 30%, transparent)'
           : 'transparent'};
         transition:background .12s, border-color .12s"
>
  <kbd
    style="flex-shrink:0;width:26px;height:26px;display:grid;place-items:center;border-radius:7px;
           background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);
           font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);
           color:{action.danger
             ? 'var(--arbol-color-err)'
             : selected
               ? 'var(--arbol-color-accent)'
               : 'var(--arbol-color-text)'}"
  >
    {action.key}
  </kbd>
  <span
    style="flex-shrink:0;display:flex;color:{action.danger
      ? 'var(--arbol-color-err)'
      : selected
        ? 'var(--arbol-color-accent)'
        : 'var(--arbol-color-text-muted)'}"
  >
    {#if action.icon}{@render action.icon()}{/if}
  </span>
  <span style="flex:1;min-width:0">
    <span
      style="display:block;font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui);
             color:{action.danger ? 'var(--arbol-color-err)' : 'var(--arbol-color-text)'}"
    >
      {action.label}
    </span>
    {#if action.desc}
      <span
        style="display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
               font:400 var(--arbol-type-label)/1.35 var(--arbol-font-ui);color:var(--arbol-color-text-muted)"
      >
        {action.desc}
      </span>
    {/if}
  </span>
</button>
