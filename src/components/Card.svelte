<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title = 'Design system',
    description = 'A shared language for the next Arbol.',
    children,
  }: { title?: string; description?: string; children?: Snippet } = $props();
</script>

<article class="panel stack">
  <h3>{title}</h3>
  {#if description}<p class="muted">{description}</p>{/if}{#if children}{@render children()}{/if}
</article>
