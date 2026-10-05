<script lang="ts">
  let {
    label,
    checked = $bindable(false),
    disabled = false,
  }: { label: string; checked?: boolean; disabled?: boolean } = $props();
</script>

<label><input type="checkbox" bind:checked {disabled} /><span>{label}</span></label>

<style>
  label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-height);
  }
  input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
</style>
