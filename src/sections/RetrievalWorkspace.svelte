<script lang="ts">
  import Meter from '../components/Meter.svelte';
  import Button from '../components/Button.svelte';
  import TextField from '../components/TextField.svelte';
  import Tabs from '../components/Tabs.svelte';
  import EntitySummary from '../patterns/EntitySummary.svelte';
  let query = $state('shared entity editor');
  let mode = $state('Text');
  let searched = $state(false);
  let feedback = $state('');
</script>

<div class="stack">
  <div class="grid">
    <div class="panel stack">
      <h2>Embedding</h2>
      <Meter label="Chunks embedded" value={72} />
      <p class="small muted">4,210 pending chunks · arbol / current checkout</p>
      <Button
        label="Preview embedding plan"
        onclick={() => (feedback = 'Sample plan: 4,210 chunks · No external job started')}
      />
    </div>
    <div class="panel stack">
      <h2>RAPTOR summary tree</h2>
      <p class="muted">A searchable hierarchy of repository knowledge.</p>
      <Button
        label="Plan tree rebuild"
        onclick={() => (feedback = 'Sample plan: 3 levels · Scope: arbol')}
      />
    </div>
  </div>
  <div class="panel stack">
    <Tabs label="Search type" items={['Text', 'Code']} bind:value={mode} /><TextField
      label={'Search indexed ' + mode.toLowerCase()}
      bind:value={query}
    />
    <div><Button label="Search" tone="primary" onclick={() => (searched = true)} /></div>
    {#if searched}<EntitySummary
        title="Shared create and edit mechanics"
        subtitle="Design System / Component system · Relevance 0.91"
        status="Indexed"
      /><EntitySummary
        title="EntityEditor.svelte"
        subtitle="src/patterns · Relevance 0.84"
        kind="hunk"
        status="Indexed"
      />{/if}<small role="status">{feedback}</small>
  </div>
</div>
