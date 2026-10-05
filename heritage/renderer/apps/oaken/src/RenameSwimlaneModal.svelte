<script lang="ts">
  /* Rename a swimlane. */
  import { Modal, Button, Field } from '@arbol/design-system'
  import { renameSwimlane } from './data'

  let { swimlaneId, current, onClose, onRenamed, onError }:
    { swimlaneId: string; current: string; onClose: () => void; onRenamed: () => void; onError: (msg: string) => void } = $props()

  let title = $state(current)
  let busy = $state(false)
  const canSave = $derived(!busy && !!title.trim())

  const inputStyle =
    'box-sizing:border-box;width:100%;height:32px;border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    'padding:0 9px;font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);outline:none'

  async function save() {
    if (!canSave) return
    busy = true
    try {
      await renameSwimlane(swimlaneId, title.trim())
      onRenamed()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not rename swimlane')
    } finally {
      busy = false
    }
  }
</script>

<Modal title="Rename swimlane" onClose={onClose} width={440}>
  {#snippet children()}
    <Field label="Title">
      {#snippet children()}
        <input style={inputStyle} value={title} placeholder="Swimlane title"
          oninput={(e) => (title = (e.currentTarget as HTMLInputElement).value)} />
      {/snippet}
    </Field>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" disabled={!canSave} onclick={save}>{#snippet children()}{busy ? 'Saving…' : 'Save'}{/snippet}</Button>
  {/snippet}
</Modal>
