<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../components/Button.svelte';
  import TextArea from '../components/TextArea.svelte';
  import TextField from '../components/TextField.svelte';
  let {
    title = 'Design System',
    body = 'Preserve the warm palette, connected entities and readable workspaces. Standardize ordinary actions so users can rely on them everywhere.',
  }: { title?: string; body?: string } = $props();
  let editing = $state(false);
  let draft = $state(untrack(() => body));
  let saved = $state(untrack(() => body));
  let search = $state('');
  let feedback = $state('');
  let dirty = $derived(draft !== saved);
  let discarding = $state(false);
  function close() {
    if (dirty) discarding = true;
    else editing = false;
  }
</script>

<article class="panel stack">
  <div class="row spread">
    <div>
      <p class="eyebrow">Artifact · Current revision</p>
      <h2>{title}</h2>
    </div>
    <div class="row">
      <Button
        label={editing ? 'Cancel' : 'Edit document'}
        onclick={() => (editing ? close() : (editing = true))}
      />{#if editing}<Button
          label="Save changes"
          tone="primary"
          onclick={() => {
            saved = draft;
            editing = false;
            feedback = 'Document saved locally';
          }}
        />{/if}
    </div>
  </div>
  <TextField
    label="Find in this document"
    bind:value={search}
    type="search"
  />{#if editing}<TextArea label="Document body" bind:value={draft} rows={12} />{:else}<div
      class="readable stack"
    >
      <p>{saved}</p>
      {#if search}<small role="status"
          >{saved.toLowerCase().includes(search.toLowerCase())
            ? 'Text found in this document.'
            : 'No matches.'}</small
        >{/if}
      <h3>Behavior is part of the design</h3>
      <ul>
        <li>Keep the user’s place and preserve drafts.</li>
        <li>Distinguish saving, failed, stale and complete.</li>
        <li>Use visible actions and restore keyboard focus.</li>
      </ul>
      <pre class="code">Workspace → Header / Navigation / Main / Inspector / Status</pre>
    </div>{/if}{#if discarding}<div class="notice row">
      <strong>Discard unsaved changes?</strong><Button
        label="Keep editing"
        onclick={() => (discarding = false)}
      /><Button
        label="Discard changes"
        onclick={() => {
          draft = saved;
          discarding = false;
          editing = false;
        }}
      />
    </div>{/if}<small role="status">{feedback}</small>
</article>
