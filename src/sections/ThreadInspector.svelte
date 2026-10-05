<script lang="ts">
  import Badge from '../components/Badge.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
</script>

<aside class="panel stack">
  <h2>Session details</h2>
  <dl>
    <dt>Repository</dt>
    <dd>arbol-design-system</dd>
    <dt>Provider route</dt>
    <dd>Writing assistant</dd>
    <dt>State</dt>
    <dd><Badge label="Ongoing" /></dd>
    <dt>Usage</dt>
    <dd>12,840 tokens · 3 tool calls</dd>
  </dl>
  <h3>Relationships</h3>
  <EntityReference title="Design reconstruction" kind="living_topic" /><EntityReference
    title="Shared interaction audit"
    kind="artifact"
  />
  <h3>Lifecycle</h3>
  <ol class="small muted">
    <li>11:30 · Session created</li>
    <li>11:31 · First response started</li>
    <li>11:42 · Response complete</li>
  </ol>
</aside>

<style>
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
</style>
