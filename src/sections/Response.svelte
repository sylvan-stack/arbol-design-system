<script lang="ts">
  import Badge from '../components/Badge.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  let { streaming = false }: { streaming?: boolean } = $props();
</script>

<article class="readable stack" aria-label="Assistant response">
  <details>
    <summary class="small muted">Thought process · 12 seconds</summary>
    <p class="small">Compared collection mechanics across four workspaces.</p>
  </details>
  <div class="inset row spread">
    <span class="mono">✓ Read 4 design documents</span><Badge label="Complete" tone="success" />
  </div>
  <h2>A consistent design can retain its character.</h2>
  <p>
    Preserve the warm palette, connected entities and readable workspace. Share the ordinary actions
    so users can rely on them everywhere.
  </p>
  <ul>
    <li>Use one collection with list, table and card presentations.</li>
    <li>Use the same draft lifecycle for creating and editing.</li>
    <li>Keep permission decisions explicit and scoped.</li>
  </ul>
  <EntityReference title="Design System" />
  <pre class="code"><code
      >Collection
  → query · filters · sort
  → selection · presentation</code
    ></pre>
  {#if streaming}<p role="status" class="small muted">◌ Writing response…</p>{:else}<div
      class="row"
    >
      <Badge label="Response complete" tone="success" /><span class="small muted"
        >3 sources · 1,284 tokens</span
      >
    </div>{/if}
</article>
