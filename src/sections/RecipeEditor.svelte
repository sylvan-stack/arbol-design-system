<script lang="ts">
  let { ondirty = (_dirty: boolean) => {} }: { ondirty?: (dirty: boolean) => void } = $props();
  import Select from '../components/Select.svelte';
  import TextField from '../components/TextField.svelte';
  import Button from '../components/Button.svelte';
  let name = $state('Thoughtful implementation');
  let rules = $state([
    { when: 'Repository is arbol', route: 'Deep reasoning' },
    { when: 'Task is drafting', route: 'Writing assistant' },
    { when: 'Otherwise', route: 'Balanced' },
  ]);
  let feedback = $state('');
  function move(i: number, d: number) {
    const copy = [...rules];
    [copy[i], copy[i + d]] = [copy[i + d], copy[i]];
    rules = copy;
    ondirty(true);
  }
</script>

<form
  class="panel stack"
  oninput={() => ondirty(true)}
  onsubmit={(event) => event.preventDefault()}
>
  <TextField label="Recipe name" bind:value={name} required /><Select
    label="Global fallback"
    options={['Balanced', 'Writing assistant', 'Deep reasoning']}
    value="Balanced"
  />
  <h2>Ordered assignments</h2>
  <p class="muted">First matching rule wins. The fallback handles unmatched work.</p>
  {#each rules as rule, i}<div class="inset row">
      <span class="mono muted">{i + 1}</span>
      <div class="grow">
        <strong>{rule.when}</strong>
        <p class="small muted">Use {rule.route}</p>
      </div>
      <Button label="Move up" disabled={i === 0} onclick={() => move(i, -1)} /><Button
        label="Move down"
        disabled={i === rules.length - 1}
        onclick={() => move(i, 1)}
      />
    </div>{/each}
  <div>
    <Button
      label="Save recipe"
      tone="primary"
      disabled={!name.trim()}
      onclick={() => {
        feedback = 'Recipe saved locally';
        ondirty(false);
      }}
    />
  </div>
  <p role="status">{feedback}</p>
</form>
