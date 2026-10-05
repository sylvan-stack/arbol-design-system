<script lang="ts">
  /* Arbol's answer mark: a small, original "voice blossom". Three thought nodes
   * grow through a shared stem into an open speech-crown; the tapered lower stroke
   * is both a leaf stem and a speech-bubble tail. Used without visible copy at the
   * activity → answer boundary and in the jump-to-answer affordance. */
  let { size = 34 }: { size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 48 48"
  fill="none"
  aria-hidden="true"
  class="answer-mark"
>
  <path
    class="crown"
    d="M11.5 24.1C11.5 15.7 17 10.2 24.1 10.2c7.4 0 12.4 5.2 12.4 12.2 0 6.8-4.7 11.1-11.8 11.1h-3.2l-6.7 4 2-6.3c-3.4-1.7-5.3-4.1-5.3-7.1Z"
  />
  <path class="branch" d="M24 29.6V21m0 1-6-5.2m6 5.2 6.2-5.2M24 21v-6.1" />
  <circle class="node node-a" cx="17.8" cy="16.6" r="2.15" />
  <circle class="node node-b" cx="24" cy="14.2" r="2.15" />
  <circle class="node node-c" cx="30.3" cy="16.6" r="2.15" />
  <path class="voice" d="M20.2 27.8c2.5 1.6 5.1 1.6 7.7 0" />
</svg>

<style>
  .answer-mark {
    display: block;
    overflow: visible;
  }

  .crown {
    fill: color-mix(in srgb, var(--arbol-color-accent) 12%, var(--arbol-color-surface));
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .branch,
  .voice {
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .node {
    fill: var(--arbol-color-bg);
    stroke: currentColor;
    stroke-width: 1.55;
  }

  .node-b {
    fill: color-mix(in srgb, var(--arbol-color-accent) 26%, var(--arbol-color-bg));
  }
</style>
