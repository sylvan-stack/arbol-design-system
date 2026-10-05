<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from '../components/IconButton.svelte';
  let {
    title = 'Item details',
    subtitle = 'Design system · Artifact',
    children,
    onclose,
  }: { title?: string; subtitle?: string; children?: Snippet; onclose?: () => void } = $props();
</script>

<aside class="panel stack" aria-label={title}>
  <div class="row spread">
    <h2>{title}</h2>
    <IconButton label="Close details" icon="×" onclick={onclose} />
  </div>
  <p class="small muted">{subtitle}</p>
  {#if children}{@render children()}{:else}<p>
      A focused inspector preserves the current collection and selection.
    </p>{/if}
</aside>
