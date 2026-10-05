<script lang="ts">
  import { MarkdownBlocks, parseMarkdown } from '@arbol/design-system'
  import type { BlueprintRunDetails } from './api'
  import { paginateRunEvents } from './runPagination'
  let { details, loading, onBack }: { details: BlueprintRunDetails | null; loading: boolean; onBack: () => void } = $props()
  let page = $state(0)
  const pages = $derived(paginateRunEvents(details?.events || [], 120))
  $effect(() => { if (page >= pages.length) page = Math.max(0, pages.length - 1) })
  const when = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
</script>

<section class="willo-run-details">
  <header class="willo-details-head">
    <button class="willo-back" onclick={onBack}>← Blueprint Runs</button>
    {#if details}<div><span>{details.run.kind === 'chain' ? 'Blueprint Chain' : 'Blueprint'} · {details.run.status}</span><h2>Run Details</h2><p>{details.run.name} · {when(details.run.started_at)}</p></div>{/if}
  </header>
  {#if loading}<div class="willo-empty">Loading conversation…</div>
  {:else if !details}<div class="willo-empty">This run could not be loaded.</div>
  {:else if !details.events.length}<div class="willo-empty">This run has no recorded conversation yet.</div>
  {:else}
    <div class="willo-transcript">
      {#each pages[page] || [] as event (event.id)}
        <article class="willo-message" data-role={event.role}>
          <div class="willo-message-meta">
            <b>{event.role === 'assistant' ? 'Agent' : event.role === 'user' ? 'User' : event.kind.replace('_', ' ')}</b>
            {#if event.cell != null}<span>Cell {event.cell}</span>{/if}
            {#if event.ts}<time>{when(event.ts)}</time>{/if}
          </div>
          <div class="willo-message-body"><MarkdownBlocks blocks={parseMarkdown(event.text)} /></div>
        </article>
      {/each}
    </div>
    {#if pages.length > 1}
      <nav class="willo-run-pages" aria-label="Conversation pages">
        <button disabled={page === 0} onclick={() => page--}>Previous</button>
        <span>Page {page + 1} of {pages.length}</span>
        <button disabled={page + 1 === pages.length} onclick={() => page++}>Next</button>
      </nav>
    {/if}
  {/if}
</section>
