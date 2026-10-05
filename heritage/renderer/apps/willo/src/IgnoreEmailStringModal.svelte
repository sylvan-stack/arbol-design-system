<script lang="ts">
  import { onMount } from 'svelte'
  import { Button, Modal } from '@arbol/design-system'
  import type { MailMessageSummary } from './mailApi'

  let { message, busy = false, onSubmit, onClose }:
    {
      message: MailMessageSummary
      busy?: boolean
      onSubmit: (value: string) => void
      onClose: () => void
    } = $props()

  let value = $state('')
  let input: HTMLTextAreaElement
  const valid = $derived(value.trim().length > 0)

  onMount(() => input.focus())

  function submit() {
    if (valid && !busy) onSubmit(value.trim())
  }
</script>

<Modal title="Ignore by string" subtitle={message.subject || '(no subject)'} onClose={onClose} dismissable={!busy} width={620}>
  {#snippet children()}
    <form class="mail-ignore-string" onsubmit={(event) => { event.preventDefault(); submit() }}>
      <label for="mail-ignore-string-input">String in email body</label>
      <textarea
        id="mail-ignore-string-input"
        bind:this={input}
        bind:value
        autocomplete="off"
        disabled={busy}
        placeholder="Paste or enter text to match…"
        rows="10"
      ></textarea>
      <p>Emails whose body contains this text will be ignored. Matching is case-insensitive.</p>
    </form>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose} disabled={busy}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" onclick={submit} disabled={busy || !valid}>
      {#snippet children()}{busy ? 'Checking…' : 'Continue'}{/snippet}
    </Button>
  {/snippet}
</Modal>
