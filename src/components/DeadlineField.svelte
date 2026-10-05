<script lang="ts">
  import Select from './Select.svelte';
  import DateTimeInput from './DateTimeInput.svelte';
  let {
    kind = $bindable('Due'),
    value = $bindable('2026-10-05T16:00'),
  }: { kind?: string; value?: string } = $props();
</script>

<fieldset class="stack">
  <legend>Deadline</legend><Select
    label="Deadline type"
    options={['Estimated', 'Due', 'Deadline']}
    bind:value={kind}
  /><DateTimeInput bind:value />
  <p class="small muted">
    {kind === 'Estimated'
      ? 'A forecast, not a commitment.'
      : kind === 'Due'
        ? 'A target to plan around.'
        : 'A firm latest completion time.'}
  </p>
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 16px;
  }
  legend {
    padding: 0 8px;
    font-weight: 600;
  }
</style>
