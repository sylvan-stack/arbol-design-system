<script lang="ts">
  /** Original icon studies for the activity → final-answer transition. These are
   * deliberately geometric rather than borrowed pictograms or emoji. */
  export type FinalAnswerProposal = 'voice-blossom' | 'threshold' | 'signal-seed' | 'focus-orbit' | 'unfolding'

  let {
    variant = 'voice-blossom',
    size = 48,
  }: {
    variant?: FinalAnswerProposal
    size?: number
  } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 48 48"
  fill="none"
  aria-hidden="true"
  class="proposal-icon"
>
  {#if variant === 'voice-blossom'}
    <path class="wash outline" d="M11.5 24.1C11.5 15.7 17 10.2 24.1 10.2c7.4 0 12.4 5.2 12.4 12.2 0 6.8-4.7 11.1-11.8 11.1h-3.2l-6.7 4 2-6.3c-3.4-1.7-5.3-4.1-5.3-7.1Z" />
    <path class="stroke" d="M24 29.6V21m0 1-6-5.2m6 5.2 6.2-5.2M24 21v-6.1M20.2 27.8c2.5 1.6 5.1 1.6 7.7 0" />
    <circle class="node" cx="17.8" cy="16.6" r="2.15" />
    <circle class="node node--accent" cx="24" cy="14.2" r="2.15" />
    <circle class="node" cx="30.3" cy="16.6" r="2.15" />
  {:else if variant === 'threshold'}
    <path class="wash outline" d="M10.5 34.5V13.2c0-2 1.7-3.7 3.7-3.7h19.6c2 0 3.7 1.7 3.7 3.7v21.3" />
    <path class="stroke" d="M7.5 35.5h33M17 35.2V17.8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v17.4" />
    <path class="beam" d="M24 19.5v11M20 23.5l4-4 4 4" />
    <circle class="solid" cx="24" cy="35.5" r="2.2" />
  {:else if variant === 'signal-seed'}
    <path class="stroke" d="M24 36V24m0 3-6.5-5.4M24 27l6.5-5.4" />
    <path class="wash outline" d="M24 10.5c7.5 0 13.5 6 13.5 13.5S31.5 37.5 24 37.5 10.5 31.5 10.5 24 16.5 10.5 24 10.5Z" />
    <path class="stroke faint" d="M24 6.5c9.7 0 17.5 7.8 17.5 17.5S33.7 41.5 24 41.5 6.5 33.7 6.5 24 14.3 6.5 24 6.5Z" />
    <circle class="solid" cx="17.4" cy="21.2" r="2.1" />
    <circle class="solid" cx="30.6" cy="21.2" r="2.1" />
    <circle class="node node--accent" cx="24" cy="34.9" r="2.3" />
  {:else if variant === 'focus-orbit'}
    <path class="stroke" d="M8.5 24c4.2-7.5 9.3-11.2 15.5-11.2S35.3 16.5 39.5 24C35.3 31.5 30.2 35.2 24 35.2S12.7 31.5 8.5 24Z" />
    <ellipse class="wash outline" cx="24" cy="24" rx="7.3" ry="11.8" transform="rotate(45 24 24)" />
    <ellipse class="stroke faint" cx="24" cy="24" rx="7.3" ry="11.8" transform="rotate(-45 24 24)" />
    <circle class="solid" cx="24" cy="24" r="3.1" />
  {:else}
    <path class="wash outline" d="M8.5 16.5 24 9l15.5 7.5L24 24 8.5 16.5Z" />
    <path class="stroke" d="m8.5 23.8 15.5 7.5 15.5-7.5M8.5 31.1 24 38.6l15.5-7.5M24 24v14.6" />
    <path class="beam" d="M24 9v9.5m-3.5-3L24 19l3.5-3.5" />
    <circle class="solid" cx="24" cy="9" r="2.1" />
  {/if}
</svg>

<style>
  .proposal-icon { display: block; overflow: visible; }
  .stroke, .outline, .beam {
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .wash { fill: color-mix(in srgb, var(--arbol-color-accent) 12%, var(--arbol-color-surface)); }
  .stroke { fill: none; }
  .faint { opacity: .38; stroke-width: 1.25; }
  .beam { fill: none; stroke-width: 1.45; }
  .node {
    fill: var(--arbol-color-bg);
    stroke: currentColor;
    stroke-width: 1.55;
  }
  .node--accent { fill: color-mix(in srgb, var(--arbol-color-accent) 28%, var(--arbol-color-bg)); }
  .solid { fill: currentColor; }
</style>
