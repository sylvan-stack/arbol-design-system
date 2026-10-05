<script lang="ts">
  import { THEMES } from '../themes';
  import Select from '../components/Select.svelte';
  import Button from '../components/Button.svelte';
  import Switch from '../components/Switch.svelte';
  let theme = $state('Redwood');
  let density = $state('Comfortable');
  let size = $state('100%');
  let reading = $state('720 px');
  let local = $state(false);
  let saved = $state(false);
  function apply() {
    document.documentElement.dataset.theme = theme.toLowerCase();
    document.documentElement.dataset.density = density.toLowerCase();
    document.documentElement.style.setProperty('--font-scale', String(parseInt(size) / 100));
    saved = true;
  }
</script>

<div class="panel stack">
  <h2>Appearance and reading</h2>
  <div class="grid">
    <Select label="Theme" options={THEMES.map((t) => t.name)} bind:value={theme} /><Select
      label="Density"
      options={['Comfortable', 'Compact']}
      bind:value={density}
    /><Select label="Interface text" options={['100%', '125%', '150%']} bind:value={size} /><Select
      label="Reading width"
      options={[
        '600 px',
        '720 px',
        '840 px',
        '960 px',
        '1080 px',
        '1200 px',
        '1320 px',
        '1440 px',
        '1560 px',
        '1680 px',
      ]}
      bind:value={reading}
    />
  </div>
  <Switch label="Override appearance for this workspace" bind:checked={local} />
  <p class="small muted">
    {local ? 'Scope: current workspace' : 'Scope: all workspaces'} · Preview changes are temporary in
    Storybook.
  </p>
  <div><Button label="Apply preview" tone="primary" onclick={apply} /></div>
  {#if saved}<p role="status">Appearance preview applied · Reading width {reading}</p>{/if}
</div>
