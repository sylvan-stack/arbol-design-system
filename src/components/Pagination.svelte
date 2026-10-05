<script lang="ts">
  import Button from './Button.svelte';
  let {
    page = $bindable(1),
    pages = 3,
    total = 54,
  }: { page?: number; pages?: number; total?: number } = $props();
</script>

<nav class="row spread" aria-label="Pagination">
  <span class="small muted" aria-live="polite">Page {page} of {pages} · {total} items</span>
  <div class="row">
    <Button label="Previous" disabled={page <= 1} onclick={() => page--} /><Button
      label="Next"
      disabled={page >= pages}
      onclick={() => page++}
    />
  </div>
</nav>
