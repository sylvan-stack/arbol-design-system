<script lang="ts">
  import EntityChip from './EntityChip.svelte'
  import { splitEntityUris } from './entityUri'
  import type { EntityNavigator } from './navigation'

  let {
    text,
    navigate,
    onNavigationError,
  }: {
    text: string
    navigate?: EntityNavigator
    onNavigationError?: (error: Error) => void
  } = $props()

  const segments = $derived(splitEntityUris(text))
</script>

<span class="entity-rich-text">{#each segments as segment, i (i)}{#if segment.kind === 'entity'}<EntityChip uri={segment.uri} {navigate} {onNavigationError} />{:else}{segment.text}{/if}{/each}</span>

<style>
  .entity-rich-text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
