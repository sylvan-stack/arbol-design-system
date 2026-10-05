<script lang="ts">
  /* ConfirmDialog — destructive-action guard, scoped to the Viewport (absolute
   * inset-0, like the history overlay). Enter confirms, Esc / backdrop cancels —
   * handled in the capture phase so it doesn't collide with the page's global
   * keys. Used by Remove. */
  import TrashIcon from './TrashIcon.svelte'

  let { title, body, confirmLabel = 'Remove', onConfirm, onCancel }:
    {
      title: string
      body: string
      confirmLabel?: string
      onConfirm: () => void
      onCancel: () => void
    } = $props()

  let hotConfirm = $state(false)
  let hotCancel = $state(false)

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onConfirm()
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
  onmousedown={onCancel}
  role="presentation"
  style="position:absolute;inset:0;z-index:70;display:flex;justify-content:center;align-items:center;
         background:color-mix(in oklch, var(--arbol-color-bg) 58%, transparent);backdrop-filter:blur(2px);
         animation:arbolfade .12s ease;padding:var(--arbol-space-6)"
>
  <div
    onmousedown={stop}
    role="dialog"
    aria-modal="true"
    style="width:min(420px, 100%);background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
           border-radius:var(--arbol-radius-l);box-shadow:var(--arbol-shadow-pop);overflow:hidden;
           animation:arbolpop .14s cubic-bezier(.2,.7,.2,1)"
  >
    <div style="padding:var(--arbol-space-5) var(--arbol-space-5) var(--arbol-space-4)">
      <div style="display:flex;align-items:center;gap:var(--arbol-space-3);margin-bottom:var(--arbol-space-3)">
        <span style="width:30px;height:30px;flex-shrink:0;display:grid;place-items:center;border-radius:8px;
                     background:color-mix(in oklch, var(--arbol-color-err) 16%, transparent);color:var(--arbol-color-err)">
          <TrashIcon size={16} />
        </span>
        <h3 style="margin:0;font:700 var(--arbol-type-title)/1.25 var(--arbol-font-ui);color:var(--arbol-color-text);white-space:nowrap">
          {title}
        </h3>
      </div>
      <p style="margin:0;font:400 var(--arbol-type-body)/1.55 var(--arbol-font-ui);color:var(--arbol-color-text-muted)">
        {body}
      </p>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:var(--arbol-space-3);
                padding:var(--arbol-space-3) var(--arbol-space-5);border-top:1px solid var(--arbol-color-border)">
      <button
        onclick={onCancel}
        onmouseenter={() => (hotCancel = true)}
        onmouseleave={() => (hotCancel = false)}
        style="padding:7px 14px;border-radius:var(--arbol-radius-m);cursor:pointer;
               background:{hotCancel ? 'var(--arbol-color-surface-2)' : 'transparent'};
               border:1px solid var(--arbol-color-border);color:var(--arbol-color-text);
               font:600 var(--arbol-type-label)/1 var(--arbol-font-ui)"
      >
        Cancel
      </button>
      <button
        onclick={onConfirm}
        onmouseenter={() => (hotConfirm = true)}
        onmouseleave={() => (hotConfirm = false)}
        style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:var(--arbol-radius-m);cursor:pointer;
               background:{hotConfirm ? 'color-mix(in oklch, var(--arbol-color-err) 86%, black)' : 'var(--arbol-color-err)'};
               border:1px solid var(--arbol-color-err);color:white;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui)"
      >
        <TrashIcon size={14} />
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
