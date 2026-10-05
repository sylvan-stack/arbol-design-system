<script lang="ts">
  import Button from './Button.svelte';
  let {
    state = 'loading',
    message = '',
    onretry,
  }: { state?: string; message?: string; onretry?: () => void } = $props();
</script>

<div class="notice stack" role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
  <strong
    >{message ||
      {
        loading: 'Loading records…',
        saving: 'Saving changes…',
        saved: 'Changes saved',
        error: 'Could not load records',
        stale: 'Showing saved records · Refresh failed',
        partial: 'Identity saved · Model settings could not be saved',
        conflict: 'This item changed in another window',
        uncertain: 'Save outcome unknown · Check the latest record before retrying',
      }[state] ||
      state}</strong
  >{#if ['error', 'stale', 'partial', 'conflict', 'uncertain'].includes(state)}<p
      class="small muted"
    >
      Your current data and draft are preserved.
    </p>
    <div>
      <Button
        label={state === 'conflict' || state === 'uncertain' ? 'Check latest record' : 'Retry'}
        onclick={onretry}
      />
    </div>{/if}
</div>
