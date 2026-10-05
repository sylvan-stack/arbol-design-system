<script lang="ts">
  import TimelineBoard from './TimelineBoard.svelte';
  import Tabs from '../components/Tabs.svelte';
  import EntitySummary from '../patterns/EntitySummary.svelte';
  import DeadlineField from '../components/DeadlineField.svelte';
  let view = $state('Split');
</script>

<div class="stack">
  <Tabs label="Swimlane details" items={['Split', 'Feed']} bind:value={view} />
  <div class:split={view === 'Split'}>
    {#if view === 'Split'}<TimelineBoard compact />{/if}
    <div class="panel stack">
      <h2>Design system</h2>
      <DeadlineField />
      <h3>Linked work</h3>
      <EntitySummary
        title="Shared editor implementation"
        kind="graft"
        status="Running"
      /><EntitySummary title="Review collection changes" kind="mr" status="Planned" />
      <p class="small muted">
        Duration swimmers occupy time; marks represent an instant. Duplicate anchors are prevented.
      </p>
    </div>
  </div>
</div>
