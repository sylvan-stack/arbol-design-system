<script lang="ts">
  import Button from '../components/Button.svelte';
  let { artworkOnly = false }: { artworkOnly?: boolean } = $props();
  let feedback = $state('');
</script>

<article class="panel stack">
  {#if !artworkOnly}<h2>The next Arbol starts with a shared language.</h2>
    <p class="muted">Warm surfaces, clear type and dependable controls.</p>{/if}<svg
    viewBox="0 0 800 260"
    role="img"
    aria-label="Abstract branching forms across a warm wood-toned landscape"
    style="width:100%;border-radius:12px;background:var(--canvas)"
    ><g fill="none" stroke="var(--accent)" stroke-width="2"
      ><path
        d="M400 260V70M400 190Q270 180 180 50M400 170Q550 120 630 25M400 220Q250 240 80 110M400 130Q340 100 320 30"
      /><circle cx="400" cy="130" r="88" opacity=".4" /><circle
        cx="400"
        cy="130"
        r="114"
        opacity=".2"
      /></g
    ></svg
  >
  <div class="row">
    <Button
      label="Use this direction"
      tone="primary"
      onclick={() => (feedback = 'Direction selected locally')}
    /><Button
      label="Discuss variation"
      onclick={() => (feedback = 'Variation discussion prepared locally')}
    />
  </div>
  <small role="status">{feedback}</small>
</article>
