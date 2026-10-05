<script lang="ts">
  /* Choose a Swimlane, then anchor a new Swimmer to the selected Entity. */
  import { onMount } from 'svelte'
  import { Modal, Button } from '@arbol/design-system'
  import {
    createSwimmerFromEntity,
    findAnchorAssignment,
    isEmptySwimlane,
    loadSwimlanes,
    type Swimlane,
    type SwimmerRootEntity,
  } from './data'

  let { entity, onClose, onCreated, onError, onOpenExisting }:
    {
      entity: SwimmerRootEntity
      onClose: () => void
      onCreated: (lane: Swimlane) => void
      onError: (msg: string) => void
      onOpenExisting?: (lane: Swimlane) => void
    } = $props()

  let lanes = $state<Swimlane[]>([])
  let selected = $state<string | null>(null)
  let loading = $state(true)
  let busy = $state(false)
  let loadError = $state<string | null>(null)

  const available = $derived(lanes.filter((lane) => lane.sid && !isEmptySwimlane(lane)))
  const selectedLane = $derived(available.find((lane) => lane.sid === selected) ?? null)
  const existing = $derived(findAnchorAssignment(lanes, entity))

  onMount(async () => {
    try {
      lanes = await loadSwimlanes()
      selected = lanes.find((lane) => lane.sid && !isEmptySwimlane(lane))?.sid ?? null
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Could not load swimlanes'
    } finally {
      loading = false
    }
  })

  async function create() {
    if (!selectedLane?.sid || busy || existing) return
    busy = true
    try {
      await createSwimmerFromEntity(selectedLane.sid, entity)
      onCreated(selectedLane)
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create swimmer')
    } finally {
      busy = false
    }
  }

  function openExisting() {
    if (!existing || !onOpenExisting) return
    onOpenExisting(existing.swimlane)
    onClose()
  }
</script>

<Modal title="Create swimmer" subtitle={`Anchor a new swimmer to “${entity.title}”`} onClose={onClose} width={520}>
  {#snippet children()}
    {#if loading}
      <div class="swimlane-picker-state">Loading swimlanes…</div>
    {:else if loadError}
      <div class="swimlane-picker-state error">{loadError}</div>
    {:else if existing}
      <div class="swimlane-picker-state anchored">
        <strong>This entity already anchors a swimmer.</strong>
        <span>{existing.swimmer.nm} · Swimlane {existing.swimlane.n}{existing.swimlane.tkt ? ` · ${existing.swimlane.tkt}` : ''}</span>
        <small>An anchor entity is unique on this Swimlanes board. It can still be added to other swimmers as a linked entity.</small>
      </div>
    {:else if available.length === 0}
      <div class="swimlane-picker-state">
        <strong>No available swimlanes.</strong>
        <span>Create a swimlane first; this Entity will become its first Swimmer’s anchor.</span>
      </div>
    {:else}
      <div class="anchor-note"><strong>Anchor entity</strong><span>The entity that gives this swimmer its unique identity on the board.</span></div>
      <div class="swimlane-picker-list" role="radiogroup" aria-label="Available swimlanes">
        {#each available as lane (lane.sid)}
          <button
            type="button"
            class:selected={selected === lane.sid}
            role="radio"
            aria-checked={selected === lane.sid}
            onclick={() => (selected = lane.sid ?? null)}
          >
            <span class="swimlane-picker-slot">SWIMLANE {lane.n}</span>
            <strong>{lane.tkt ?? `Swimlane ${lane.n}`}</strong>
            <small>{lane.swimmers?.length ?? 0} {(lane.swimmers?.length ?? 0) === 1 ? 'swimmer' : 'swimmers'}</small>
          </button>
        {/each}
      </div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    {#if existing && onOpenExisting}
      <Button kind="primary" onclick={openExisting}>{#snippet children()}Open existing swimmer{/snippet}</Button>
    {:else}
      <Button kind="primary" disabled={!selectedLane || busy || !!existing} onclick={create}>
        {#snippet children()}{busy ? 'Creating…' : 'Create swimmer'}{/snippet}
      </Button>
    {/if}
  {/snippet}
</Modal>

<style>
  .swimlane-picker-state {
    min-height: 90px; display: flex; flex-direction: column; justify-content: center;
    align-items: center; gap: 7px; text-align: center; color: var(--arbol-color-text-muted);
  }
  .swimlane-picker-state strong { color: var(--arbol-color-text); }
  .swimlane-picker-state.error { color: var(--arbol-color-err); }
  .swimlane-picker-state.anchored { padding: 12px 18px; border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-m); background: var(--arbol-color-surface-2); }
  .swimlane-picker-state.anchored small { max-width: 410px; line-height: 1.45; }
  .anchor-note { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; padding: 8px 10px; border-radius: var(--arbol-radius-s); background: var(--arbol-color-surface-2); }
  .anchor-note strong { flex: none; font-size: var(--arbol-type-label); color: var(--arbol-color-text); }
  .anchor-note span { font-size: var(--arbol-type-label); color: var(--arbol-color-text-muted); }
  .swimlane-picker-list { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow: auto; }
  .swimlane-picker-list button {
    display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; align-items: center; gap: 10px;
    width: 100%; padding: 12px; cursor: pointer; text-align: left;
    border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-surface-2); color: var(--arbol-color-text);
  }
  .swimlane-picker-list button:hover { border-color: var(--arbol-color-accent); }
  .swimlane-picker-list button.selected {
    border-color: var(--arbol-color-accent); background: var(--arbol-color-accent-soft);
    box-shadow: inset 3px 0 0 var(--arbol-color-accent);
  }
  .swimlane-picker-slot {
    font: 600 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono);
    color: var(--arbol-color-text-muted); letter-spacing: .45px;
  }
  .swimlane-picker-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .swimlane-picker-list small { color: var(--arbol-color-text-muted); white-space: nowrap; }
</style>
