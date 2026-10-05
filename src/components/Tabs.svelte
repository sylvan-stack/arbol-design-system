<script lang="ts">
  let {
    label = 'View',
    items = ['Overview', 'Activity', 'Settings'],
    value = $bindable('Overview'),
  }: { label?: string; items?: string[]; value?: string } = $props();
  function move(event: KeyboardEvent, i: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (i + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    value = items[next];
    ((event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement)?.focus();
  }
</script>

<div class="tabs" role="group" aria-label={label}>
  {#each items as item, i}<button
      aria-pressed={item === value}
      tabindex={item === value ? 0 : -1}
      onclick={() => (value = item)}
      onkeydown={(e) => move(e, i)}>{item}</button
    >{/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  button {
    min-height: var(--control-height);
    padding: 7px 12px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    border-radius: 9px;
  }
  button[aria-pressed='true'] {
    background: var(--selected);
    border-color: var(--border);
    color: var(--text);
    font-weight: 600;
  }
</style>
