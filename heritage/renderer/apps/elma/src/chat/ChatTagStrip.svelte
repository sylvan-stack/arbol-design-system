<script lang="ts">
  import type { ChatTag } from './sessionTags'

  let { tags, inline = false }: { tags: ChatTag[]; inline?: boolean } = $props()
</script>

{#if tags.length}
  <div
    aria-label="Chat tags"
    style="display:flex;flex-wrap:wrap;justify-content:{inline ? 'flex-start' : 'center'};align-items:center;gap:5px;
           {inline ? '' : 'padding:5px var(--arbol-space-4) 6px;border-top:1px solid color-mix(in oklch,var(--arbol-color-border) 65%,transparent);background:var(--arbol-color-bg);'}
           color:var(--arbol-color-text-muted);font:500 calc(var(--arbol-type-label) * .88)/1.15 var(--arbol-font-mono)"
  >
    {#each tags as tag (`${tag.name}=${tag.value ?? ''}`)}
      <span style="display:inline-flex;max-width:220px;padding:2px 6px;border-radius:999px;background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border)" title={tag.value === undefined ? tag.name : `${tag.name}=${tag.value}`}>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{tag.name}{tag.value !== undefined ? `=${tag.value}` : ''}</span>
      </span>
    {/each}
  </div>
{/if}
