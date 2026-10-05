<script lang="ts">
  import Switch from '../components/Switch.svelte';
  import Select from '../components/Select.svelte';
  import Button from '../components/Button.svelte';
  let notifications = $state([
    { name: 'Response complete', enabled: true },
    { name: 'Permission needed', enabled: true },
    { name: 'Run failed', enabled: true },
    { name: 'Background progress', enabled: false },
  ]);
  let feedback = $state('');
</script>

<div class="panel stack">
  <h2>Comunicado delivery</h2>
  <p class="muted">Configure when and how Arbol gets your attention.</p>
  {#each notifications as item}<div class="row spread">
      <Switch label={item.name} bind:checked={item.enabled} /><Button
        label="Test notification"
        onclick={() => (feedback = item.name + ' · Preview delivered locally')}
      />
    </div>{/each}<Select
    label="Sound"
    options={['Soft bell', 'Wood tap', 'None']}
    value="Soft bell"
  />
  <p role="status" class="notice">
    {feedback || 'Testing does not create a real system notification.'}
  </p>
</div>
