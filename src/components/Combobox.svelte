<script lang="ts">
  let {
    label = 'Repository',
    options = ['arbol', 'arbol-design-system', 'mycel', 'universe'],
    value = $bindable(''),
  }: { label?: string; options?: string[]; value?: string } = $props();
  const id = $props.id();
</script>

<label for={id} class="stack" style="gap:6px"
  ><strong>{label}</strong><input
    {id}
    list={id + '-options'}
    bind:value
    placeholder="Type to search…"
  /><datalist id={id + '-options'}
    >{#each options as option}<option value={option}></option>{/each}</datalist
  ></label
>

<style>
  input {
    min-height: var(--control-height);
    background: var(--canvas);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 8px 10px;
  }
</style>
