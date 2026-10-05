<script lang="ts">
  import { untrack } from 'svelte'
  /* Standard New Graft popup. It can create a standalone Graft or wrap any
   * canonical Arbol Entity by persisting its composite Entity identity. */
  import Modal from '../overlay/Modal.svelte'
  import Button from '../components/Button.svelte'
  import Field from '../components/Field.svelte'
  import TimePicker from './TimePicker.svelte'
  import WallPicker from './WallPicker.svelte'
  import { createGraft, type Graft, type GraftSource } from './grafts'
  import type { WallType } from './time'

  let {
    source = null,
    initialTitle = '',
    initialDescription = '',
    onClose,
    onSaved,
    onError,
  }: {
    source?: GraftSource | null
    initialTitle?: string
    initialDescription?: string
    onClose: () => void
    onSaved?: (graft: Graft) => void
    onError: (message: string) => void
  } = $props()

  const pad = (number: number) => String(number).padStart(2, '0')
  function defaultStart(): number {
    const date = new Date()
    date.setSeconds(0, 0)
    date.setMinutes(Math.ceil(date.getMinutes() / 10) * 10)
    return date.getTime()
  }
  function toDateInput(ms: number): string {
    const date = new Date(ms)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  function toTimeInput(ms: number): string {
    const date = new Date(ms)
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const initialStart = defaultStart()
  let title = $state(untrack(() => initialTitle))
  let description = $state(untrack(() => initialDescription))
  // Grafts are currently created as containers. Keep the persisted type field so
  // specialized types can be reintroduced without a schema migration.
  const graftType = 'container'
  let startDate = $state(toDateInput(initialStart))
  let startTime = $state(toTimeInput(initialStart))
  let hasUrgency = $state(false)
  let wallType = $state<WallType>('estimated')
  let dueAt = $state<number | null>(null)
  let busy = $state(false)

  const startAt = $derived.by<number | null>(() => {
    if (!startDate || !startTime) return null
    const value = new Date(`${startDate}T${startTime}`).getTime()
    return Number.isFinite(value) ? value : null
  })
  const startAfterWall = $derived(startAt != null && dueAt != null && startAt > dueAt)
  const canSave = $derived(
    !busy && !!title.trim() && startAt != null && (!hasUrgency || dueAt != null) && !startAfterWall,
  )

  const inputStyle =
    'box-sizing:border-box;width:100%;height:32px;border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    'padding:0 9px;font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);outline:none'
  const areaStyle =
    'box-sizing:border-box;width:100%;min-height:72px;resize:vertical;border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    'padding:7px 9px;font:500 var(--arbol-type-body)/1.4 var(--arbol-font-ui);outline:none'
  const chip = (on: boolean) =>
    `cursor:pointer;padding:6px 11px;border-radius:999px;white-space:nowrap;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);` +
    `border:1px solid ${on ? 'color-mix(in oklch, var(--arbol-color-accent) 55%, var(--arbol-color-border))' : 'var(--arbol-color-border)'};` +
    `background:${on ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};color:${on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text)'}`

  async function save() {
    if (!canSave || startAt == null) return
    busy = true
    try {
      const graft = await createGraft({
        title: title.trim(),
        description: description.trim(),
        graftType,
        startAt,
        wallType: hasUrgency ? wallType : null,
        dueAt: hasUrgency ? dueAt : null,
      }, source)
      onSaved?.(graft)
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save the graft')
    } finally {
      busy = false
    }
  }
</script>

<Modal title="New graft" subtitle={source ? `From ${source.kind}` : 'Arbol-native work item'} onClose={onClose} width={560}>
  {#snippet children()}
    <div style="display:flex;flex-direction:column;gap:var(--arbol-space-4)">
      {#if source}
        <div style="padding:8px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2);font:500 var(--arbol-type-label)/1.4 var(--arbol-font-ui);color:var(--arbol-color-text-muted)">
          Wrapping <b style="color:var(--arbol-color-text)">{source.title || `${source.kind} ${source.entityId}`}</b>
        </div>
      {/if}
      <Field label="Title">{#snippet children()}<input style={inputStyle} value={title} placeholder="What needs doing?" oninput={(event) => (title = (event.currentTarget as HTMLInputElement).value)} />{/snippet}</Field>
      <Field label="Description">{#snippet children()}<textarea style={areaStyle} value={description} placeholder="Optional context — why, links, notes" oninput={(event) => (description = (event.currentTarget as HTMLTextAreaElement).value)}></textarea>{/snippet}</Field>


      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Start date & time</div>
        <div style="display:flex;gap:var(--arbol-space-3)">
          <div style="flex:1.4;min-width:0"><Field label="Date">{#snippet children()}<input type="date" style={inputStyle} value={startDate} oninput={(event) => (startDate = (event.currentTarget as HTMLInputElement).value)} />{/snippet}</Field></div>
          <div style="flex:1;min-width:0"><Field label="Time">{#snippet children()}<TimePicker value={startTime} onChange={(value) => (startTime = value)} />{/snippet}</Field></div>
        </div>
        <div style="margin-top:6px;font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">This is where the Graft's Swimmer begins on the Swimlanes board timeline.</div>
      </div>

      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Urgency</div>
        <div style="display:flex;gap:var(--arbol-space-2);margin-bottom:var(--arbol-space-3)">
          <button type="button" onclick={() => (hasUrgency = false)} style={chip(!hasUrgency)}>No urgency — backlog</button>
          <button type="button" onclick={() => (hasUrgency = true)} style={chip(hasUrgency)}>Set urgency…</button>
        </div>
        {#if hasUrgency}
          <WallPicker bind:wallType bind:dueAt />
          {#if startAfterWall}<div style="margin-top:7px;font-size:var(--arbol-type-label);color:var(--arbol-color-err)">Start date & time must not be after the Wall.</div>{/if}
        {/if}
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" disabled={!canSave} onclick={save}>{#snippet children()}{busy ? 'Saving…' : 'Create graft'}{/snippet}</Button>
  {/snippet}
</Modal>
