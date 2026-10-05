<script lang="ts">
  import Meter from '../components/Meter.svelte';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Switch from '../components/Switch.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let { unavailable = false }: { unavailable?: boolean } = $props();
  let enabled = $state(true);
  let editing = $state(false);
  let result = $state('');
  let name = $state('Writing assistant');
</script>

<div class="stack">
  <div class="grid">
    <section class="panel stack">
      <div class="row spread">
        <h3>Personal account</h3>
        <Badge
          label={unavailable ? 'Session expired' : 'Connected'}
          tone={unavailable ? 'warning' : 'success'}
        />
      </div>
      <Meter label="Weekly usage" value={42} unknown={unavailable} />
      <p class="small muted">Usage refreshed just now · Sample account</p>
      <div class="row">
        <Button
          label={unavailable ? 'Reconnect' : 'Refresh usage'}
          onclick={() => (result = 'Account refreshed in this fixture')}
        /><Button
          label="Last requests"
          tone="ghost"
          onclick={() => (result = '3 sample requests · 12,840 tokens')}
        />
      </div>
    </section>
    <section class="panel stack">
      <div class="row spread">
        <h3>Work account</h3>
        <Badge label="Connected" tone="success" />
      </div>
      <Meter label="Weekly usage" unknown />
      <p class="small muted">This provider does not report a usage limit.</p>
      <Button
        label="Account details"
        onclick={() => (result = 'Work account · Usage unavailable')}
      />
    </section>
  </div>
  <section class="panel stack">
    <div class="row spread">
      <h2>Configured routes</h2>
      <Switch label="Enabled" bind:checked={enabled} />
    </div>
    <h3>{name}</h3>
    <p class="muted">Personal account · Balanced model · Medium reasoning</p>
    <div class="row">
      <Badge label={enabled ? 'Available' : 'Disabled'} /><Button
        label="Test route"
        onclick={() => (result = 'Route test succeeded · Sample response received')}
      /><Button label="Edit provider" onclick={() => (editing = true)} />
    </div>
    <p role="status" class="small">{result}</p>
  </section>
</div>
{#if editing}<EntityEditor
    entity="provider"
    mode="edit"
    initial={{ title: name, account: 'Personal account', model: 'Balanced', reasoning: 'Medium' }}
    fields={[
      { key: 'title', label: 'Name', required: true },
      {
        key: 'account',
        label: 'Account',
        type: 'select',
        options: ['Personal account', 'Work account'],
        required: true,
      },
      {
        key: 'model',
        label: 'Default model',
        type: 'select',
        options: ['Balanced', 'Fast', 'Deep'],
        hint: 'Catalog values are sample data, not provider capabilities.',
      },
      { key: 'reasoning', label: 'Reasoning', type: 'select', options: ['Low', 'Medium', 'High'] },
      {
        key: 'repositories',
        label: 'Default repositories',
        hint: 'Prohibited repository rules take precedence.',
      },
    ]}
    onsave={(v) => (name = v.title)}
    onclose={() => (editing = false)}
  />{/if}
