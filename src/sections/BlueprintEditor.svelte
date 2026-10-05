<script lang="ts">
  let { ondirty = (_dirty: boolean) => {} }: { ondirty?: (dirty: boolean) => void } = $props();
  import TextField from '../components/TextField.svelte';
  import TextArea from '../components/TextArea.svelte';
  import Button from '../components/Button.svelte';
  import Select from '../components/Select.svelte';
  let name = $state('Design review');
  let instructions = $state(
    'Inspect the affected views. Compare each interaction with the shared design contracts. Report concrete findings with source references.',
  );
  let done = $state('All views reviewed; findings have evidence and severity.');
  let feedback = $state('');
</script>

<form
  class="panel stack"
  oninput={() => ondirty(true)}
  onsubmit={(event) => event.preventDefault()}
>
  <TextField label="Blueprint name" bind:value={name} required />
  <div class="grid">
    <div class="inset stack">
      <h3>Inputs</h3>
      <TextField label="Input name" value="repository" /><Select
        label="Input type"
        options={['Repository', 'Artifact', 'Text', 'Entity']}
        value="Repository"
      />
    </div>
    <div class="inset stack">
      <h3>Outputs</h3>
      <TextField label="Output name" value="review" /><Select
        label="Output type"
        options={['Artifact', 'Text', 'Entity']}
        value="Artifact"
      />
    </div>
  </div>
  <Select
    label="Brain Recipe"
    options={['Thoughtful implementation', 'Balanced']}
    value="Thoughtful implementation"
  /><TextArea label="Instructions · Markdown" bind:value={instructions} rows={7} /><TextArea
    label="Done when"
    bind:value={done}
    rows={2}
  />
  <details>
    <summary>Restrictions and permissions</summary>
    <p class="notice">Read source files. Do not mutate external systems.</p>
  </details>
  <div>
    <Button
      label="Save blueprint"
      tone="primary"
      disabled={!name.trim() || !instructions.trim()}
      onclick={() => {
        feedback = 'Blueprint saved locally';
        ondirty(false);
      }}
    />
  </div>
  <p role="status">{feedback}</p>
</form>
