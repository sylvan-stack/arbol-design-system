<script lang="ts">
  import { Tabs } from '@arbol/design-system'
  import EventMonitor from './EventMonitor.svelte'
  import LogJournal from './LogJournal.svelte'

  type MonitoringTab = 'events' | 'journal'
  let tab = $state<MonitoringTab>('events')
  const tabs = [
    { id: 'events', label: 'Event Stream' },
    { id: 'journal', label: 'Journal Log' },
  ]
</script>

<div class="monitoring-page">
  <div class="monitoring-tabs">
    <Tabs {tabs} active={tab} onSelect={(id) => (tab = id as MonitoringTab)} />
  </div>
  <div class="monitoring-content">
    {#if tab === 'events'}
      <EventMonitor />
    {:else}
      <LogJournal />
    {/if}
  </div>
</div>

<style>
  .monitoring-page { height:100%; min-height:0; display:grid; grid-template-rows:auto 1fr; overflow:hidden; }
  .monitoring-tabs { border-bottom:1px solid var(--arbol-color-border); background:var(--arbol-color-bg); }
  .monitoring-content { min-height:0; overflow:hidden; }
</style>
