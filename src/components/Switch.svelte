<script lang="ts">
  let {
    label,
    checked = $bindable(false),
    disabled = false,
  }: { label: string; checked?: boolean; disabled?: boolean } = $props();
</script>

<label><input type="checkbox" role="switch" bind:checked {disabled} /><span>{label}</span></label>

<style>
  label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: var(--control-height);
  }
  input {
    appearance: none;
    width: 34px;
    height: 20px;
    border: 1px solid var(--muted);
    border-radius: 99px;
    background: var(--canvas);
    position: relative;
    cursor: pointer;
    margin: 0;
  }
  input::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 99px;
    background: var(--muted);
    top: 2px;
    left: 2px;
    transition: transform var(--motion-fast);
  }
  input:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  input:checked::after {
    transform: translateX(14px);
    background: var(--action-ink);
  }
</style>
