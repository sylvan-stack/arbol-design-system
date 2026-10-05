<script lang="ts">
  import { onMount } from 'svelte'
  import type { StationTag } from './stations'

  let { tags, compact = false }: { tags: StationTag[]; compact?: boolean } = $props()

  let expanded = $state(false)
  let overflowing = $state(false)
  let tagRows = $state<HTMLDivElement>()

  function badgeSymbol(tag: StationTag): string {
    const configured = tag.symbol?.trim()
    return configured || Array.from(tag.name.trim()).slice(0, 4).join('').toLocaleUpperCase().padEnd(3, '·')
  }

  function measureOverflow() {
    if (!tagRows || expanded) return
    overflowing = tagRows.scrollHeight > tagRows.clientHeight + 1
  }

  onMount(() => {
    const observer = new ResizeObserver(measureOverflow)
    observer.observe(tagRows)
    measureOverflow()
    return () => observer.disconnect()
  })

  function toggle(event: MouseEvent) {
    event.stopPropagation()
    expanded = !expanded
    if (!expanded) requestAnimationFrame(measureOverflow)
  }
</script>

{#if tags.length}
  <div class="station-tags" data-compact={compact}>
    <div class="station-tag-rows" class:expanded bind:this={tagRows} aria-label="Chat Session tags">
      {#each tags as tag (`${tag.name}=${tag.value ?? ''}:${tag.symbol ?? ''}`)}
        <span class="station-tag" title={tag.value === undefined ? tag.name : `${tag.name}=${tag.value}`}>
          {badgeSymbol(tag)}
        </span>
      {/each}
    </div>
    {#if overflowing || expanded}
      <button type="button" onclick={toggle} aria-expanded={expanded}>{expanded ? 'See less' : 'See more'}</button>
    {/if}
  </div>
{/if}

<style>
  .station-tags { display:flex; align-items:flex-start; gap:6px; min-width:0; padding:0 3px; }
  .station-tag-rows { display:flex; flex:1; min-width:0; flex-wrap:wrap; gap:4px; max-height:56px; overflow:hidden; }
  .station-tag-rows.expanded { max-height:none; }
  .station-tag {
    display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:16px; box-sizing:border-box;
    padding:0 5px; border:1px solid color-mix(in oklch, var(--arbol-color-accent) 42%, var(--arbol-color-border));
    border-radius:999px; background:color-mix(in oklch, var(--arbol-color-accent-soft) 78%, var(--arbol-color-surface));
    color:color-mix(in oklch, var(--arbol-color-accent) 72%, var(--arbol-color-text));
    font:750 8px/1 var(--arbol-font-mono); letter-spacing:.35px; white-space:nowrap;
  }
  .station-tag:nth-child(4n + 2) { filter:hue-rotate(55deg); }
  .station-tag:nth-child(4n + 3) { filter:hue-rotate(145deg); }
  .station-tag:nth-child(4n + 4) { filter:hue-rotate(235deg); }
  button { flex:none; padding:2px 3px; border:0; background:transparent; color:var(--arbol-color-accent); font:650 8px/1.2 var(--arbol-font-mono); cursor:pointer; }
  [data-compact="true"] .station-tag-rows { gap:3px; max-height:45px; }
  [data-compact="true"] .station-tag-rows.expanded { max-height:none; }
  [data-compact="true"] .station-tag { min-width:18px; height:13px; padding:0 4px; font-size:6.5px; }
  [data-compact="true"] button { font-size:6.5px; }
</style>
