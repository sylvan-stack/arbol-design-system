<script lang="ts">
  /* Quick Actions palette (⇧⏎) — a keyboard-first command sheet for common
   * session-level actions. The intended workflow is two keystrokes: ⇧⏎ to open,
   * then a single symbol key to fire (e.g. ⇧⏎ → B = branch from here). Rows are
   * also clickable; ↑/↓ + ⏎ work; Esc closes. Scoped to the Viewport and styled
   * like the other palettes. The action list is data, so features can register
   * their own actions + symbols as Elma grows.
   *
   * The keydown listener is capture-phase so it fires even while the composer is
   * focused, and stopPropagation keeps the page's global hotkeys from also firing. */
  import { KbdHint, RingsMark } from '@arbol/design-system'
  import type { QuickAction } from './QuickActions.types'
  import QuickActionRow from './QuickActionRow.svelte'

  let { actions, onClose }: { actions: QuickAction[]; onClose: () => void } = $props()

  let sel = $state(0)
  const live = $derived(actions.filter((a) => !a.disabled))

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        sel = Math.min(actions.length - 1, sel + 1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        sel = Math.max(0, sel - 1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const a = actions[sel]
        if (a && !a.disabled) a.onRun()
        return
      }
      // single-symbol trigger
      const a = actions.find((x) => x.key.toLowerCase() === (e.key || '').toLowerCase())
      if (a && !a.disabled) {
        e.preventDefault()
        e.stopPropagation()
        a.onRun()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }
</script>

<div
  onmousedown={onClose}
  role="presentation"
  style="position:absolute;inset:0;z-index:65;display:flex;justify-content:center;align-items:flex-start;padding-top:16vh;
         background:color-mix(in oklch, var(--arbol-color-bg) 55%, transparent);backdrop-filter:blur(2px);
         animation:arbolfade .12s ease"
>
  <div
    onmousedown={stop}
    role="dialog"
    aria-modal="true"
    style="width:min(440px, 92%);max-height:70%;display:flex;flex-direction:column;background:var(--arbol-color-surface);
           border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);box-shadow:var(--arbol-shadow-pop);
           overflow:hidden;animation:arbolpop .14s cubic-bezier(.2,.7,.2,1)"
  >
    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-3);padding:var(--arbol-space-3) var(--arbol-space-4);
             border-bottom:1px solid var(--arbol-color-border)"
    >
      <span style="display:flex;flex-shrink:0;color:var(--arbol-color-accent)">
        <RingsMark size={16} color="var(--arbol-color-accent)" />
      </span>
      <span
        style="flex:1;font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:0.6px;text-transform:uppercase;
               color:var(--arbol-color-text-muted)"
      >
        Quick actions
      </span>
      <span style="flex-shrink:0;font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)">
        {live.length}
      </span>
    </div>
    <div style="overflow-y:auto;padding:5px">
      {#each actions as a, i (a.key)}
        <QuickActionRow action={a} selected={i === sel} onHover={() => (sel = i)} />
      {/each}
    </div>
    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-4);flex-shrink:0;
             padding:var(--arbol-space-2) var(--arbol-space-4);border-top:1px solid var(--arbol-color-border);
             font:400 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
    >
      <span style="display:inline-flex;align-items:center;gap:6px">
        press a <KbdHint k="key" />
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px">
        <KbdHint k="↑" />
        <KbdHint k="↓" />
        <KbdHint k="⏎" />
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px">
        <KbdHint k="esc" /> close
      </span>
    </div>
  </div>
</div>
