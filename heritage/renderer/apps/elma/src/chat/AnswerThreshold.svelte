<script lang="ts">
  import FinalAnswerArtwork from './FinalAnswerArtwork.svelte'
</script>

<div
  class="answer-threshold"
  data-answer-threshold
  role="separator"
  aria-label="Final answer starts here"
>
  <FinalAnswerArtwork variant="first-light" />
</div>

<style>
  .answer-threshold {
    height: clamp(76px, 14vw, 112px);
    margin: var(--arbol-space-6) 0 var(--arbol-space-5);
    color: var(--arbol-color-accent);
    scroll-margin-top: var(--arbol-space-5);
    filter: drop-shadow(0 8px 18px color-mix(in srgb, var(--arbol-color-accent) 10%, transparent));
  }
</style>
