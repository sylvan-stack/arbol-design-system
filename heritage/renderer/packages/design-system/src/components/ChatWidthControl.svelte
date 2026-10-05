<script lang="ts">
  /* Reading-width stepper (Header). App owns persistence and applies the width
   * through the shared text-area token; this component only renders controls. */
  let { onInc, onDec, canInc = true, canDec = true, title }:
    {
      onInc: () => void
      onDec: () => void
      canInc?: boolean
      canDec?: boolean
      title?: string
    } = $props()

  function btnStyle(disabled: boolean): string {
    return `width:22px;height:22px;display:grid;place-items:center;cursor:${disabled ? 'default' : 'pointer'};
            opacity:${disabled ? 0.4 : 1};background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);
            border-radius:7px;color:var(--arbol-color-text-muted);font:600 14px/1 var(--arbol-font-ui)`
  }
</script>

<div style="display:flex;align-items:center;gap:4px" title={title || 'Chat width'}>
  <button style={btnStyle(!canDec)} disabled={!canDec} onclick={onDec} aria-label="Narrow chat area">
    −
  </button>
  <span aria-hidden="true" style="width:18px;text-align:center;font:700 13px/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);user-select:none">
    ↔
  </span>
  <button style={btnStyle(!canInc)} disabled={!canInc} onclick={onInc} aria-label="Widen chat area">
    +
  </button>
</div>
