<script lang="ts">
  import Button from '../components/Button.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  let { mode = 'all' }: { mode?: string } = $props();
  let request = $state(true);
  let retained = $state(true);
</script>

<aside class="stack" aria-label="Attention">
  {#if mode !== 'spotlight'}<h2>Action Items</h2>
    {#if request}<PermissionRequest
        tool="Read design files"
        scope="arbol-design-system · src/**"
        ondecision={() => (request = false)}
      />{:else}<p role="status" class="panel muted">All requests resolved.</p>{/if}
  {/if}{#if mode !== 'actions'}<h2>Spotlight</h2>
    {#if retained}<div class="panel stack">
        <EntityReference title="Design System" />
        <p class="small muted">Retained for reference · Artifact</p>
        <Button label="Remove from Spotlight" tone="ghost" onclick={() => (retained = false)} />
      </div>{:else}<p class="muted">No retained items.</p>{/if}
  {/if}
</aside>
