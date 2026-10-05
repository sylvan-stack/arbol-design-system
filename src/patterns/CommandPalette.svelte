<script lang="ts">
  import TextField from '../components/TextField.svelte';
  import KbdHint from '../components/KbdHint.svelte';
  let {
    commands = [
      'Seqoya · Dashboard',
      'Seqoya · Organizations',
      'Seqoya · Repos',
      'Elma · New chat',
      'Willo · Stations',
      'Willo · Telegram',
      'Oaken · Swimlanes',
      'Oaken · Grafts',
    ],
    title = 'Go to page',
  }: { commands?: string[]; title?: string } = $props();
  let query = $state('');
  let selected = $state('');
  let index = $state(0);
  let visible = $derived(commands.filter((x) => x.toLowerCase().includes(query.toLowerCase())));
  function handleKeys(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = (index + 1) % Math.max(visible.length, 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index - 1 + visible.length) % Math.max(visible.length, 1);
    }
    if (e.key === 'Enter' && visible[index]) selected = visible[index];
  }
</script>

<section class="panel stack" aria-label={title}>
  <h2>{title}</h2>
  <div>
    <TextField
      onkeydown={handleKeys}
      label="Search destinations"
      bind:value={query}
      type="search"
    />
  </div>
  <p class="eyebrow">{query ? 'Results' : 'Recent & suggested'}</p>
  <div class="stack" style="gap:4px">
    {#each visible as command, i}<button
        class:active={i === index}
        onclick={() => (selected = command)}><span>{command}</span><kbd>{i + 1}</kbd></button
      >{:else}<p class="muted">No matching commands.</p>{/each}
  </div>
  <KbdHint keys={['↑', '↓', '↵']} label="Choose destination" />{#if selected}<p
      class="notice"
      role="status"
    >
      Selected {selected}
    </p>{/if}
</section>

<style>
  button {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    text-align: left;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--text);
  }
  button.active {
    background: var(--selected);
    border-color: var(--border);
  }
  kbd {
    color: var(--muted);
  }
</style>
