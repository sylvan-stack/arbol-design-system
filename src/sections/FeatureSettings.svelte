<script lang="ts">
  import Switch from '../components/Switch.svelte';
  let flags = $state([
    {
      title: 'Email sources',
      description: 'Show connected email inboxes in Willo.',
      enabled: true,
    },
    {
      title: 'Image attachments',
      description: 'Allow supported images in Elma messages.',
      enabled: true,
    },
    {
      title: 'Compact planning panel',
      description: 'Keep active swimlanes visible in a small window.',
      enabled: false,
    },
    {
      title: 'Cue detection',
      description: 'Identify actionable cues in connected sources.',
      enabled: true,
    },
  ]);
</script>

<div class="panel stack">
  <p class="notice">Global scope · These controls change sample state only.</p>
  {#each flags as flag}<div class="row spread">
      <div class="grow">
        <h3>{flag.title}</h3>
        <p class="small muted">{flag.description}</p>
      </div>
      <Switch label={flag.title} bind:checked={flag.enabled} />
    </div>
    <hr class="rule" />{/each}
  <details>
    <summary>Cue detection catalog</summary>
    <div class="stack" style="padding-top:16px">
      <p>Question · Request · Deadline · Failure · Completion</p>
      <p class="small muted">Each cue retains its source and detection reason.</p>
    </div>
  </details>
</div>
