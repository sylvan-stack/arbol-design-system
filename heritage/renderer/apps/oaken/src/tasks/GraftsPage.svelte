<script lang="ts">
  /* Grafts — Arbol-native work items (no external ticket). Simple tracker:
   * title, description, type, planned start, and optional urgency (wall_type +
   * due time via the shared WallPicker). Reuses the Jira card language. */
  import { onMount } from 'svelte'
  import { ENTITIES, EntityChip, entityLinkTarget, type EntityLinkReference, formatEntityUri, parseEntityUri, type EntityKind, type EntityUri, type GraftSource } from '@arbol/design-system'
  import { createSwimlaneFromEntity, findAnchorAssignment, loadSwimlanes, type EntityItem, type Swimlane, type SwimmerRootEntity } from '../data'
  import SwimlanePickerModal from '../SwimlanePickerModal.svelte'
  import { WICON, WALL, type WallType } from '../time'
  import GraftModal from './GraftModal.svelte'
  import {
    GRAFT_TYPES,
    deleteGraft,
    graftTypeLabel,
    loadGrafts,
    setGraftStatus,
    type Graft,
    type GraftLinkedEntity,
  } from './grafts'

  let { onSwimlaneCreated, onSwimmerCreated, onOpenSwimlane, onGraftSaved, createSource = null, createRequestId = 0, onCreateRequestHandled }:
    {
      onSwimlaneCreated: (label: string) => void
      onSwimmerCreated: (label: string) => void
      onOpenSwimlane: (lane: Swimlane) => void
      onGraftSaved: () => void
      createSource?: GraftSource | null
      createRequestId?: number
      onCreateRequestHandled: () => void
    } = $props()

  let grafts = $state<Graft[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let query = $state('')
  let typeFilter = $state<string>('')
  let showDone = $state(false)
  let editing = $state<Graft | null>(null)
  let creating = $state(false)
  let creatingSource = $state<GraftSource | null>(null)
  let busyIds = $state<Record<string, boolean>>({})
  let expandedIds = $state<Record<string, boolean>>({})
  let boardSwimlanes = $state<Swimlane[]>([])
  let actionError = $state<string | null>(null)
  let swimmerEntity = $state<SwimmerRootEntity | null>(null)

  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase()
    return grafts.filter((g) => {
      if (!showDone && g.status === 'done') return false
      if (typeFilter && g.graft_type !== typeFilter) return false
      if (!needle) return true
      return [g.title, g.description, g.graft_type].some((v) => v.toLocaleLowerCase().includes(needle))
    })
  })
  const openCount = $derived(grafts.filter((g) => g.status === 'open').length)
  const doneCount = $derived(grafts.length - openCount)
  const anchorById = $derived(new Map(grafts.map((g) => [
    g.graft_id,
    findAnchorAssignment(boardSwimlanes, { kind: 'graft', ref: g.graft_id }),
  ])))

  $effect(() => {
    createRequestId
    if (createSource) {
      creatingSource = createSource
      creating = true
      onCreateRequestHandled()
    }
  })

  async function refreshBoard() {
    boardSwimlanes = await loadSwimlanes()
  }

  async function refresh() {
    loading = true
    error = null
    try {
      grafts = await loadGrafts()
      await refreshBoard()
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
    } finally {
      loading = false
    }
  }

  async function act(g: Graft, run: () => Promise<void>) {
    if (busyIds[g.graft_id]) return
    busyIds = { ...busyIds, [g.graft_id]: true }
    actionError = null
    try {
      await run()
      await refresh()
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
    } finally {
      busyIds = { ...busyIds, [g.graft_id]: false }
    }
  }

  function createEntitySwimlane(g: Graft) {
    if (anchorById.get(g.graft_id)) return
    void act(g, async () => {
      await createSwimlaneFromEntity({
        kind: 'graft',
        ref: g.graft_id,
        title: g.title,
        startAt: g.start_at,
        finishAt: g.due_at,
        wallType: g.wall_type,
      })
      await refreshBoard()
      onSwimlaneCreated(`graft “${g.title}”`)
    })
  }

  function chooseSwimlaneFor(g: Graft) {
    if (anchorById.get(g.graft_id)) return
    swimmerEntity = {
      kind: 'graft', ref: g.graft_id, title: g.title,
      startAt: g.start_at,
      finishAt: g.due_at, wallType: g.wall_type,
    }
  }

  function anchorTitle(g: Graft): string {
    const assignment = anchorById.get(g.graft_id)
    if (!assignment) return 'Use this graft as the unique anchor entity for a swimmer'
    return `Already anchors “${assignment.swimmer.nm}” in Swimlane ${assignment.swimlane.n}`
  }

  function graftSaved() {
    void refresh()
    // The core also updates an active Swimmer rooted on this Graft. Refresh the
    // App-owned board collection so returning to Swimlanes shows the new wall.
    onGraftSaved()
  }

  function toggleDone(g: Graft) {
    void act(g, () => setGraftStatus(g.graft_id, g.status === 'done' ? 'open' : 'done'))
  }

  function remove(g: Graft) {
    if (!window.confirm(`Delete graft “${g.title}”? This cannot be undone.`)) return
    void act(g, () => deleteGraft(g.graft_id))
  }

  function toggleExpanded(graftId: string) {
    expandedIds = { ...expandedIds, [graftId]: !expandedIds[graftId] }
  }

  function activateCard(event: KeyboardEvent, graftId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleExpanded(graftId)
  }

  function fmtDue(ms: number): string {
    return new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  function fmtFull(ms: number): string {
    return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  }
  const overdue = (g: Graft) => g.status === 'open' && g.due_at != null && g.due_at < Date.now()
  const wallColor = (t: WallType) => WALL[t] ?? WALL.due

  function graftLinkTarget(g: Graft): EntityLinkReference {
    return { repo: 'Arbol', kind: 'graft', entityId: g.graft_id, title: g.title }
  }

  function sourceUri(g: Graft): EntityUri | null {
    if (!g.source_repo || !g.source_kind || !g.source_entity_id) return null
    if (!ENTITIES.ORDER.includes(g.source_kind as EntityKind)) return null
    try {
      return formatEntityUri({
        repo: g.source_repo as Parameters<typeof formatEntityUri>[0]['repo'],
        kind: g.source_kind as EntityKind,
        entityId: g.source_entity_id,
        title: g.source_title || g.source_entity_id,
      })
    } catch {
      return null
    }
  }

  function itemUri(item: EntityItem, index: number): EntityUri {
    if (item.uri) return item.uri
    return formatEntityUri({
      repo: 'Arbol',
      kind: item.kind,
      entityId: item.entityId || `linked-${index}`,
      title: item.title,
    })
  }

  function linkedEntityUri(entity: GraftLinkedEntity): EntityUri | null {
    if (entity.uri) {
      const parsed = parseEntityUri(entity.uri)
      if (parsed.ok) return parsed.value.uri
    }
    if (!ENTITIES.ORDER.includes(entity.kind as EntityKind)) return null
    try {
      return formatEntityUri({
        repo: entity.repo as Parameters<typeof formatEntityUri>[0]['repo'],
        kind: entity.kind as EntityKind,
        entityId: entity.entity_id,
        title: entity.title || entity.entity_id,
      })
    } catch {
      return null
    }
  }

  onMount(refresh)
</script>

<div class="jira-page">
  <header class="jira-page-heading">
    <div>
      <div class="jira-kicker">Tasks · Grafts</div>
      <h1>Grafts</h1>
      <p>Arbol-native work items — work grafted onto the tree with no Jira ticket behind it. Planned start and urgency become the timeline of a Swimmer created from the Graft.</p>
    </div>
    <div class="jira-tools">
      <label>
        <span class="sr-only">Search grafts</span>
        <input bind:value={query} type="search" placeholder="Search grafts…" />
      </label>
      <button onclick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      <button class="graft-new" onclick={() => { creatingSource = null; creating = true }}>New graft</button>
    </div>
  </header>

  {#if actionError}<div class="jira-action-notice error" role="alert">{actionError}<button onclick={() => (actionError = null)} aria-label="Dismiss">×</button></div>{/if}

  {#if error}
    <div class="jira-state error">
      <strong>Could not load grafts.</strong>
      <span>{error}</span>
      <button onclick={refresh}>Try again</button>
    </div>
  {:else if loading && grafts.length === 0}
    <div class="jira-state"><span class="jira-spinner"></span>Loading grafts…</div>
  {:else if grafts.length === 0}
    <div class="jira-state">
      <strong>No grafts yet.</strong>
      <span>Capture Arbol-internal work that has no Jira ticket.</span>
      <button onclick={() => (creating = true)}>New graft</button>
    </div>
  {:else}
    <div class="jira-filter-bar" aria-label="Graft filters">
      <span class="jira-filter-label">Filters</span>
      <select class="graft-type-filter" bind:value={typeFilter} aria-label="Filter by type">
        <option value="">All types</option>
        {#each GRAFT_TYPES as t}<option value={t.id}>{t.label}</option>{/each}
      </select>
      <label class="jira-toggle" class:checked={showDone}>
        <input bind:checked={showDone} type="checkbox" />
        <span aria-hidden="true"><i></i></span>
        <strong>Show done ({doneCount})</strong>
      </label>
      <span class="jira-filter-result">{filtered.length} of {grafts.length} · {openCount} open</span>
    </div>

    <div class="jira-list graft-list">
      {#each filtered as g (g.graft_id)}
        {@const anchor = anchorById.get(g.graft_id)}
        {@const source = sourceUri(g)}
        {@const linkedItems = anchor?.swimmer.items ?? []}
        {@const relatedEntities = g.linked_entities ?? []}
        <article class="jira-ticket graft-card" class:graft-done={g.status === 'done'} class:expanded={expandedIds[g.graft_id]} use:entityLinkTarget={graftLinkTarget(g)}>
          <div
            class="jira-ticket-main graft-main graft-card-summary"
            role="button"
            tabindex="0"
            aria-expanded={expandedIds[g.graft_id] ?? false}
            aria-controls={`graft-details-${g.graft_id}`}
            onclick={() => toggleExpanded(g.graft_id)}
            onkeydown={(event) => activateCard(event, g.graft_id)}
          >
            <div class="jira-ticket-id">
              <span class="graft-tag"><i class="graft-chevron" aria-hidden="true">›</i> ⋎ GRAFT</span>
              <small>{graftTypeLabel(g.graft_type)}</small>
            </div>

            <div class="jira-ticket-copy">
              <h3>{g.title}</h3>
              {#if g.description}<p class="clamped">{g.description}</p>{/if}
              <p class="graft-start">Starts {fmtDue(g.start_at)}</p>
            </div>

            <div class="jira-status">
              <small>Urgency</small>
              {#if g.wall_type != null && g.due_at != null}
                <span class="graft-wall" style={`--graft-wall:${wallColor(g.wall_type)}`}>
                  <i></i>{WICON[g.wall_type]} {g.wall_type}
                </span>
                <em class:graft-overdue={overdue(g)}>{overdue(g) ? 'Overdue · ' : ''}{fmtDue(g.due_at)}</em>
              {:else}
                <span><i></i>backlog</span>
              {/if}
            </div>

            <div class="jira-status">
              <small>Status</small>
              <span class={g.status === 'done' ? 'done' : 'active'}><i></i>{g.status}</span>
            </div>
          </div>

          {#if expandedIds[g.graft_id]}
            <section class="graft-details" id={`graft-details-${g.graft_id}`} aria-label={`${g.title} details`}>
              <div class="graft-details-primary">
                <div class="graft-detail-section">
                  <h4>Description</h4>
                  <p class:graft-empty={!g.description}>{g.description || 'No description provided.'}</p>
                </div>

                <div class="graft-detail-section">
                  <div class="graft-detail-heading">
                    <h4>Linked entities</h4>
                    <span>{(source ? 1 : 0) + relatedEntities.length + linkedItems.length}</span>
                  </div>
                  {#if source || relatedEntities.length > 0 || linkedItems.length > 0}
                    <div class="graft-entity-groups">
                      {#if source}
                        <div class="graft-entity-group">
                          <small>Source entity</small>
                          <EntityChip uri={source} onNavigationError={(value) => (actionError = value.message)} />
                        </div>
                      {/if}
                      {#if relatedEntities.length > 0}
                        <div class="graft-entity-group">
                          <small>Related entities</small>
                          <div class="graft-entity-list">
                            {#each relatedEntities as entity (`${entity.kind}-${entity.entity_id}`)}
                              {@const uri = linkedEntityUri(entity)}
                              {#if uri}
                                <EntityChip {uri} onNavigationError={(value) => (actionError = value.message)} />
                              {:else}
                                <span class="graft-linked-unavailable">{entity.title || entity.entity_id}</span>
                              {/if}
                            {/each}
                          </div>
                        </div>
                      {/if}
                      {#if linkedItems.length > 0}
                        <div class="graft-entity-group">
                          <small>Attached to swimmer</small>
                          <div class="graft-entity-list">
                            {#each linkedItems as item, index (`${item.kind}-${item.entityId ?? index}`)}
                              <EntityChip uri={itemUri(item, index)} onNavigationError={(value) => (actionError = value.message)} />
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <p class="graft-empty">No entities are linked to this Graft.</p>
                  {/if}
                </div>

                {#if anchor}
                  <div class="graft-detail-section graft-swimmer-link">
                    <div>
                      <h4>Anchored swimmer</h4>
                      <p><strong>{anchor.swimmer.nm}</strong> · {anchor.swimlane.tkt ?? `Swimlane ${anchor.swimlane.n}`}</p>
                    </div>
                    <button onclick={() => onOpenSwimlane(anchor.swimlane)}>Open swimmer</button>
                  </div>
                {/if}
              </div>

              <dl class="graft-details-meta">
                <div><dt>Graft ID</dt><dd><code>{g.graft_id}</code></dd></div>
                <div><dt>Type</dt><dd>{graftTypeLabel(g.graft_type)}</dd></div>
                <div><dt>Status</dt><dd>{g.status}</dd></div>
                <div><dt>Planned start</dt><dd><time datetime={new Date(g.start_at).toISOString()}>{fmtFull(g.start_at)}</time></dd></div>
                <div><dt>Urgency</dt><dd>{g.wall_type ? `${WICON[g.wall_type]} ${g.wall_type}` : 'Backlog'}</dd></div>
                {#if g.due_at != null}<div><dt>Due</dt><dd class:graft-overdue={overdue(g)}><time datetime={new Date(g.due_at).toISOString()}>{fmtFull(g.due_at)}</time></dd></div>{/if}
                {#if g.source_repo}<div><dt>Source repository</dt><dd>{g.source_repo}</dd></div>{/if}
                {#if g.source_kind}<div><dt>Source kind</dt><dd>{g.source_kind}</dd></div>{/if}
                {#if g.source_entity_id}<div><dt>Source entity ID</dt><dd><code>{g.source_entity_id}</code></dd></div>{/if}
                <div><dt>Created</dt><dd><time datetime={new Date(g.created_at).toISOString()}>{fmtFull(g.created_at)}</time></dd></div>
                <div><dt>Updated</dt><dd><time datetime={new Date(g.updated_at).toISOString()}>{fmtFull(g.updated_at)}</time></dd></div>
              </dl>
            </section>
          {/if}

          <footer>
            <div class="jira-ticket-actions" aria-label={`${g.title} actions`}>
              <button class="create-swimlane" title={anchorTitle(g)} onclick={() => createEntitySwimlane(g)} disabled={busyIds[g.graft_id] || !!anchor}>
                {busyIds[g.graft_id] ? 'Creating…' : anchor ? 'Already anchored' : 'Create swimlane'}
              </button>
              <button class="create-swimmer" title={anchorTitle(g)} onclick={() => chooseSwimlaneFor(g)} disabled={busyIds[g.graft_id] || !!anchor}>
                {anchor ? `Anchored in Swimlane ${anchor.swimlane.n}` : 'Create swimmer'}
              </button>
              {#if anchor}
                <button class="open-swimmer" onclick={() => onOpenSwimlane(anchor.swimlane)}>Open swimmer</button>
              {/if}
              <button onclick={() => (editing = g)} disabled={busyIds[g.graft_id]}>Edit</button>
              <button onclick={() => toggleDone(g)} disabled={busyIds[g.graft_id]}>
                {g.status === 'done' ? 'Reopen' : 'Done'}
              </button>
              <button class="danger" onclick={() => remove(g)} disabled={busyIds[g.graft_id]}>Delete</button>
            </div>
            <time datetime={new Date(g.updated_at).toISOString()}>Updated {fmtDue(g.updated_at)}</time>
          </footer>
        </article>
      {/each}
      {#if filtered.length === 0}
        <div class="jira-section-empty">No grafts match the active filters.</div>
      {/if}
    </div>
  {/if}
</div>

{#if creating}
  <GraftModal source={creatingSource} initialTitle={creatingSource?.title ?? ''} onClose={() => { creating = false; creatingSource = null }} onSaved={graftSaved} onError={(msg) => (actionError = msg)} />
{:else if editing}
  <GraftModal graft={editing} onClose={() => (editing = null)} onSaved={graftSaved} onError={(msg) => (actionError = msg)} />
{/if}

{#if swimmerEntity}
  <SwimlanePickerModal
    entity={swimmerEntity}
    onClose={() => (swimmerEntity = null)}
    onCreated={(lane) => {
      void refreshBoard()
      onSwimmerCreated(`graft “${swimmerEntity?.title ?? 'Graft'}” in ${lane.tkt ?? `Swimlane ${lane.n}`}`)
    }}
    onError={(msg) => (actionError = msg)}
    onOpenExisting={onOpenSwimlane}
  />
{/if}
