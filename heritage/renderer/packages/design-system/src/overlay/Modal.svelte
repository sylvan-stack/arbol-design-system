<script lang="ts">
  import type { Snippet } from 'svelte'
  /* Focus-dimming Modal (ux-ui-guide §1.6). Esc / backdrop / × dismiss (unless
   * dismissable=false). (Ported from React.) */
  let { title, subtitle, icon, onClose, footer, children, dismissable = true, width = 540 }:
    {
      title: string
      subtitle?: string
      icon?: Snippet
      onClose: () => void
      footer?: Snippet
      children: Snippet
      dismissable?: boolean
      width?: number
    } = $props()

  $effect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissable) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget && dismissable) onClose()
  }
</script>

<div
  onmousedown={onBackdrop}
  role="presentation"
  style="position:fixed;inset:0;box-sizing:border-box;background:color-mix(in oklch, var(--arbol-color-bg) 55%, transparent);
         backdrop-filter:blur(3px);display:grid;place-items:center;z-index:1000;padding:24px;
         animation:arbolfade .14s ease"
>
  <div
    role="dialog"
    aria-modal="true"
    style="box-sizing:border-box;width:{width}px;max-width:100%;max-height:100%;min-height:0;overflow:hidden;
           display:flex;flex-direction:column;background:var(--arbol-color-surface);
           border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);
           box-shadow:var(--arbol-shadow-pop);animation:arbolpop .16s cubic-bezier(.2,.8,.2,1)"
  >
    <div style="display:flex;flex:0 0 auto;align-items:center;gap:12px;padding:var(--arbol-space-4) var(--arbol-space-5);
                border-bottom:1px solid var(--arbol-color-border)">
      {#if icon}<span style="color:var(--arbol-color-accent);display:flex">{@render icon()}</span>{/if}
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--arbol-type-title);font-weight:700">{title}</div>
        {#if subtitle}
          <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);font-family:var(--arbol-font-mono)">{subtitle}</div>
        {/if}
      </div>
      <button onclick={onClose} aria-label="Close"
        style="background:transparent;border:0;color:var(--arbol-color-text-muted);font-size:22px;cursor:pointer;line-height:1;padding:4px">×</button>
    </div>
    <div style="flex:1 1 auto;min-height:0;padding:var(--arbol-space-5);overflow-y:auto;overflow-x:hidden">{@render children()}</div>
    {#if footer}
      <div style="display:flex;flex:0 0 auto;justify-content:flex-end;gap:var(--arbol-space-2);
                  padding:var(--arbol-space-4) var(--arbol-space-5);border-top:1px solid var(--arbol-color-border)">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>
