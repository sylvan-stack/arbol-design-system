<script lang="ts">
  let {
    image = 'legacy-gallery-redwood',
    title = 'Legacy shared gallery',
  }: { image?: string; title?: string } = $props();
</script>

<div class="demo-frame stack">
  <p class="eyebrow">Captured legacy evidence / 5 October 2026</p>
  <h1>{title}</h1>
  <p class="muted">
    Preserved screenshot of source UI with fictional data. This is reference evidence, not an
    interactive successor component.
  </p>
  <img src={'/design-system/assets/' + image + '.png'} alt={title} /><a
    href="/design-system/assets/README.md"
    target="_blank"
    rel="noreferrer">Capture provenance ↗</a
  >
</div>

<style>
  img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
  }
</style>
