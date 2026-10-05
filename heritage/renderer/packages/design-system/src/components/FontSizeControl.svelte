<script lang="ts">
  /* Text-size stepper. Hosts own font-scale state and persistence. */
  let { onInc, onDec, canInc = true, canDec = true, title }:
    { onInc: () => void; onDec: () => void; canInc?: boolean; canDec?: boolean; title?: string } = $props()
  function btnStyle(disabled: boolean): string {
    return `width:22px;height:22px;display:grid;place-items:center;cursor:${disabled ? 'default' : 'pointer'};
      opacity:${disabled ? 0.4 : 1};background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);
      border-radius:7px;color:var(--arbol-color-text-muted);font:600 14px/1 var(--arbol-font-ui)`
  }
</script>
<div style="display:flex;align-items:center;gap:4px" title={title || 'Text size'}>
  <button style={btnStyle(!canDec)} disabled={!canDec} onclick={onDec} aria-label="Decrease text size">−</button>
  <span style="width:16px;text-align:center;font:700 11px/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);user-select:none">A</span>
  <button style={btnStyle(!canInc)} disabled={!canInc} onclick={onInc} aria-label="Increase text size">+</button>
</div>
