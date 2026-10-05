<script lang="ts">
  import Badge from '../components/Badge.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  let { failed = false }: { failed?: boolean } = $props();
</script>

<div class="panel stack">
  <div class="row spread">
    <h2>Design review · Run 042</h2>
    <Badge label={failed ? 'Failed' : 'Complete'} tone={failed ? 'failure' : 'success'} />
  </div>
  <p class="small muted">5 Oct 2026 · 11:30–11:42 · 12 min</p>
  <div class="tree">
    <div>
      <Badge label="Inputs resolved" tone="success" />
      <p class="small muted">Repository: arbol-design-system</p>
    </div>
    <div>
      <Badge label="Source inspection" tone="success" />
      <p class="small muted">34 components reviewed</p>
    </div>
    <div>
      <Badge
        label={failed ? 'Report save failed' : 'Review artifact created'}
        tone={failed ? 'failure' : 'success'}
      />
    </div>
  </div>
  <h3>Related work</h3>
  <EntityReference title="Design review findings" /><EntityReference
    title="Review shared interactions"
    kind="chat"
  />
</div>
