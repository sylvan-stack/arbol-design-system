<script lang="ts">
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let selected = $state('');
  let feedback = $state('');
  const services = [
    'Provider API key',
    'GitHub connection',
    'Slack workspace',
    'Telegram session',
    'Email account',
  ];
</script>

<div class="panel stack">
  <p class="notice">Saved credentials are never displayed. Samples contain no real credentials.</p>
  {#each services as service}<div class="row spread">
      <div class="grow">
        <h3>{service}</h3>
        <span class="small muted"
          >{service === 'Telegram session'
            ? 'Authentication required'
            : 'Configured · Value concealed'}</span
        >
      </div>
      <Badge
        label={service === 'Telegram session' ? 'Disconnected' : 'Configured'}
        tone={service === 'Telegram session' ? 'warning' : 'success'}
      /><Button
        label="Test connection"
        onclick={() => (feedback = service + ' · Sample connection succeeded')}
      /><Button
        label={service === 'Telegram session' ? 'Connect' : 'Replace'}
        onclick={() => (selected = service)}
      />
    </div>
    <hr class="rule" />{/each}<small role="status">{feedback}</small>
</div>
{#if selected}<EntityEditor
    entity={selected}
    fields={[
      {
        key: 'value',
        label: selected === 'Telegram session' ? 'Phone number' : 'Replacement credential',
        type: selected === 'Telegram session' ? 'text' : 'password',
        required: true,
        hint: 'Sample input only. Never paste a real secret into Storybook.',
      },
    ]}
    onsave={() => (feedback = selected + ' updated locally')}
    onclose={() => (selected = '')}
  />{/if}
