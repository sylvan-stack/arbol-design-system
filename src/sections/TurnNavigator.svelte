<script lang="ts">
  import Button from '../components/Button.svelte';
  import Select from '../components/Select.svelte';
  let turn = $state(3);
  let branch = $state('Main branch');
</script>

<nav class="row spread" aria-label="Conversation navigation">
  <div class="row">
    <Button label="← Previous turn" disabled={turn <= 1} onclick={() => turn--} /><span
      class="mono"
      aria-live="polite">Turn {turn} of 5</span
    ><Button label="Next turn →" disabled={turn >= 5} onclick={() => turn++} />
  </div>
  <Select
    label="Branch"
    options={['Main branch', 'Compact layout exploration', 'Shared editor alternative']}
    bind:value={branch}
  />
</nav>
