<script lang="ts">
  let {
    label = 'Date and time',
    value = $bindable('2026-10-05T16:00'),
    timezone = 'Europe/Madrid',
  }: { label?: string; value?: string; timezone?: string } = $props();
  const id = $props.id();
</script>

<label for={id} class="stack" style="gap:6px"
  ><strong>{label}</strong><input {id} type="datetime-local" step="60" bind:value /><small
    class="muted">{timezone} · Exact local time</small
  ></label
>

<style>
  input {
    min-height: 36px;
    padding: 8px 10px;
    background: var(--canvas);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 9px;
  }
</style>
