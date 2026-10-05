<script lang="ts">
  import type { EntityKind } from './data'

  let { kind, size = 14 }: { kind: EntityKind; size?: number } = $props()
</script>

<svg
  class="entity-chip-glyph"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  {#if kind === 'ticket'}
    <path d="M3 3.25h10v3a1.75 1.75 0 0 0 0 3.5v3H3v-3a1.75 1.75 0 0 0 0-3.5v-3Z" />
    <path d="M8 4.5v7" stroke-dasharray="1 1.6" />
  {:else if kind === 'graft'}
    <path d="M4 3.25v3.1A2.65 2.65 0 0 0 6.65 9H12" />
    <path d="m9.75 6.75 2.5 2.25-2.5 2.25M4 9v3.75" />
  {:else if kind === 'mr'}
    <circle cx="4" cy="3.25" r="1.35" /><circle cx="4" cy="12.75" r="1.35" /><circle cx="12" cy="12.75" r="1.35" />
    <path d="M4 4.6v6.8M7 4h2.25A2.75 2.75 0 0 1 12 6.75v4.65M7 4l1.7-1.7M7 4l1.7 1.7" />
  {:else if kind === 'commit'}
    <path d="M1.75 8h3.4M10.85 8h3.4" /><circle cx="8" cy="8" r="2.85" /><circle cx="8" cy="8" r=".65" fill="currentColor" stroke="none" />
  {:else if kind === 'slack'}
    <path d="M5.5 2.25v7.5M10.5 6.25v7.5M2.25 5.5h7.5M6.25 10.5h7.5" />
  {:else if kind === 'email'}
    <rect x="2" y="3.25" width="12" height="9.5" rx="1.5" /><path d="m3 4.5 5 4 5-4" />
  {:else if kind === 'chat'}
    <path d="M2.25 3.25h11.5v8H7l-3.25 2v-2h-1.5v-8Z" /><path d="M5 6h6M5 8.5h4" />
  {:else if kind === 'artifact'}
    <path d="M3 2.25h7l3 3v8.5H3V2.25Z" /><path d="M10 2.5v3h3M5.25 8h5.5M5.25 10.5h5.5" />
  {:else if kind === 'requirement'}
    <path d="M5.25 2.25h5.5v3.2c0 1.15-.8 2.1-1.9 2.35 1.1.25 1.9 1.2 1.9 2.35v3.6h-5.5" /><path d="M4 5.5h5M4 10h5" />
  {:else if kind === 'invariant'}
    <path d="m8 1.75 5.5 3.15v6.2L8 14.25 2.5 11.1V4.9L8 1.75Z" /><path d="m5.3 8 1.7 1.7 3.8-4" />
  {:else if kind === 'glossary'}
    <path d="M2.5 3.25A2.75 2.75 0 0 1 5.25 6v6.75A2.75 2.75 0 0 0 2.5 10V3.25ZM13.5 3.25A2.75 2.75 0 0 0 10.75 6v6.75A2.75 2.75 0 0 1 13.5 10V3.25Z" /><path d="M5.25 6h5.5" />
  {:else if kind === 'secret'}
    <circle cx="6" cy="7" r="3" /><path d="m8.4 8.8 4.1 4.1M10.25 10.65l1.3-1.3M11.5 11.9l1.3-1.3" />
  {:else if kind === 'flyer'}
    <path d="M2 8.25 14 2.5 9.25 13.5 7 9.25 2 8.25Z" /><path d="m7 9.25 7-6.75" />
  {:else if kind === 'branch'}
    <circle cx="4" cy="3" r="1.25" /><circle cx="4" cy="13" r="1.25" /><circle cx="12" cy="5" r="1.25" />
    <path d="M4 4.25v7.5M5.25 9.5h1.5A5.25 5.25 0 0 0 12 4.25" />
  {:else if kind === 'living_topic'}
    <circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" />
    <path d="M8 2.5v-1M13.5 8h1M8 13.5v1M2.5 8h-1" />
  {:else if kind === 'mandate'}
    <path d="M3 2.25h10v11.5H3zM5.25 5h5.5M5.25 7.5h3" />
    <circle cx="10.25" cy="10.25" r="1.75" /><path d="m9.45 10.2.55.55 1.1-1.15" />
  {:else if kind === 'prompt'}
    <path d="M2.5 3.25h11v7.5h-6L4 13v-2.25H2.5z" /><path d="m6 5.5 2.5 1.5L6 8.5" />
  {:else if kind === 'response'}
    <path d="M13.5 3.25h-11v7.5h6L12 13v-2.25h1.5z" /><path d="M5 5.5h6M5 8h4" />
  {/if}
</svg>

<style>
  .entity-chip-glyph { display: block; overflow: visible; }
  path, rect, circle {
    stroke: currentColor;
    stroke-width: 1.35;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
</style>
