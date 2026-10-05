<script lang="ts">
  import TextArea from '../components/TextArea.svelte';
  import Button from '../components/Button.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import EntityPicker from '../patterns/EntityPicker.svelte';
  import Modal from '../patterns/Modal.svelte';
  let {
    onsend = () => {},
    disabled = false,
  }: { onsend?: (text: string) => void; disabled?: boolean } = $props();
  let draft = $state('');
  let attached = $state(false);
  let picker = $state(false);
  let feedback = $state('');
  function send() {
    if (!draft.trim() || disabled) return;
    onsend(draft);
    draft = '';
    feedback = 'Message sent locally';
  }
  function handleKeys(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }
</script>

<section class="panel stack" aria-label="Message composer">
  <TextArea
    onkeydown={handleKeys}
    label="Message"
    bind:value={draft}
    rows={3}
    placeholder="Write a follow-up or add context…"
  />{#if attached}<div class="row">
      <EntityReference title="Design System" /><Button
        label="Remove context"
        tone="ghost"
        onclick={() => (attached = false)}
      />
    </div>{/if}
  <div class="row spread">
    <div class="row">
      <Button label="Add context" onclick={() => (picker = true)} /><small class="muted"
        >⌘/Ctrl + Enter to send</small
      >
    </div>
    <Button label="Send" tone="primary" disabled={disabled || !draft.trim()} onclick={send} />
  </div>
  <small role="status" class="muted"
    >{feedback || 'Local preview draft · Preserved while this composer remains mounted'}</small
  >
</section>
{#if picker}<Modal title="Add context" onclose={() => (picker = false)}
    ><EntityPicker
      onselect={() => {
        attached = true;
        picker = false;
      }}
    /></Modal
  >{/if}
