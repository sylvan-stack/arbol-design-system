<script lang="ts">
  let {
    label = 'Repositories',
    options = ['arbol', 'mycel', 'universe'],
    selected = $bindable<string[]>([]),
  }: { label?: string; options?: string[]; selected?: string[] } = $props();
</script>

<fieldset class="panel stack">
  <legend>{label}</legend>{#each options as option}<label class="row"
      ><input type="checkbox" value={option} bind:group={selected} />{option}</label
    >{/each}
  <p class="small muted">{selected.length} selected</p>
</fieldset>

<style>
  legend {
    padding: 0 8px;
    font-weight: 600;
  }
  input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
</style>
