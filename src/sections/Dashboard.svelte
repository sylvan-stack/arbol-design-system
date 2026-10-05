<script lang="ts">
  import Meter from '../components/Meter.svelte';
  import Badge from '../components/Badge.svelte';
  import EntitySummary from '../patterns/EntitySummary.svelte';
</script>

<div class="stack">
  <div class="grid three">
    <div class="panel stack">
      <span class="eyebrow">Knowledge</span>
      <h2>24,680 chunks</h2>
      <Badge label="Index current" tone="success" /><small class="muted"
        >Last indexed 8 minutes ago</small
      >
    </div>
    <div class="panel stack">
      <span class="eyebrow">Repositories</span>
      <h2>6 connected</h2>
      <Badge label="1 needs attention" tone="warning" /><small class="muted"
        >One local checkout has drifted</small
      >
    </div>
    <div class="panel stack">
      <span class="eyebrow">Provider health</span>
      <h2>3 available</h2>
      <Badge label="All routes responding" tone="success" /><small class="muted"
        >Tested 2 minutes ago</small
      >
    </div>
  </div>
  <div class="grid">
    <div class="panel stack">
      <h2>Knowledge coverage</h2>
      <Meter label="Indexed source files" value={86} /><Meter label="Embedded chunks" value={72} />
      <p class="small muted">Scope: arbol · Current checkout</p>
    </div>
    <div class="panel stack">
      <h2>Recent activity</h2>
      <EntitySummary
        title="Design System captured"
        subtitle="Artifact · 5 minutes ago"
        kind="artifact"
        status="Complete"
      /><EntitySummary
        title="Shared editor review"
        subtitle="Chat · 12 minutes ago"
        kind="chat"
        status="Ready"
      />
    </div>
  </div>
</div>
