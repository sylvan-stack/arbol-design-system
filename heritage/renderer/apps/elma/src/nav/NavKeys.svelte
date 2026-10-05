<script lang="ts">
  /* A small group of keycaps (hotkey index). Internal to the nav cluster. */
  import { KbdHint } from '@arbol/design-system'

  let { keys }: { keys: string[] } = $props()
</script>

<span style="display:inline-flex;gap:3px;flex-shrink:0">
  {#each keys as k, i (i)}
    <KbdHint {k} />
  {/each}
</span>
