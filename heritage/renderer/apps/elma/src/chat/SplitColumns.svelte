<script lang="ts">
  /* Resizable two-column split for the chat surface: the chat area on the left and
   * a contextual preview (SidePanel) on the right. Columns are equal width by
   * default; a draggable divider lets the user resize them. Both tracks keep a
   * min-width and the preview track is clamped with CSS so the pair can never
   * overflow the window — the chat column always keeps at least MIN_CHAT_PX. */
  import type { Snippet } from 'svelte'

  const MIN_CHAT_PX = 360
  const MIN_PREVIEW_PX = 320
  const DIVIDER_PX = 6

  let { left, right }: { left: Snippet; right: Snippet } = $props()

  let containerEl: HTMLDivElement | null = $state(null)
  // null = no manual size yet → equal split (both 1fr). A number is the desired
  // preview width in px (still clamped by CSS so it never crowds out the chat).
  let previewPx = $state<number | null>(null)
  let dragging = false

  $effect(() => {
    const onMove = (e: MouseEvent) => {
      const el = containerEl
      if (!dragging || !el) return
      const rect = el.getBoundingClientRect()
      const raw = rect.right - e.clientX - DIVIDER_PX / 2
      const max = rect.width - DIVIDER_PX - MIN_CHAT_PX
      previewPx = Math.max(MIN_PREVIEW_PX, Math.min(raw, max))
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  })

  function beginDrag(e: MouseEvent) {
    e.preventDefault()
    dragging = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const previewTrack = $derived(
    previewPx == null
      ? `minmax(${MIN_PREVIEW_PX}px, 1fr)`
      : `clamp(${MIN_PREVIEW_PX}px, ${previewPx}px, calc(100% - ${MIN_CHAT_PX + DIVIDER_PX}px))`,
  )
</script>

<div
  bind:this={containerEl}
  style="height:100%;min-height:0;display:grid;grid-template-columns:minmax({MIN_CHAT_PX}px, 1fr) {DIVIDER_PX}px {previewTrack}"
>
  <div style="min-width:0;min-height:0;height:100%;overflow:hidden">{@render left()}</div>
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize Right Panel"
    onmousedown={beginDrag}
    ondblclick={() => (previewPx = null)}
    title="Resize Right Panel · double-click to reset"
    style="cursor:col-resize;align-self:stretch;display:grid;place-items:center;background:var(--arbol-color-bg)"
  >
    <div style="width:1px;height:100%;background:var(--arbol-color-border)"></div>
  </div>
  <div style="min-width:0;min-height:0;height:100%;overflow:hidden">{@render right()}</div>
</div>
