<script lang="ts">
  import TextArea from '../components/TextArea.svelte';
  import { tick } from 'svelte';
  import Button from '../components/Button.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import EntityPicker from '../patterns/EntityPicker.svelte';
  import Modal from '../patterns/Modal.svelte';
  let {
    onsend = () => {},
    disabled = false, firstSapling = false, empty = false,
  }: { onsend?: (text: string) => void; disabled?: boolean; firstSapling?: boolean; empty?: boolean } = $props();
  let draft = $state('');
  let attached = $state(false);
  let picker = $state(false);
  let feedback = $state('');let composerOpen=$state(false);let firstInput=$state<HTMLTextAreaElement>();
  $effect(()=>{if(firstSapling&&(empty||composerOpen))void tick().then(()=>firstInput?.focus());});
  function firstKeys(event:KeyboardEvent){if(!firstSapling||empty||document.querySelector('dialog[open]'))return;if(event.key==='Enter'&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!composerOpen&&!(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement)){event.preventDefault();composerOpen=true;}}
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

<svelte:window onkeydown={firstKeys}/>
{#if firstSapling}
 <section class="first-composer" aria-label="Message composer">
  {#if empty||composerOpen}<textarea bind:this={firstInput} aria-label="Message" placeholder="Message sample…" rows={empty?10:3} bind:value={draft} {disabled} onkeydown={(event)=>{handleKeys(event);if(event.key==='Escape'&&!empty){composerOpen=false;}}}></textarea><small class="muted">⌘⏎ to Send{empty?'':' · Esc to collapse'}</small>
  {:else}<button class="start-message" onclick={()=>composerOpen=true}>Press Enter to start new message ⏎</button>{/if}
 </section>
{:else}
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

{/if}
<style>.first-composer{padding:16px;display:flex;flex-direction:column;gap:6px;min-width:0}.first-composer textarea{width:100%;min-width:0;resize:vertical;background:var(--inset);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:12px;font:inherit;line-height:1.5}.start-message{background:none;border:0;padding:4px;color:var(--muted);font:inherit;text-align:left}</style>
