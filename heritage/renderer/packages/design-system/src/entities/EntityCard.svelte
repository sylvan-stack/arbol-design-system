<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import MarkdownBlocks from '../markdown/MarkdownBlocks.svelte'
  import { parseMarkdown } from '../markdown/blocks'
  import { parseEntityUri, type EntityUri } from './entityUri'
  import type { EntityCardContentFormat, EntityCardResolver } from './card'
  import { entityLinkTarget } from './linkTarget'



  let {
    uri,
    content,
    contentFormat = 'markdown',
    resolve,
    initiallyExpanded = false,
  }: {
    uri: EntityUri | string
    content?: string
    contentFormat?: EntityCardContentFormat
    resolve?: EntityCardResolver
    initiallyExpanded?: boolean
  } = $props()

  const parsed = $derived(parseEntityUri(uri))
  const title = $derived(parsed.ok ? parsed.value.title : 'Invalid entity reference')
  const renderedBlocks = $derived(contentFormat === 'markdown' && resolvedContent != null ? parseMarkdown(resolvedContent) : [])
  let expanded = $state(untrack(() => initiallyExpanded))
  let resolvedContent = $state<string | undefined>(undefined)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let resolvedUri = $state<string | null>(null)
  let controller: AbortController | null = null

  $effect(() => {
    if (content !== undefined) {
      controller?.abort()
      resolvedContent = content
      resolvedUri = uri
      loading = false
      error = null
    } else if (resolvedUri !== uri) {
      controller?.abort()
      resolvedContent = undefined
      resolvedUri = null
      loading = false
      error = null
    }
  })

  async function load() {
    if (!parsed.ok || !resolve || loading || resolvedUri === uri) return
    controller?.abort()
    const active = new AbortController()
    controller = active
    loading = true
    error = null
    try {
      const next = await resolve(parsed.value, { signal: active.signal })
      if (!active.signal.aborted) {
        resolvedContent = next
        resolvedUri = uri
      }
    } catch (cause) {
      if (!active.signal.aborted) error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (!active.signal.aborted) loading = false
    }
  }

  function toggle() {
    expanded = !expanded
    if (expanded && resolvedContent === undefined) void load()
  }

  $effect(() => {
    if (expanded && content === undefined && resolvedContent === undefined && parsed.ok && resolve) void load()
  })

  function retry() {
    resolvedUri = null
    void load()
  }

  onDestroy(() => controller?.abort())
</script>

<article class="entity-card" class:entity-card-invalid={!parsed.ok} use:entityLinkTarget={parsed.ok ? parsed.value.uri : null}>
  <div class="entity-card-title">{title}</div>
  {#if parsed.ok && (content !== undefined || resolve)}
    <button class="entity-card-toggle" type="button" aria-expanded={expanded} onclick={toggle}>
      {expanded ? 'See less' : 'See more'}
    </button>
  {/if}
  {#if expanded}
    <div class="entity-card-content" aria-live="polite">
      {#if loading}
        <span class="entity-card-status">Loading…</span>
      {:else if error}
        <div class="entity-card-error" role="alert">{error}</div>
        <button class="entity-card-retry" type="button" onclick={retry}>Retry</button>
      {:else if resolvedContent === ''}
        <span class="entity-card-status">No additional information</span>
      {:else if resolvedContent !== undefined}
        {#if contentFormat === 'markdown'}
          <MarkdownBlocks blocks={renderedBlocks} compact />
        {:else}
          <pre>{resolvedContent}</pre>
        {/if}
      {/if}
    </div>
  {/if}
</article>

<style>
  .entity-card {
    display: block;
    min-width: 0;
    padding: var(--arbol-space-3);
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-surface);
    box-shadow: var(--arbol-shadow-1);
  }
  .entity-card-invalid { border-style: dashed; }
  .entity-card-title {
    color: var(--arbol-color-text);
    font: 650 calc(13px * var(--arbol-font-scale))/1.35 var(--arbol-font-ui);
    overflow-wrap: anywhere;
  }
  .entity-card-toggle, .entity-card-retry {
    margin-top: var(--arbol-space-2);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--arbol-color-link);
    font: 600 var(--arbol-type-label)/1.4 var(--arbol-font-ui);
    cursor: pointer;
  }
  .entity-card-toggle:focus-visible, .entity-card-retry:focus-visible {
    outline: 2px solid var(--arbol-color-accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .entity-card-content {
    margin-top: var(--arbol-space-3);
    padding-top: var(--arbol-space-3);
    border-top: 1px solid var(--arbol-color-hairline);
    color: var(--arbol-color-text);
    overflow-wrap: anywhere;
  }
  .entity-card-content pre {
    margin: 0;
    white-space: pre-wrap;
    font: 500 var(--arbol-type-body)/1.5 var(--arbol-font-mono);
  }
  .entity-card-status { color: var(--arbol-color-text-muted); }
  .entity-card-error { color: var(--arbol-color-err); }
</style>
