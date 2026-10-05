<script lang="ts">
  import { Button, Modal, callNative } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import {
    mailApi,
    emailParserChatNoteClipboard,
    type EmailParserDefinition,
    type EmailParserTestResult,
    type EmailSourceContent,
    type MailMessageSummary,
  } from './mailApi'
  import { openSessionInElma } from './api'

  let { message, source = null, onClose, onError }:
    { message: MailMessageSummary; source?: EmailSourceContent | null; onClose: () => void; onError: (message: string) => void } = $props()

  let parsers = $state<EmailParserDefinition[]>([])
  let selectedParserId = $state('')
  let loading = $state(true)
  let running = $state(false)
  let openingChat = $state(false)
  let copyingChatNote = $state(false)
  let result = $state<EmailParserTestResult | null>(null)

  onMount(async () => {
    try {
      parsers = await mailApi.parsers()
      selectedParserId = parsers[0]?.parser_id || ''
    } catch (value) {
      onError(value instanceof Error ? value.message : String(value))
    } finally {
      loading = false
    }
  })

  const selectedParser = $derived(parsers.find((parser) => parser.parser_id === selectedParserId) || null)

  async function runParser() {
    if (!selectedParserId || running) return
    running = true
    result = null
    try {
      result = await mailApi.testParser(message.id, selectedParserId, source?.source_item_id)
    } catch (value) {
      onError(value instanceof Error ? value.message : String(value))
    } finally {
      running = false
    }
  }

  async function copyAsChatNote() {
    if (!result || !selectedParser || copyingChatNote) return
    copyingChatNote = true
    try {
      const text = emailParserChatNoteClipboard({ parser: selectedParser, message, result })
      if (window.webkit?.messageHandlers?.arbol) {
        const response = await callNative('clipboard.writeText', { text }) as { ok?: boolean; error?: string }
        if (response?.ok === false) throw new Error(response.error || 'Could not copy Chat Note')
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        throw new Error('Clipboard access is unavailable')
      }
    } catch (value) {
      onError(value instanceof Error ? value.message : String(value))
    } finally {
      copyingChatNote = false
    }
  }

  async function openParserChat() {
    if (!result || !selectedParser || openingChat) return
    openingChat = true
    try {
      const created = await mailApi.createParserChat({ parser: selectedParser, message, result })
      await openSessionInElma(created.chat_session_id)
      onClose()
    } catch (value) {
      onError(value instanceof Error ? value.message : String(value))
    } finally {
      openingChat = false
    }
  }
</script>

<Modal title="Test Parser" subtitle={source?.subject || message.subject || '(no subject)'} onClose={onClose} width={720}>
  {#snippet children()}
    <div class="mail-rule-editor mail-parser-tester">
      <section>
        <h3>Email</h3>
        <p>{source?.sender_address || message.sender_address} · {source?.subject || message.subject || '(no subject)'}</p>
      </section>
      <section>
        <h3>Parser</h3>
        {#if loading}
          <p>Loading available Parsers…</p>
        {:else if parsers.length}
          <label>
            Parser
            <select bind:value={selectedParserId} disabled={running} onchange={() => (result = null)}>
              {#each parsers as parser (parser.parser_id)}
                <option value={parser.parser_id}>{parser.display_name}</option>
              {/each}
            </select>
          </label>
          <p>{source ? 'Runs against this email in the thread.' : 'Runs against the newest synchronized Email Source Item.'} Testing never emits a Signal.</p>
        {:else}
          <p>No Email Parsers are available.</p>
        {/if}
      </section>
      {#if result}
        <section aria-live="polite">
          <h3>Test result</h3>
          <div class:mail-parser-match={result.extracted} class:mail-parser-no-match={!result.extracted}>
            <b>{result.extracted ? 'Data extracted' : 'No data extracted'}</b>
            <span>{result.status}{result.cached ? ' · cached' : ''}</span>
          </div>
          <pre>{JSON.stringify(result.data, null, 2)}</pre>
          {#if !result.extracted}
            <p>This Parser did not recognize structured data in the email body.</p>
          {/if}
          <details class="mail-parser-raw" open>
            <summary>Raw email body</summary>
            <pre>{result.email.text || '(empty body)'}</pre>
          </details>
          {#if result.diagnostics.length}
            <details><summary>Diagnostics</summary><pre>{JSON.stringify(result.diagnostics, null, 2)}</pre></details>
          {/if}
        </section>
      {/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose} disabled={running || openingChat || copyingChatNote}>{#snippet children()}Close{/snippet}</Button>
    {#if result}
      <Button kind="soft" onclick={copyAsChatNote} disabled={running || openingChat || copyingChatNote || !selectedParser}>
        {#snippet children()}{copyingChatNote ? 'Copying…' : 'Copy as Chat Note'}{/snippet}
      </Button>
      <Button kind="soft" onclick={openParserChat} disabled={running || openingChat || copyingChatNote || !selectedParser}>
        {#snippet children()}{openingChat ? 'Opening Chat…' : 'Chat'}{/snippet}
      </Button>
    {/if}
    <Button kind="primary" onclick={runParser} disabled={loading || running || openingChat || copyingChatNote || !selectedParserId}>
      {#snippet children()}{running ? 'Running…' : 'Run Parser'}{/snippet}
    </Button>
  {/snippet}
</Modal>
