<script lang="ts">
  /* Create/edit one Graft: title, description, type, planned start, and optional
   * urgency. The planned start is copied to a Swimmer when the Graft is added to
   * the Swimlanes board; urgency becomes that Swimmer's Wall. */
  import { Modal, Button, Field, GraftModal as StandardGraftModal, GraftTimePicker, GraftWallPicker, type GraftSource } from '@arbol/design-system'
  import { type WallType } from '../time'
  import { GRAFT_TYPES, createGraft, updateGraft, type Graft, type GraftType } from './grafts'

  let { graft = null, source = null, initialTitle = '', onClose, onSaved, onError }:
    {
      graft?: Graft | null
      source?: GraftSource | null
      initialTitle?: string
      onClose: () => void
      onSaved: () => void
      onError: (msg: string) => void
    } = $props()

  const pad = (n: number) => String(n).padStart(2, '0')
  function defaultStart(): number {
    const d = new Date()
    d.setSeconds(0, 0)
    // Match TimePicker's ten-minute choices while still defaulting to the next
    // usable instant rather than silently choosing a time in the past.
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10)
    return d.getTime()
  }
  function toDateInput(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  function toTimeInput(ms: number): string {
    const d = new Date(ms)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const initialStart = graft?.start_at ?? defaultStart()
  let title = $state(graft?.title ?? '')
  let description = $state(graft?.description ?? '')
  let graftType = $state<GraftType>(graft?.graft_type ?? 'subtask')
  let startDate = $state(toDateInput(initialStart))
  let startTime = $state(toTimeInput(initialStart))
  let hasUrgency = $state(graft?.wall_type != null)
  let wallType = $state<WallType>(graft?.wall_type ?? 'estimated')
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
      const draft = {
        title: title.trim(),
        description: description.trim(),
        graftType,
        startAt,
        wallType: hasUrgency ? wallType : null,
        dueAt: hasUrgency ? dueAt : null,
      }
      if (graft) await updateGraft(graft.graft_id, draft)
      else await createGraft(draft)
      onSaved()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the graft')
    } finally {
      busy = false
    }
  }
</script>

{#if !graft}
  <StandardGraftModal {source} {initialTitle} {onClose} {onSaved} {onError} />
{:else}
<Modal title="Edit graft" subtitle={graft.title} onClose={onClose} width={560}>
  {#snippet children()}
    <div style="display:flex;flex-direction:column;gap:var(--arbol-space-4)">
      <Field label="Title">
        {#snippet children()}
          <input style={inputStyle} value={title} placeholder="What needs doing?"
            oninput={(e) => (title = (e.currentTarget as HTMLInputElement).value)} />
        {/snippet}
      </Field>

      <Field label="Description">
        {#snippet children()}
          <textarea style={areaStyle} value={description} placeholder="Optional context — why, links, notes"
            oninput={(e) => (description = (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
        {/snippet}
      </Field>

      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);
                    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Type</div>
        <div style="display:flex;flex-wrap:wrap;gap:var(--arbol-space-2)">
          {#each GRAFT_TYPES as t}
            <button type="button" onclick={() => (graftType = t.id)} style={chip(t.id === graftType)}>{t.label}</button>
          {/each}
        </div>
      </div>

      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);
                    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Start date & time</div>
        <div style="display:flex;gap:var(--arbol-space-3)">
          <div style="flex:1.4;min-width:0">
            <Field label="Date">
              {#snippet children()}
                <input type="date" style={inputStyle} value={startDate}
                  oninput={(e) => (startDate = (e.currentTarget as HTMLInputElement).value)} />
              {/snippet}
            </Field>
          </div>
          <div style="flex:1;min-width:0">
            <Field label="Time">
              {#snippet children()}
                <GraftTimePicker value={startTime} onChange={(v) => (startTime = v)} />
              {/snippet}
            </Field>
          </div>
        </div>
        <div style="margin-top:6px;font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">
          This is where the Graft's Swimmer begins on the Swimlanes board timeline.
        </div>
      </div>

      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);
                    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Urgency</div>
        <div style="display:flex;gap:var(--arbol-space-2);margin-bottom:var(--arbol-space-3)">
          <button type="button" onclick={() => (hasUrgency = false)} style={chip(!hasUrgency)}>No urgency — backlog</button>
          <button type="button" onclick={() => (hasUrgency = true)} style={chip(hasUrgency)}>Set urgency…</button>
        </div>
        {#if hasUrgency}
          <GraftWallPicker bind:wallType bind:dueAt currentDueMs={graft?.due_at ?? null} />
          {#if startAfterWall}
            <div style="margin-top:7px;font-size:var(--arbol-type-label);color:var(--arbol-color-err)">
              Start date & time must not be after the Wall.
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" disabled={!canSave} onclick={save}>{#snippet children()}{busy ? 'Saving…' : graft ? 'Save graft' : 'Create graft'}{/snippet}</Button>
  {/snippet}
</Modal>
{/if}
