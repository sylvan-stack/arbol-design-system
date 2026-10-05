<script lang="ts">
  import Tabs from '../components/Tabs.svelte';
  import TextField from '../components/TextField.svelte';
  import Badge from '../components/Badge.svelte';
  import DetailPane from '../patterns/DetailPane.svelte';
  let tab = $state('Event Stream');
  let query = $state('');
  let selected = $state('');
  const events = [
    {
      time: '11:42:06',
      level: 'Info',
      event: 'repository.indexed',
      detail: 'arbol · 538 source files',
    },
    {
      time: '11:41:52',
      level: 'Warning',
      event: 'provider.usage_unavailable',
      detail: 'Work account · Report not supported',
    },
    {
      time: '11:40:20',
      level: 'Info',
      event: 'chat.completed',
      detail: 'Restore shared design language',
    },
  ];
</script>

<div class="stack">
  <Tabs
    label="Monitoring stream"
    items={['Event Stream', 'Journal Log']}
    bind:value={tab}
  /><TextField label={'Filter this sample ' + tab.toLowerCase()} bind:value={query} type="search" />
  <div class="panel table-wrap">
    <table>
      <caption class="sr-only">{tab}</caption><thead
        ><tr><th>Time</th><th>Level</th><th>Event</th><th>Summary</th></tr></thead
      ><tbody
        >{#each events.filter((x) => JSON.stringify(x)
            .toLowerCase()
            .includes(query.toLowerCase())) as event}<tr
            ><td class="mono">{event.time}</td><td
              ><Badge
                label={event.level}
                tone={event.level === 'Warning' ? 'warning' : 'neutral'}
              /></td
            ><td
              ><button
                class="link-button mono"
                onclick={() => (selected = JSON.stringify(event, null, 2))}>{event.event}</button
              ></td
            ><td class="small muted">{event.detail}</td></tr
          >{/each}</tbody
      >
    </table>
  </div>
  {#if selected}<DetailPane
      title="Event payload"
      subtitle="Sample · Europe/Madrid"
      onclose={() => (selected = '')}><pre class="code">{selected}</pre></DetailPane
    >{/if}
</div>
