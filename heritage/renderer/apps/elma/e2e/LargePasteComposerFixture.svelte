<script lang="ts">
  import Composer from '../src/chat/Composer.svelte'

  const valueRef = { current: '' }
  const attachmentsRef = { current: [] }
  let composer: HTMLTextAreaElement | null = $state(null)
  let sent = $state<string[]>([])

  function handleDraftChange(change: { text: string; source: HTMLTextAreaElement | null }) {
    valueRef.current = change.text
    // Match App.svelte's persistence boundary: accepted input is immediately
    // snapshotted from the live editor. Programmatic edits must already be in
    // the DOM, or this read replaces the new Draft with the previous value.
    const live = change.source?.value
    if (typeof live === 'string' && live !== valueRef.current) valueRef.current = live
    return true
  }

  function send() {
    if (!valueRef.current.trim()) return
    sent = [...sent, valueRef.current]
  }
</script>

<Composer
  {valueRef}
  {attachmentsRef}
  hint="⌘⏎ to Send"
  placeholder="Paste text…"
  onSend={send}
  onDraftChange={handleDraftChange}
  inputRef={{ get current() { return composer }, set current(next) { composer = next } }}
  composerToken={1}
/>
<output data-composer-value>{valueRef.current}</output>
<output data-sent-count>{sent.length}</output>
<output data-sent-value>{sent.at(-1) || ''}</output>
