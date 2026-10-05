<script lang="ts">
  import Badge from '../components/Badge.svelte';
  let { state = 'Complete', expanded = false }: { state?: string; expanded?: boolean } = $props();
</script>

<details class="inset" open={expanded}>
  <summary
    ><span class="mono">read_files</span> · Inspect component definitions <Badge
      label={state}
      tone={state === 'Failed' ? 'failure' : state === 'Running' ? 'working' : 'success'}
    /></summary
  >
  <pre class="code">src/patterns/Collection.svelte
src/patterns/EntityEditor.svelte

{state === 'Failed'
      ? 'Could not read the requested file.'
      : state === 'Running'
        ? 'Reading source files…'
        : '2 files read · 8,420 characters'}</pre>
</details>
