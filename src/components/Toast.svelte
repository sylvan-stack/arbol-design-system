<script lang="ts">
  import IconButton from './IconButton.svelte';
  let {
    message = 'Reference copied',
    onclose = () => {},
  }: { message?: string; onclose?: () => void } = $props();
  let visible = $state(true);
</script>

{#if visible}<div class="toast row" role="status">
    <span>✓ {message}</span><IconButton
      label="Dismiss notification"
      icon="×"
      onclick={() => {
        visible = false;
        onclose();
      }}
    />
  </div>{/if}

<style>
  .toast {
    display: inline-flex;
    justify-content: space-between;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--panel);
    box-shadow: var(--shadow);
    min-width: 280px;
    max-width: 100%;
  }
</style>
