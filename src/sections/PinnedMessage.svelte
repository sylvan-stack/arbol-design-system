<script lang="ts">
  import EntityReference from '../patterns/EntityReference.svelte';
  import Button from '../components/Button.svelte';
  let expanded = $state(false);
</script>

<section class="inset stack" aria-label="Pinned user message">
  <div class="row spread">
    <p class="eyebrow">Pinned request</p>
    <Button
      label={expanded ? 'Collapse' : 'Expand message'}
      tone="ghost"
      onclick={() => (expanded = !expanded)}
    />
  </div>
  <p>Preserve the useful parts of Arbol and make shared interactions consistent.</p>
  {#if expanded}<p class="muted">
      Review all four workspaces, identify duplicate components, and define one behavior for
      collections, editors and permissions.
    </p>
    <EntityReference title="Design System" />{/if}
</section>
