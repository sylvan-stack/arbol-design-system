<script lang="ts">
  /* BranchSwitcher — ‹ Branch k / m › in the pinned bar, a twin of the TurnStepper
   * but accent-tinted so it reads as a distinct control. Shown only at a fork
   * (branchCount > 1); arrows switch to the previous/next sibling branch and are
   * disabled at the ends. Sits beside the TurnStepper. */
  import BranchIcon from './BranchIcon.svelte'
  import BranchStepArrow from './BranchStepArrow.svelte'

  let { index, total, onPrev, onNext }:
    {
      index: number
      total: number
      onPrev: () => void
      onNext: () => void
    } = $props()
</script>

<div
  title="Alternative branches from this point"
  style="display:flex;align-items:center;gap:3px;flex-shrink:0;padding-left:4px;padding-right:2px;border-radius:8px;
         background:var(--arbol-color-accent-soft);
         border:1px solid color-mix(in oklch, var(--arbol-color-accent) 26%, transparent)"
>
  <span style="display:flex;color:var(--arbol-color-accent);margin-right:1px">
    <BranchIcon size={13} />
  </span>
  <BranchStepArrow glyph="‹" disabled={index <= 0} onClick={onPrev} title="Previous branch" />
  <span style="white-space:nowrap;font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-accent)">
    Branch {index + 1}/{total}
  </span>
  <BranchStepArrow glyph="›" disabled={index >= total - 1} onClick={onNext} title="Next branch" />
</div>
