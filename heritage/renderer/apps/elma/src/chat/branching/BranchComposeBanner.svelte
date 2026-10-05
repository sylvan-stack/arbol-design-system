<script lang="ts">
  /* BranchComposeBanner — a warning-styled banner above the composer while a
   * fork ("branch") or destructive edit is armed, so the next send's effect is
   * obvious. Cancel (or Esc) exits compose mode. `mode` is the compose mode;
   * 'new' is never rendered as a banner by the caller, but is accepted for
   * type-compatibility with the spine's ComposeMode. */
  import BranchIcon from './BranchIcon.svelte'
  import PencilIcon from './PencilIcon.svelte'

  let { mode, onCancel }: { mode: 'new' | 'branch' | 'edit'; onCancel: () => void } = $props()

  const isEdit = $derived(mode === 'edit')
  const msg = $derived(
    isEdit
      ? 'Editing replaces this message — the original and every turn after it will be removed.'
      : 'Sending a new message will create a new conversation branch from here.',
  )

  function onEnter(e: MouseEvent) {
    const t = e.currentTarget as HTMLButtonElement
    t.style.color = 'var(--arbol-color-text)'
    t.style.background = 'var(--arbol-color-surface-2)'
  }
  function onLeave(e: MouseEvent) {
    const t = e.currentTarget as HTMLButtonElement
    t.style.color = 'var(--arbol-color-text-muted)'
    t.style.background = 'transparent'
  }
</script>

<div
  style="max-width:var(--arbol-text-area-max-width);margin:0 auto var(--arbol-space-3);display:flex;align-items:center;
         gap:var(--arbol-space-3);padding:var(--arbol-space-2) var(--arbol-space-3);border-radius:var(--arbol-radius-m);
         background:color-mix(in oklch, var(--arbol-color-warn) 14%, var(--arbol-color-surface));
         border:1px solid color-mix(in oklch, var(--arbol-color-warn) 45%, transparent)"
>
  <span style="display:flex;flex-shrink:0;color:var(--arbol-color-warn)">
    {#if isEdit}<PencilIcon size={15} />{:else}<BranchIcon size={16} />{/if}
  </span>
  <span style="flex:1;min-width:0;font:500 var(--arbol-type-label)/1.4 var(--arbol-font-ui);color:var(--arbol-color-text)">
    {msg}
  </span>
  <button
    onclick={onCancel}
    title="Cancel (Esc)"
    onmouseenter={onEnter}
    onmouseleave={onLeave}
    style="flex-shrink:0;background:transparent;border:1px solid var(--arbol-color-border);border-radius:6px;
           padding:3px 9px;cursor:pointer;font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);
           color:var(--arbol-color-text-muted)"
  >
    Cancel
  </button>
</div>
