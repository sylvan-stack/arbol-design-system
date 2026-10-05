<script lang="ts">
  import type { SessionFailureCue } from './helpers'

  let { cue, title, compact = false }: {
    cue: SessionFailureCue
    title: string
    compact?: boolean
  } = $props()
</script>

<span
  class="failure-cue"
  class:compact
  data-kind={cue.kind}
  title={title}
  aria-label={title}
>
  {#if cue.icon === 'server'}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="4.5" rx="1.25"></rect>
      <rect x="2.25" y="9.25" width="11.5" height="4.5" rx="1.25"></rect>
      <circle cx="5" cy="4.5" r=".75" class="filled"></circle>
      <circle cx="5" cy="11.5" r=".75" class="filled"></circle>
      <path d="M8 4.5h3.25M8 11.5h3.25"></path>
    </svg>
  {:else if cue.icon === 'user'}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.25" r="2.5"></circle>
      <path d="M3.25 13.5c.35-2.55 2.05-4 4.75-4s4.4 1.45 4.75 4"></path>
    </svg>
  {:else if cue.icon === 'arrow-down'}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.25v10.5M4.25 9.25 8 13l3.75-3.75"></path>
    </svg>
  {:else}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75"></circle>
      <path d="M6.5 6.15A1.65 1.65 0 0 1 8.15 4.7c1.05 0 1.85.65 1.85 1.6 0 1.55-2 1.55-2 3M8 12.25h.01"></path>
    </svg>
  {/if}
</span>

<style>
  .failure-cue {
    --cue-color: var(--arbol-color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in oklch, var(--cue-color) 48%, var(--arbol-color-border));
    border-radius: 7px;
    color: var(--cue-color);
    background: color-mix(in oklch, var(--cue-color) 13%, var(--arbol-color-surface));
    box-shadow: 0 0 0 2px color-mix(in oklch, var(--cue-color) 9%, transparent);
  }
  .failure-cue.compact { width: 18px; height: 18px; border-radius: 6px; }
  .failure-cue[data-kind='overload'] { --cue-color: #f59e0b; }
  .failure-cue[data-kind='authentication'] { --cue-color: #8b949e; }
  .failure-cue[data-kind='rate_limit'] { --cue-color: #ec4899; }
  svg { width: 15px; height: 15px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .compact svg { width: 13px; height: 13px; }
  .filled { fill: currentColor; stroke: none; }
</style>
