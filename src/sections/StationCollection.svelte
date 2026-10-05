<script lang="ts">
  import { untrack } from 'svelte';
  import StationSummary from './StationSummary.svelte';
  import TextField from '../components/TextField.svelte';
  import Tabs from '../components/Tabs.svelte';
  let { agentic = false, compact = false }: { agentic?: boolean; compact?: boolean } = $props();
  let query = $state('');
  let density = $state(untrack(() => (compact ? 'Compact' : 'Full')));
  const stations = [
    {
      title: 'Sketch a clearer settings flow',
      status: 'Draft',
      ongoing: false,
      preview: 'Draft saved on this device.',
    },
    { title: 'Reconstruct the design system', status: 'Running', ongoing: true, inElma: true },
    {
      title: 'Theme inventory is ready',
      preview: 'The twelve themes and source tokens have been captured.',
      status: 'Complete',
      unread: true,
      ongoing: false,
    },
    {
      title: 'Investigate chat continuity',
      status: 'Failed',
      ongoing: true,
      failure: 'Connection interrupted. Your draft and response are retained.',
    },
  ];
</script>

<div class="stack">
  <div class="row spread">
    <TextField label="Search this sample page" bind:value={query} type="search" /><Tabs
      label="Station density"
      items={['Full', 'Compact', 'Minimal']}
      bind:value={density}
    />
  </div>
  {#each stations.filter((x) => (!agentic || x.status !== 'Draft') && x.title
        .toLowerCase()
        .includes(query.toLowerCase())) as station}<div class="stack" style="gap:8px">
      <p class="eyebrow">
        {station.status === 'Draft'
          ? 'Drafted'
          : station.status === 'Running'
            ? 'Running'
            : station.unread
              ? 'Unread'
              : 'Other ongoing'}{agentic ? ' · Agent-origin' : ''}
      </p>
      <StationSummary {...station} density={density.toLowerCase()} />
    </div>{/each}
</div>
