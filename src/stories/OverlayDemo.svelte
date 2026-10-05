<script lang="ts">
  import Button from '../components/Button.svelte';
  import Modal from '../patterns/Modal.svelte';
  import ConfirmAction from '../patterns/ConfirmAction.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let {
    kind = 'editor',
    outcome = 'success',
    mode = 'create',
  }: { kind?: string; outcome?: string; mode?: string } = $props();
  let open = $state(false);
  let result = $state('');
</script>

<div class="demo-frame stack">
  <h2>
    {kind === 'editor'
      ? 'Shared entity editor'
      : kind === 'confirm'
        ? 'Confirm a consequential action'
        : 'Named modal'}
  </h2>
  <p class="muted">
    Open the dialog to test focus, keyboard containment, Escape and focus restoration.
  </p>
  <div>
    <Button
      label={kind === 'editor'
        ? 'Open editor'
        : kind === 'confirm'
          ? 'Delete work item'
          : 'Open dialog'}
      tone={kind === 'confirm' ? 'danger' : 'primary'}
      onclick={() => (open = true)}
    />
  </div>
  <p role="status">{result}</p>
</div>
{#if open}{#if kind === 'editor'}<EntityEditor
      entity="work item"
      {mode}
      {outcome}
      initial={mode === 'edit'
        ? { title: 'Restore the design language', description: 'Shared interaction contracts' }
        : {}}
      onsave={(values) => (result = 'Saved: ' + values.title)}
      onclose={() => (open = false)}
    />{:else if kind === 'confirm'}<ConfirmAction
      onconfirm={() => {
        open = false;
        result = 'Work item deleted locally';
      }}
      oncancel={() => (open = false)}
    />{:else}<Modal
      title="Connected knowledge"
      description="A named dialog with native focus containment."
      onclose={() => (open = false)}
      ><p>Keep the reading context and restore focus to the trigger when this view closes.</p>
      {#snippet footer()}<Button label="Close" onclick={() => (open = false)} />{/snippet}</Modal
    >{/if}{/if}
