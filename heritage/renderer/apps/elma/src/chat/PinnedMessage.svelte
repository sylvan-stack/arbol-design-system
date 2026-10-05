<script lang="ts">
  /* PinnedMessage — the sticky user-prompt header above the response. Clamps to
   * three rows with a See-more toggle when the prompt overflows; expanded prompts
   * are capped to the viewport and scroll independently. Hosts the branch
   * switcher + turn stepper + edit/remove affordances in a hover toolbar. (Ported from
   * React; branchSwitcher/stepper JSX props are now Snippet props.) */
  import type { Snippet } from 'svelte'
  import { InlineMarkdown } from '@arbol/design-system'
  import AttachedContext, { type AttachedContextItem } from './AttachedContext.svelte'
  import MessageImages from './MessageImages.svelte'
  import type { MessageImage } from '../app/message-attachments'
  import CopyButton from './CopyButton.svelte'
  import PencilIcon from './branching/PencilIcon.svelte'
  import TrashIcon from './branching/TrashIcon.svelte'

  let { text, attachments = [], contextItems = [], onEdit, onRemove, branchSwitcher, stepper, onOpenLocalFile, baseDir }:
    {
      text: string
      attachments?: MessageImage[]
      contextItems?: AttachedContextItem[]
      onEdit?: () => void
      onRemove?: () => void
      branchSwitcher?: Snippet
      stepper?: Snippet
      onOpenLocalFile?: (path: string) => void
      baseDir?: string
    } = $props()

  let textEl: HTMLDivElement
  let expanded = $state(false)
  let canExpand = $state(false)

  // Reset the expanded state whenever the prompt text changes (turn navigation).
  $effect(() => {
    text
    expanded = false
  })

  // Measure whether the natural content height exceeds the 3-row collapsed clamp.
  // Re-runs on text change and on resize. Mirrors the React measure() effect.
  $effect(() => {
    text // track text so we re-measure on change
    const el = textEl
    if (!el) return

    const measure = () => {
      // Temporarily remove the collapsed clamp so scrollHeight reflects the
      // natural content height. The visible collapsed state is still capped to
      // exactly three text rows below.
      const prevDisplay = el.style.display
      const prevWebkitBoxOrient = el.style.webkitBoxOrient
      const prevWebkitLineClamp = el.style.webkitLineClamp
      const prevOverflow = el.style.overflow
      const prevOverflowX = el.style.overflowX
      const prevOverflowY = el.style.overflowY
      const prevMaxHeight = el.style.maxHeight

      el.style.display = 'block'
      el.style.webkitBoxOrient = ''
      el.style.webkitLineClamp = ''
      el.style.overflow = 'visible'
      el.style.maxHeight = 'none'

      const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 0
      const collapsedHeight = lineHeight * 3
      const naturalHeight = el.scrollHeight
      canExpand = lineHeight > 0 && naturalHeight > collapsedHeight + 1

      el.style.display = prevDisplay
      el.style.webkitBoxOrient = prevWebkitBoxOrient
      el.style.webkitLineClamp = prevWebkitLineClamp
      // Restoring only the shorthand loses an explicit `overflow-y:auto` from
      // the expanded style: assigning `overflow` above resets both longhands.
      // That left the box height capped while its contents painted over the
      // response below it. Restore the longhands as well so expanded prompts
      // remain independently scrollable.
      el.style.overflow = prevOverflow
      el.style.overflowX = prevOverflowX
      el.style.overflowY = prevOverflowY
      el.style.maxHeight = prevMaxHeight
    }

    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  })

  const clampStyle = $derived(
    expanded
      ? 'max-height:min(50dvh, 32rem);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable'
      : 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;max-height:calc(1.55em * 3)',
  )
</script>

<div class="pinned-message" style="border-bottom:1px solid var(--arbol-color-border);background:color-mix(in oklch, var(--arbol-color-surface) 68%, var(--arbol-color-bg));padding:var(--arbol-space-3) var(--arbol-space-4)">
  <div class="prompt-content" style="display:flex;flex-direction:column;gap:4px;min-width:0">
    <div style="min-width:0;width:100%">
      <MessageImages {attachments} />
      {#if contextItems.length > 0}
        <div style="margin-bottom:var(--arbol-space-3)">
          <AttachedContext items={contextItems} {onOpenLocalFile} {baseDir} />
        </div>
      {/if}
      <div
        bind:this={textEl}
        style="color:var(--arbol-color-text);white-space:pre-wrap;overflow-wrap:anywhere;font:400 var(--arbol-type-body)/1.55 var(--arbol-font-ui);{clampStyle}"
      >
        <InlineMarkdown {text} {onOpenLocalFile} {baseDir} />
      </div>
      {#if canExpand}
        <button
          type="button"
          onclick={() => (expanded = !expanded)}
          aria-expanded={expanded}
          style="all:unset;display:inline-block;margin-top:4px;cursor:pointer;color:var(--arbol-color-link);font:600 var(--arbol-type-label)/1 var(--arbol-font-ui)"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      {/if}
    </div>
    <div class="prompt-controls">
      {#if branchSwitcher}{@render branchSwitcher()}{/if}
      {#if stepper}{@render stepper()}{/if}
      <CopyButton text={text} label="Copy prompt" iconOnly />
      {#if onEdit}
        <button type="button" class="prompt-action" onclick={onEdit} aria-label="Edit" title="Edit"><PencilIcon size={16} /></button>
      {/if}
      {#if onRemove}
        <button type="button" class="prompt-action" onclick={onRemove} aria-label="Remove" title="Remove"><TrashIcon size={16} /></button>
      {/if}
    </div>
  </div>
</div>

<style>
  .pinned-message { position: relative; }
  .prompt-controls {
    position: absolute;
    right: var(--arbol-space-4);
    bottom: 4px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    max-width: calc(100% - 2 * var(--arbol-space-4));
    border-radius: 6px;
    background: var(--arbol-color-surface);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--arbol-color-text) 15%, transparent);
    opacity: 0;
    pointer-events: none;
  }
  .pinned-message:hover .prompt-controls,
  .pinned-message:focus-within .prompt-controls {
    opacity: 1;
    pointer-events: auto;
  }
  @media (hover: none) {
    .prompt-controls { opacity: 1; pointer-events: auto; }
  }
  .prompt-action {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--arbol-color-text-muted);
  }
  .prompt-action:hover { color: var(--arbol-color-text); background: var(--arbol-color-surface-2); }
  .prompt-action:focus-visible { color: var(--arbol-color-text); outline: 2px solid var(--arbol-color-link); outline-offset: 2px; }
</style>
