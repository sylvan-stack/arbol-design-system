<script lang="ts">
  /* Set one Swimmer's Wall. */
  import { Modal, Button } from '@arbol/design-system'
  import { setSwimmerWall } from './data'
  import { type WallType } from './time'
  import WallPicker from './WallPicker.svelte'

  let { swimmerId, swimmerTitle, currentType, currentDueMs, onClose, onSaved, onError }:
    {
      swimmerId: string
      swimmerTitle: string
      currentType?: WallType
      currentDueMs?: number | null
      onClose: () => void
      onSaved: () => void
      onError: (msg: string) => void
    } = $props()

  let wallType = $state<WallType>(currentType ?? 'estimated')
  let dueAt = $state<number | null>(null)
  let busy = $state(false)
  const canSave = $derived(!busy && dueAt != null)

  async function save() {
    if (!canSave || dueAt == null) return
    busy = true
    try {
      await setSwimmerWall(swimmerId, { wallType, dueAt })
      onSaved()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not set wall')
    } finally {
      busy = false
    }
  }
</script>

<Modal title="Set wall" subtitle={swimmerTitle} onClose={onClose} width={560}>
  {#snippet children()}
    <WallPicker bind:wallType bind:dueAt currentDueMs={currentDueMs} />
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" disabled={!canSave} onclick={save}>{#snippet children()}{busy ? 'Saving…' : 'Set wall'}{/snippet}</Button>
  {/snippet}
</Modal>
