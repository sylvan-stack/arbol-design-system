<script lang="ts">
  import type { Snippet } from 'svelte'
  let { children }: { children: Snippet } = $props()
</script>

<div style="min-height:0;min-width:0;overflow:hidden">{@render children()}</div>
