<script lang="ts">
  /* New Swimlane modal (Oaken header "+ New Swimlane" and board context menu).
   * Entities are picked through the standard native Entity Search popup —
   * no manual keys or links. The first picked Entity is the MAIN one: it
   * anchors Swimmer 1 and Core infers the Swimmer's start/wall from it when
   * the Entity carries time data (e.g. a Graft's wall). Companion Entities
   * are attached to Swimmer 1 after creation. */
  import { onMount } from 'svelte'
  import { Modal, Button, Field, EntityChip, callNative } from '@arbol/design-system'
  import { createSwimlaneFromPickedEntities, findAnchorAssignment, loadSwimlanes, type Swimlane } from './data'
  import { addPickedEntity, makeMainEntity, parsePickedEntity, removePickedEntity, type PickedEntity } from './newSwimlane'

  let { onClose, onCreated, onError, targetSlot }:
    { onClose: () => void; onCreated: () => void; onError: (msg: string) => void; targetSlot?: number } = $props()

  let entities = $state<PickedEntity[]>([])
  let title = $state('')
  let busy = $state(false)
  let boardSwimlanes = $state<Swimlane[]>([])

  const main = $derived(entities[0] ?? null)
  const existingAnchor = $derived(
    main ? findAnchorAssignment(boardSwimlanes, { kind: main.kind, ref: main.entityId }) : null,
  )
  const canCreate = $derived(!busy && !!main && !existingAnchor)

  onMount(async () => {
    boardSwimlanes = await loadSwimlanes()
  })

  $effect(() => {
    const onPicked = (event: Event) => {
      const picked = parsePickedEntity((event as CustomEvent).detail)
      if (picked) entities = addPickedEntity(entities, picked)
    }
    window.addEventListener('arbol-oaken-entity-picked', onPicked)
    return () => window.removeEventListener('arbol-oaken-entity-picked', onPicked)
  })

  async function pickEntity() {
    try {
      await callNative('app.showEntitySearchForNewSwimlane', {})
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not open Entity Search')
    }
  }

  const inputStyle =
    'box-sizing:border-box;width:100%;height:32px;border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    'padding:0 9px;font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);outline:none'
  const rowBtnStyle =
    'cursor:pointer;background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);color:var(--arbol-color-text-muted);padding:2px 7px;' +
    'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap'

  async function create() {
    if (!canCreate || !main) return
    busy = true
    try {
      const { attachFailures } = await createSwimlaneFromPickedEntities(main, entities.slice(1), {
        title: title.trim(),
        slot: targetSlot,
      })
      if (attachFailures > 0) {
        onError(`Swimlane created, but ${attachFailures} ${attachFailures === 1 ? 'entity' : 'entities'} could not be attached`)
      }
      onCreated()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create swimlane')
    } finally {
      busy = false
    }
  }
</script>

<Modal title="New Swimlane" subtitle={targetSlot != null ? `Slot ${targetSlot} · a workstream you curate — finished when you decide` : 'A workstream you curate — finished when you decide'} onClose={onClose} width={520}>
  {#snippet children()}
    <div style="display:flex;flex-direction:column;gap:var(--arbol-space-4)">
      <div>
        <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);
                    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Entities</div>
        {#if entities.length}
          <div style="display:flex;flex-direction:column;gap:var(--arbol-space-2);margin-bottom:var(--arbol-space-2)">
            {#each entities as e, i (e.repo + ':' + e.kind + ':' + e.entityId)}
              <div style="display:flex;align-items:center;gap:var(--arbol-space-2);min-width:0;padding:6px 8px;
                          border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                          background:var(--arbol-color-surface-2)">
                {#if i === 0}
                  <span style="flex:none;font:700 10px/1 var(--arbol-font-mono);letter-spacing:0.5px;
                               color:var(--arbol-color-accent);border:1px solid color-mix(in oklch, var(--arbol-color-accent) 55%, var(--arbol-color-border));
                               background:var(--arbol-color-accent-soft);border-radius:var(--arbol-radius-s);padding:3px 6px"
                        title="Anchors Swimmer 1 · the Swimlane wall is inferred from this Entity">MAIN</span>
                {/if}
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  <EntityChip uri={e.uri} />
                </span>
                <span style="flex:none;font:500 10.5px/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)">{e.repo}</span>
                {#if i > 0}
                  <button type="button" style={rowBtnStyle} title="Make this the main Entity"
                    onclick={() => (entities = makeMainEntity(entities, i))}>Main</button>
                {/if}
                <button type="button" style={rowBtnStyle} title="Remove from the new Swimlane"
                  onclick={() => (entities = removePickedEntity(entities, i))}>✕</button>
              </div>
            {/each}
          </div>
        {/if}
        <button type="button" onclick={pickEntity}
          style="cursor:pointer;width:100%;text-align:left;padding:var(--arbol-space-3);border-radius:var(--arbol-radius-m);
                 border:1px dashed var(--arbol-color-border);background:var(--arbol-color-surface-2);
                 color:var(--arbol-color-text);font:600 var(--arbol-type-body)/1.1 var(--arbol-font-ui)">
          ＋ Add Entity via Entity Search…
        </button>
        <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);line-height:1.4">
          The first Entity is the main one — it anchors Swimmer 1, and the Swimlane wall is inferred from it (e.g. a Graft's wall).
        </div>
        {#if existingAnchor}
          <div style="margin-top:var(--arbol-space-2);padding:8px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);line-height:1.4">
            <strong style="color:var(--arbol-color-text)">Already anchored.</strong>
            This entity anchors “{existingAnchor.swimmer.nm}” in Swimlane {existingAnchor.swimlane.n} and cannot anchor another swimmer on this board.
          </div>
        {/if}
      </div>

      <Field label="Title">
        {#snippet children()}
          <input style={inputStyle} value={title} placeholder={main ? `Defaults to “${main.title}”` : 'What is this swimlane about?'}
            oninput={(e) => (title = (e.currentTarget as HTMLInputElement).value)} />
        {/snippet}
      </Field>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" disabled={!canCreate} onclick={create}>{#snippet children()}{busy ? 'Creating…' : existingAnchor ? 'Already anchored' : 'Create swimlane'}{/snippet}</Button>
  {/snippet}
</Modal>
