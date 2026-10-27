<script lang="ts">
  import Button from '../components/Button.svelte';
  import Modal from '../patterns/Modal.svelte';
  import ConfirmAction from '../patterns/ConfirmAction.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let {
    kind = 'editor',
    outcome = 'success',
    mode = 'create',
    repository = false,
    stopResponse = false,
  }: { kind?: string; outcome?: string; mode?: string;repository?:boolean;stopResponse?:boolean } = $props();
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
          ? repository?'Change repository':stopResponse?'Stop current response':'Delete work item'
          : 'Open dialog'}
      tone={kind === 'confirm'&&!repository&&!stopResponse ? 'danger' : 'primary'}
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
      {...(repository?{title:'Change repository?',description:'The agent still gets every message of this chat, but no longer remembers what it read and ran before',action:'Change repository',actionTone:'primary' as const}:{})}
      {...(stopResponse?{title:'Stop current response?',description:'Stop the current response, wait until its end is saved, and then send this Draft.',action:'Confirm',actionTone:'primary' as const}:{})}
      onconfirm={() => {
        open = false;
        result = repository?'Repo changed to fictional sample':stopResponse?'Fictional stop requested; waiting for a saved end':'Work item deleted locally';
      }}
      oncancel={() => (open = false)}
    />{:else}<Modal
      title="Connected knowledge"
      description="A named dialog with native focus containment."
      onclose={() => (open = false)}
      ><p>Keep the reading context and restore focus to the trigger when this view closes.</p>
      {#snippet footer()}<Button label="Close" onclick={() => (open = false)} />{/snippet}</Modal
    >{/if}{/if}
