<script lang="ts">
  /* ‹ Turn n / N › — the in-bar navigator. Arrows step within the active branch;
   * the label opens the history overlay. Composed into PinnedMessage's `stepper`
   * snippet by ElmaPage and the chat stories. (Ported from React; the internal
   * StepArrow is inlined as a hover-tracked button below.) */
  let { index, total, onOlder, onNewer, onOpen }:
    { index: number; total: number; onOlder: () => void; onNewer: () => void; onOpen: () => void } = $props()

  let hoverOlder = $state(false)
  let hoverNewer = $state(false)

  const olderDisabled = $derived(index <= 0)
  const newerDisabled = $derived(index >= total - 1)

  function arrowStyle(hover: boolean, disabled: boolean): string {
    return (
      'width:22px;height:22px;flex-shrink:0;display:grid;place-items:center;border-radius:6px;' +
      `cursor:${disabled ? 'default' : 'pointer'};` +
      `background:${hover && !disabled ? 'var(--arbol-color-surface-2)' : 'transparent'};` +
      `border:1px solid ${hover && !disabled ? 'var(--arbol-color-border)' : 'transparent'};` +
      `color:${disabled ? 'var(--arbol-color-text-muted)' : 'var(--arbol-color-text)'};` +
      `opacity:${disabled ? 0.35 : 1};font:600 14px/1 var(--arbol-font-ui);transition:background .12s, border-color .12s`
    )
  }
</script>

<div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
  <button
    type="button"
    onclick={olderDisabled ? undefined : onOlder}
    disabled={olderDisabled}
    title="Older turn  (⌘[)"
    onmouseenter={() => (hoverOlder = true)}
    onmouseleave={() => (hoverOlder = false)}
    style={arrowStyle(hoverOlder, olderDisabled)}
  >‹</button>
  <button
    type="button"
    onclick={onOpen}
    aria-label={`Turn ${index + 1} of ${total}. Jump to turn`}
    title="Jump to turn  (⌘P)"
    onmouseenter={(e) => {
      e.currentTarget.style.background = 'var(--arbol-color-surface-2)'
      e.currentTarget.style.borderColor = 'var(--arbol-color-border)'
    }}
    onmouseleave={(e) => {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.borderColor = 'transparent'
    }}
    style="background:transparent;border:1px solid transparent;cursor:pointer;border-radius:6px;padding:3px 7px;white-space:nowrap;font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
  >
    <span style="color:var(--arbol-color-text)">{index + 1}</span>/{total}
  </button>
  <button
    type="button"
    onclick={newerDisabled ? undefined : onNewer}
    disabled={newerDisabled}
    title="Newer turn  (⌘])"
    onmouseenter={() => (hoverNewer = true)}
    onmouseleave={() => (hoverNewer = false)}
    style={arrowStyle(hoverNewer, newerDisabled)}
  >›</button>
</div>
