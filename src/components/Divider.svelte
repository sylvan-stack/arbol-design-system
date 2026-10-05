<script lang="ts">
  let { label = '' }: { label?: string } = $props();
</script>

<div class="divider">
  {#if label}<span class="eyebrow">{label}</span>{/if}
  <hr class="rule" />
</div>

<style>
  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
  }
  span {
    white-space: nowrap;
  }
</style>
