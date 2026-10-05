<script lang="ts">
  import { EntityCard, InlineMarkdown, parseEntityUri } from '@arbol/design-system'

  export type AttachedContextItem = { id: string; content: string; removable?: boolean }

  let { items, onOpenLocalFile, onRemove, baseDir, compact = false }:
    {
      items: AttachedContextItem[]
      onOpenLocalFile?: (path: string) => void
      onRemove?: (id: string) => void
      baseDir?: string
      compact?: boolean
    } = $props()

  let expanded = $state(false)

  $effect(() => {
    items.map((item) => item.id).join(':')
    expanded = false
  })

  const preview = $derived.by(() => {
    const text = items[0]?.content ?? ''
    const entity = parseEntityUri(text.trim())
    if (entity.ok) return entity.value.title
    return text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/```[\s\S]*?```/g, 'Code and structured data')
      .replace(/[`*_>~-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  })
  const label = $derived(items.length === 1 ? 'Attached context' : `${items.length} context items attached`)

  function entityCardUri(content: string) {
    const parsed = parseEntityUri(content.trim())
    return parsed.ok ? parsed.value.uri : null
  }
</script>

{#if items.length > 0}
  <section
    aria-label="Attached context"
    style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
           background:color-mix(in oklch, var(--arbol-color-surface) 76%, var(--arbol-color-bg));overflow:hidden"
  >
    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center">
      <button
        type="button"
        onclick={() => (expanded = !expanded)}
        aria-expanded={expanded}
        style="all:unset;box-sizing:border-box;min-width:0;cursor:pointer;display:grid;
               grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:var(--arbol-space-2);
               padding:{compact ? '8px 10px' : '10px 12px'};color:var(--arbol-color-text)"
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--arbol-color-text-muted)">
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span style="min-width:0;display:flex;align-items:baseline;gap:var(--arbol-space-2)">
          <strong style="flex-shrink:0;font:600 var(--arbol-type-label)/1.2 var(--arbol-font-ui)">{label}</strong>
          {#if !expanded && preview}
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font:400 var(--arbol-type-label)/1.2 var(--arbol-font-ui)">{preview}</span>
          {/if}
        </span>
        <span aria-hidden="true" style="color:var(--arbol-color-text-muted);font:600 var(--arbol-type-label)/1 var(--arbol-font-ui)">{expanded ? '−' : '+'}</span>
      </button>
      {#if items.length === 1 && items[0].removable && onRemove}
        <button
          type="button"
          aria-label="Close Chat Note"
          title="Close Chat Note"
          onclick={() => onRemove?.(items[0].id)}
          style="all:unset;box-sizing:border-box;width:26px;height:26px;margin-right:8px;display:grid;place-items:center;
                 border-radius:var(--arbol-radius-s);color:var(--arbol-color-text-muted);cursor:pointer;font:500 18px/1 var(--arbol-font-ui)"
        >×</button>
      {/if}
    </div>

    {#if expanded}
      <div style="max-height:260px;overflow:auto;border-top:1px solid var(--arbol-color-border);padding:var(--arbol-space-3)">
        {#each items as item, index (item.id)}
          {@const cardUri = entityCardUri(item.content)}
          {#if index > 0}<div style="height:1px;background:var(--arbol-color-border);margin:var(--arbol-space-3) 0"></div>{/if}
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:var(--arbol-space-2)">
            <div style="min-width:0;color:var(--arbol-color-text);white-space:pre-wrap;overflow-wrap:anywhere;font:400 var(--arbol-type-body)/1.5 var(--arbol-font-ui)">
              {#if cardUri}
                <EntityCard uri={cardUri} />
              {:else}
                <InlineMarkdown text={item.content} {onOpenLocalFile} {baseDir} />
              {/if}
            </div>
            {#if items.length > 1 && item.removable && onRemove}
              <button
                type="button"
                aria-label="Close Chat Note"
                title="Close Chat Note"
                onclick={() => onRemove?.(item.id)}
                style="all:unset;box-sizing:border-box;width:24px;height:24px;display:grid;place-items:center;
                       border-radius:var(--arbol-radius-s);color:var(--arbol-color-text-muted);cursor:pointer;font:500 18px/1 var(--arbol-font-ui)"
              >×</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}
