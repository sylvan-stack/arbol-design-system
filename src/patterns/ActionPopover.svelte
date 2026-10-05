<script lang="ts">
  let {
    label = 'More actions',
    actions = ['Open', 'Copy reference', 'Link entity', 'Edit', 'Archive'],
    onaction = () => {},
  }: { label?: string; actions?: string[]; onaction?: (action: string) => void } = $props();
  const id = $props.id();
  let popover: HTMLDivElement;
  let result = $state('');
  function position(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    popover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + 'px';
    popover.style.top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 260)) + 'px';
  }
</script>

<div class="stack">
  <div><button class="trigger" popovertarget={id} onclick={position}>{label} ▾</button></div>
  <div {id} popover="auto" bind:this={popover} class="menu" role="group" aria-label={label}>
    {#each actions as action}<button
        onclick={() => {
          result = action + ' selected';
          onaction(action);
          popover.hidePopover();
        }}>{action}</button
      >{/each}
  </div>
  {#if result}<small role="status">{result}</small>{/if}
</div>

<style>
  .trigger {
    min-height: 36px;
    padding: 8px 12px;
    background: var(--inset);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 9px;
  }
  .menu {
    position: fixed;
    margin: 0;
    width: 224px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 9px;
    box-shadow: var(--shadow);
    background: var(--panel);
    color: var(--text);
  }
  .menu button {
    display: block;
    width: 100%;
    min-height: 36px;
    padding: 8px 12px;
    text-align: left;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text);
  }
  .menu button:hover {
    background: var(--selected);
  }
</style>
