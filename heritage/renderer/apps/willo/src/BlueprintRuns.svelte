<script lang="ts">
  import type { BlueprintRun } from './api'
  let { runs, loading, onOpen }: { runs: BlueprintRun[]; loading: boolean; onOpen: (run: BlueprintRun) => void } = $props()

  const date = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Unknown time'
  const detail = (run: BlueprintRun) => run.kind === 'chain'
    ? `${run.completed_steps?.length || 0}/${run.total_steps || 0} Cells${run.run_key ? ` · ${run.run_key}` : ''}`
    : [run.recipe, run.model, run.num_turns != null ? `${run.num_turns} turns` : ''].filter(Boolean).join(' · ')
</script>

<section class="willo-runs">
  <header class="willo-runs-head">
    <div><h2>Blueprint Runs</h2><p>Blueprint and Blueprint Chain invocations, most recent first.</p></div>
    <span>{runs.length} runs</span>
  </header>
  {#if loading}<div class="willo-empty">Loading runs…</div>
  {:else if !runs.length}<div class="willo-empty">No Blueprint runs yet.</div>
  {:else}
    <div class="willo-run-list">
      {#each runs as run (run.kind + run.id)}
        <button class="willo-run-row" onclick={() => onOpen(run)}>
          <span class="willo-run-kind" data-kind={run.kind}>{run.kind === 'chain' ? 'Chain' : 'Blueprint'}</span>
          <span class="willo-run-main"><b>{run.name}</b><small>{detail(run) || run.id}</small></span>
          <span class="willo-run-status" data-status={run.status}>{run.status}</span>
          <time>{date(run.started_at)}</time><span aria-hidden="true">›</span>
        </button>
      {/each}
    </div>
  {/if}
</section>
