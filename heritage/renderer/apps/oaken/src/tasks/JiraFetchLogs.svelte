<script lang="ts">
  import { callNative } from '@arbol/design-system'
  import { clearJiraFetchLogs, formatMadridDateTime, type JiraPipelineLog } from './jira'

  let { logs, active = false, onClear }: { logs: JiraPipelineLog[]; active?: boolean; onClear: () => void } = $props()
  let expanded = $state(false)
  let revealError = $state('')

  function clear() {
    clearJiraFetchLogs()
    revealError = ''
    onClear()
  }

  async function reveal(filePath: string) {
    revealError = ''
    try {
      const result = await callNative('file.reveal', { path: filePath }) as { ok?: boolean; error?: string } | undefined
      if (result?.ok === false) revealError = result.error || 'Could not reveal the raw Jira mirror'
    } catch (error) {
      revealError = error instanceof Error ? error.message : String(error)
    }
  }
</script>

<section class="jira-fetch-logs" class:active aria-label="Jira fetch and parser logs">
  <header>
    <button class="jira-fetch-logs-toggle" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>
      <strong>Fetch & parser logs</strong>
      <small>{active ? 'Pipeline running…' : logs.length ? `${logs.length} entries in memory` : 'No activity yet'}</small>
    </button>
    {#if logs.length}<button class="jira-fetch-logs-clear" onclick={clear}>Clear</button>{/if}
  </header>
  {#if expanded}
    <div class="jira-fetch-log-body">
      {#if revealError}<p class="jira-fetch-log-error" role="alert">{revealError}</p>{/if}
      {#if logs.length === 0}
        <p>Fetch a ticket to inspect classification, network retrieval, mirror persistence, normalization, and repository detection.</p>
      {:else}
        <ol>
          {#each logs as entry}
            <li class:warning={entry.level === 'warning'} class:error={entry.level === 'error'}>
              <time datetime={entry.at}>{formatMadridDateTime(entry.at)}</time>
              <b>{entry.stage}</b>
              {#if entry.filePath}
                <button class="jira-fetch-log-link" title={`Reveal ${entry.filePath} in Finder`} onclick={() => reveal(entry.filePath!)}>{entry.message}</button>
              {:else}
                <span>{entry.message}</span>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>
