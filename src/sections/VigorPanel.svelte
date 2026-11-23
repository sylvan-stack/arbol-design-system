<script lang="ts">
  import Button from '../components/Button.svelte';
  import Notice from '../patterns/Notice.svelte';
  import { vigorPriorityRows, type QuotaDashChoice, type QuotaDashChoices, type VigorPriorityView } from './seqoya-vigor-priority';

  let { view = {}, onRefresh }: { view?: VigorPriorityView; onRefresh?: () => void } = $props();
  let previewChoices = $state<QuotaDashChoices>({});
  let saveProblem = $state('');
  const rows = $derived(vigorPriorityRows(view, view.priority?.choices ?? previewChoices));
  const issues = $derived([...new Set([...Object.entries(view.rollup?.failures ?? {}).map(([source, reason]) =>
    source + ' · ' + reason), ...(view.accountIssues ?? [])])]);
  const score = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function mark(key: string, choice: QuotaDashChoice) {
    saveProblem = '';
    try {
      if (view.priority?.setChoice) view.priority.setChoice(key, choice);
      else previewChoices[key] = choice;
    } catch {
      saveProblem = 'Could not save the Quota Dash choice.';
    }
  }

  function money(amount: number, currency: string) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  }
</script>

<section class="stack" aria-label="Subscriptions Vigor">
  <div class="toolbar">
    <Button label="Refresh" busy={view.loading} disabled={!onRefresh} onclick={onRefresh}
      title="Reread subscription usage and account data" />
  </div>
  {#if view.loading}
    <Notice message={rows?.length ? 'Refreshing Vigor…' : 'Loading Vigor…'} />
  {/if}
  {#if view.error}<Notice role="alert" tone="warning" message={view.error} />{/if}
  {#if saveProblem}<Notice role="alert" tone="warning" message={saveProblem} />{/if}
  {#each issues as issue (issue)}
    <Notice tone="warning" message={issue} />
  {/each}

  {#if rows?.length}
    <div class="table-scroll">
      <table aria-label="Subscriptions ranked by Vigor">
        <thead>
          <tr>
            <th scope="col">Subscription</th>
            <th scope="col">Quota Dash</th>
            <th scope="col" class="numeric">Potential weekly loss</th>
            <th scope="col" class="numeric">User score</th>
            <th scope="col" class="numeric">Vigor</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.key)}
            {@const windowEnd = row.windowEnd}
            <tr>
              <th scope="row">{row.name}</th>
              <td>
                {#if windowEnd !== undefined}
                  <button type="button" class:marked={row.dash} aria-pressed={row.dash}
                    aria-label={`Quota Dash for ${row.name}`}
                    title={row.reason ?? 'Mark the current weekly window as Quota Dash'}
                    onclick={() => mark(row.key, { windowEnd, marked: !row.dash })}>
                    {row.dash ? 'On' : 'Off'}
                  </button>
                {:else}
                  <span class="muted" title="Active weekly allowance unavailable">—</span>
                {/if}
              </td>
              <td class="numeric">
                {#if row.loss}
                  <span title={`Estimated from remaining weekly equivalents. ${row.loss.basis}`}>
                    ≈{money(row.loss.amount, row.loss.currency)}
                  </span>
                {:else}
                  <span class="muted" title="Weekly allowance or reference cost unavailable">—</span>
                {/if}
              </td>
              <td class="numeric">{row.userScore === undefined ? '—' : score.format(row.userScore)}</td>
              <td class="numeric vigor">{row.score === undefined ? '—' : score.format(row.score)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !view.loading && !view.error}
    <p class="muted">No subscriptions to rank.</p>
  {/if}
</section>

<style>
  .toolbar { display: flex; justify-content: flex-end; }
  .table-scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: var(--space-3) var(--space-4); text-align: start; }
  thead th { color: var(--muted); font-size: .85em; }
  tbody th { font-weight: 650; }
  tbody tr { border-top: 1px solid var(--border); }
  .numeric { text-align: end; font-variant-numeric: tabular-nums; }
  .vigor { font-weight: 750; }
  td button {
    min-width: 3em;
    min-height: 28px;
    padding: 2px var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  td button:hover { border-color: var(--muted); }
  td button.marked { background: var(--selected); border-color: var(--accent); color: var(--text); font-weight: 700; }
</style>
