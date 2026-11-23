<script lang="ts">
  import { untrack } from 'svelte';

  let {
    ongoing = false,
    busy = false,
    working = false,
    inputTokens = 0,
    outputTokens = 0,
    ontoggle,
  }: {
    ongoing?: boolean;
    busy?: boolean;
    working?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    ontoggle?: () => void;
  } = $props();

  const compact = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumSignificantDigits: 3,
  });
  const exact = new Intl.NumberFormat();
  const sampleInterval = 1000;
  let inputRate = $state(0);
  let outputRate = $state(0);
  const total = $derived(inputTokens + outputTokens);

  $effect(() => {
    inputRate = 0;
    outputRate = 0;
    if (!working) return;

    let previousInput = untrack(() => inputTokens);
    let previousOutput = untrack(() => outputTokens);
    let sampledAt = performance.now();

    // The counters arrive in batches. Measure observed growth over real elapsed time.
    const timer = setInterval(() => {
      const now = performance.now();
      const seconds = (now - sampledAt) / 1000;
      inputRate = Math.max(0, Math.round((inputTokens - previousInput) / seconds));
      outputRate = Math.max(0, Math.round((outputTokens - previousOutput) / seconds));
      previousInput = inputTokens;
      previousOutput = outputTokens;
      sampledAt = now;
    }, sampleInterval);
    return () => clearInterval(timer);
  });
</script>

{#snippet count(value: number)}
  <span class="count" title={exact.format(value)}>
    <span aria-hidden="true">{compact.format(value)}</span>
    <span class="sr-only">{exact.format(value)}</span>
  </span>
{/snippet}

{#snippet rate(value: number)}
  {#if working && value > 0}
    <span class="rate" title="Estimated tokens per second">
      <span aria-hidden="true">≈{compact.format(value)}/s</span>
      <span class="sr-only">About {exact.format(value)} tokens per second</span>
    </span>
  {/if}
{/snippet}

<section class="cockpit" aria-label="Meta Cockpit">
  <div class="controls">
    <button
      class="ongoing"
      type="button"
      aria-pressed={ongoing}
      aria-keyshortcuts={ontoggle ? 'Alt+0' : undefined}
      title={ontoggle ? 'Toggle ongoing (⌥0)' : undefined}
      disabled={busy || !ontoggle}
      onclick={ontoggle}
    >
      <span class="mark" aria-hidden="true"></span>
      {ongoing ? 'Ongoing' : 'Not ongoing'}
    </button>
  </div>
  {#if working || total > 0}
    <dl class="usage" aria-label="Token usage">
      <div class="metric total">
        <dt>Total tokens</dt>
        <dd>{@render count(total)}</dd>
      </div>
      <div class="metric">
        <dt>Input</dt>
        <dd>{@render count(inputTokens)}{@render rate(inputRate)}</dd>
      </div>
      <div class="metric">
        <dt>Output</dt>
        <dd>{@render count(outputTokens)}{@render rate(outputRate)}</dd>
      </div>
    </dl>
  {/if}
</section>

<style>
  .cockpit {
    flex-shrink: 0;
    min-width: 0;
    margin-block: var(--space-2) var(--space-1);
    border: 1px solid var(--border);
    border-inline-start: 3px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--inset);
    color: var(--text);
  }
  .controls {
    padding: var(--space-2) var(--space-3);
  }
  .ongoing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    min-height: 28px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--panel);
    color: var(--muted);
    font: 700 calc(12px * var(--font-scale))/1.25 var(--font-ui);
    text-align: start;
    overflow-wrap: anywhere;
  }
  .ongoing[aria-pressed='true'] {
    background: var(--selected);
    color: var(--link);
  }
  .ongoing:hover:enabled {
    border-color: var(--focus);
  }
  .ongoing:disabled {
    color: var(--disabled);
  }
  .mark {
    width: 0.6em;
    height: 0.6em;
    flex: none;
    border: 1px solid currentColor;
    border-radius: 50%;
  }
  .ongoing[aria-pressed='true'] .mark {
    background: currentColor;
  }
  .usage {
    margin: 0;
    font-size: calc(12px * var(--font-scale));
    line-height: 1.25;
  }
  .metric {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
  }
  .metric dt {
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .metric dd {
    display: grid;
    justify-items: end;
    gap: 2px;
    margin: 0;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    text-align: end;
    overflow-wrap: anywhere;
  }
  .total {
    background: linear-gradient(90deg, var(--selected), transparent);
    font-weight: 700;
  }
  .total dt,
  .total dd {
    color: var(--link);
  }
  .total .count {
    font-size: 1.2em;
  }
  .rate {
    color: var(--muted);
    font-size: 0.9em;
  }
</style>
