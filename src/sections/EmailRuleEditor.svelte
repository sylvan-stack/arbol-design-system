<script lang="ts">
  import TextField from '../components/TextField.svelte';
  import TextArea from '../components/TextArea.svelte';
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  let name = $state('Review requests');
  let match = $state('subject contains "review"');
  let tested = $state(false);
  let saved = $state(false);
</script>

<div class="panel stack">
  <h2>New email signal rule</h2>
  <TextField label="Rule name" bind:value={name} required /><TextArea
    label="Matching condition"
    bind:value={match}
  />
  <div class="notice">
    <strong>Applies to future emails only.</strong>
    <p class="small">Testing a retained email previews a match. It does not emit a Signal.</p>
  </div>
  <div class="row">
    <Button label="Test retained email" onclick={() => (tested = true)} /><Button
      label="Create rule"
      tone="primary"
      disabled={!tested || !name.trim() || !match.trim()}
      onclick={() => (saved = true)}
    />
  </div>
  {#if tested}<Badge
      label={saved ? 'Rule created for future email' : 'Sample email matches · No Signal emitted'}
      tone="success"
    />{/if}
</div>
