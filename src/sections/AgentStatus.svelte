<script lang="ts">
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  let { status = 'Running' }: { status?: string } = $props();
  let result = $state('');
</script>

<div class="inset row spread" role="status">
  <div class="row">
    <Badge
      label={result || status}
      tone={status === 'Failed' ? 'failure' : status === 'Running' ? 'working' : 'neutral'}
    /><span class="small muted"
      >{status === 'Failed'
        ? 'Connection interrupted · Last response retained'
        : status === 'Running'
          ? 'Inspecting source files…'
          : 'Ready for the next step'}</span
    >
  </div>
  <Button
    label={status === 'Running' ? 'Stop' : status === 'Failed' ? 'Retry' : 'Continue'}
    onclick={() => (result = status === 'Running' ? 'Stopped' : 'Queued locally')}
  />
</div>
