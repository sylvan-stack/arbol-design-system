<script lang="ts">
  /* Oaken root (Svelte 5; ux-ui-guide Part 2). Shared-chrome window with two
   * pages: board (Swimlanes) + details (Swimlane Details), drill-down by title.
   * Owns page + selected swimlane, theme, font scale, the Details layout dir,
   * and the per-page Header controls (UIShell headerLead/headerExtras slots). */
  import { UIShell, Dot, callNative, onCoreReconnect, ChatWidthControl, FontSizeControl, type GraftSource } from '@arbol/design-system'
  import HeaderBtn from './components/HeaderBtn.svelte'
  import Seg from './components/Seg.svelte'
  import Swimlanes from './pages/Swimlanes.svelte'
  import SwimlaneDetails from './pages/SwimlaneDetails.svelte'
  import Tasks from './pages/Tasks.svelte'
  import NewSwimlaneModal from './NewSwimlaneModal.svelte'
  import RenameSwimlaneModal from './RenameSwimlaneModal.svelte'
  import SetWallModal from './SetWallModal.svelte'
  import { isEmptySwimlane, loadSwimlanesStrict, finishSwimlane, removeEmptySwimlane, swapSwimlaneLanes, type Swimlane, type Swimmer } from './data'
  import { createSwimlaneChat } from './swimlaneChat'
  import { isOverdue } from './time'
  import type { BoardApi } from './pages/types'
  import type { TaskPage } from './tasks/types'
  import { restoreOakenBoardWindow, showCompactSwimlanesPanel } from './windowApi'
  import { OakenDashboardSync } from './dashboardSync'

  const UI_ID = 'oaken'
  const THEME_KEY = `arbol-theme:${UI_ID}`
  const SCALE_KEY = `arbol-ui-font-scale:${UI_ID}`
  const LAYOUT_KEY = 'oaken-detail-layout'
  const FONT_MAX = 23 / 13.5
  const FONT_MIN = 11.5 / 13.5
  const round2 = (v: number) => Math.round(v * 100) / 100

  let swimlanes = $state<Swimlane[]>([])
  let page = $state<'board' | 'details' | 'tasks'>('board')
  let swimlane = $state<Swimlane | null>(null)
  let theme = $state(localStorage.getItem(THEME_KEY) || 'redwood')
  let uiScale = $state(parseFloat(localStorage.getItem(SCALE_KEY) || '1') || 1)
  let layout = $state<'feed' | 'split'>((localStorage.getItem(LAYOUT_KEY) as 'feed' | 'split') || 'feed')
  let toast = $state<string | null>(null)
  let boardApi = $state<BoardApi | null>(null)
  let showCreate = $state(false)
  let createForSlot = $state<number | null>(null)
  let renameFor = $state<Swimlane | null>(null)
  let setWallFor = $state<{ lane: Swimlane; swimmer: Swimmer } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let pendingEntityOpen = $state<{ entity_kind?: string; entity_id: string } | null>(null)
  let pendingSwimlaneOpen = $state<string | null>(null)
  let requestedTaskPage = $state<TaskPage | null>(null)
  let requestedTaskEntityId = $state<string | null>(null)
  let requestedGraftSource = $state<GraftSource | null>(null)
  let taskPageRequestId = $state(0)
  let dashboardSending = $state(false)
  let mergeRequestReviewActive = $state(false)
  let mergeRequestWidth = $state({ onInc: () => {}, onDec: () => {}, canInc: false, canDec: false })
  const dashboardSync = new OakenDashboardSync()

  function requestTaskPage(requested: TaskPage) {
    requestedTaskPage = requested
    taskPageRequestId += 1
    openTasks()
  }

  type OakenOpenPayload = {
    page?: string
    action?: string
    entity_kind?: string
    entity_id?: string
    swimlane_id?: string
    source_repo?: string
    source_kind?: string
    source_entity_id?: string
    source_title?: string
    jira_key?: string
    merge_request_id?: string
  }

  function acceptEntityOpen(payload: OakenOpenPayload | null | undefined) {
    if (payload?.page === 'swimlanes') { back(); void callNative('app.consumeOpen', { page: 'swimlanes' }).catch(() => {}); return true }
    if (payload?.page === 'jira') { requestedTaskEntityId = payload.jira_key ?? null; requestTaskPage('jira'); void callNative('app.consumeOpen', { page: 'jira' }).catch(() => {}); return true }
    if (payload?.page === 'grafts') {
      requestedGraftSource = payload.action === 'new-graft' && payload.source_repo && payload.source_kind && payload.source_entity_id
        ? { repo: payload.source_repo, kind: payload.source_kind, entityId: payload.source_entity_id, title: payload.source_title }
        : null
      requestTaskPage('grafts')
      pendingEntityOpen = null
      void callNative('app.consumeOpen', { page: 'grafts' }).catch(() => {})
      return true
    }
    if (payload?.page === 'swimlane' && payload.swimlane_id) {
      const lane = swimlanes.find((candidate) => candidate.sid === payload.swimlane_id)
      if (lane) { openSwimlane(lane); pendingSwimlaneOpen = null }
      else pendingSwimlaneOpen = payload.swimlane_id
      void callNative('app.consumeOpen', { page: 'swimlane' }).catch(() => {})
      return true
    }
    if (payload?.page === 'merge-requests') {
      requestedTaskEntityId = payload.merge_request_id ?? null
      requestTaskPage('merge-requests')
      pendingEntityOpen = null
      void callNative('app.consumeOpen', { page: 'merge-requests' }).catch(() => {})
      return true
    }
    if (payload?.page !== 'entity' || !payload.entity_id) return false
    if (payload.entity_kind === 'ticket') { requestedTaskEntityId = payload.entity_id; requestTaskPage('jira'); pendingEntityOpen = null; return true }
    if (payload.entity_kind === 'mr') { requestedTaskEntityId = payload.entity_id; requestTaskPage('merge-requests'); pendingEntityOpen = null; return true }
    const lane = swimlanes.find((candidate) => candidate.swimmers?.some(
      (swimmer) => swimmer.items.some((entity) => entity.entityId === payload.entity_id),
    ))
    if (lane) openSwimlane(lane)
    else openTasks()
    pendingEntityOpen = null
    void callNative('app.consumeOpen', { page: 'entity' }).catch(() => {})
    return true
  }

  function reload() {
    return loadSwimlanesStrict().then((ls) => {
      swimlanes = ls
      if (pendingEntityOpen) acceptEntityOpen({ page: 'entity', ...pendingEntityOpen })
      if (pendingSwimlaneOpen) acceptEntityOpen({ page: 'swimlane', swimlane_id: pendingSwimlaneOpen })
      dashboardSync.evaluateSoon(ls)
      void callNative('app.oakenSwimlanesChanged', {}).catch(() => {})
    }).catch(() => {
      // Retain the previous complete board and Dashboard snapshot while Core is
      // unavailable. A transport failure must never look like an empty timeline.
    })
  }

  try {
    const raw = new URLSearchParams(location.search).get('open')
    if (raw) {
      const payload = JSON.parse(raw) as OakenOpenPayload
      if (payload.page === 'entity' && payload.entity_id) pendingEntityOpen = payload as { entity_kind?: string; entity_id: string }
      else if (payload.page === 'merge-requests' || payload.page === 'grafts' || payload.page === 'jira' || payload.page === 'swimlanes' || payload.page === 'swimlane') acceptEntityOpen(payload)
    }
  } catch { /* malformed one-shot payload */ }
  reload()

  // Migrate the first compact-panel prototype, which resized this main window.
  // The timer now owns a separate NSPanel, so the board must always remain full.
  void restoreOakenBoardWindow().catch(() => {})

  $effect(() => {
    const refresh = () => void reload()
    const offReconnect = onCoreReconnect(refresh)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      offReconnect()
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
      dashboardSync.dispose()
    }
  })

  $effect(() => {
    const onOpen = (event: Event) => {
      const payload = (event as CustomEvent<OakenOpenPayload>).detail
      if (payload?.page === 'entity' && payload.entity_id) {
        pendingEntityOpen = payload as { entity_kind?: string; entity_id: string }
        acceptEntityOpen(payload)
      } else if (payload?.page === 'merge-requests' || payload?.page === 'grafts' || payload?.page === 'jira' || payload?.page === 'swimlanes' || payload?.page === 'swimlane') {
        acceptEntityOpen(payload)
      }
    }
    window.addEventListener('arbol-open', onOpen)
    return () => window.removeEventListener('arbol-open', onOpen)
  })

  $effect(() => {
    const onReviewControls = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; onInc?: () => void; onDec?: () => void; canInc?: boolean; canDec?: boolean }>).detail
      mergeRequestReviewActive = !!detail?.active
      if (detail?.onInc && detail.onDec) mergeRequestWidth = { onInc: detail.onInc, onDec: detail.onDec, canInc: !!detail.canInc, canDec: !!detail.canDec }
    }
    window.addEventListener('arbol-merge-request-review-controls', onReviewControls)
    return () => window.removeEventListener('arbol-merge-request-review-controls', onReviewControls)
  })

  $effect(() => {
    const onEntityLinked = (event: Event) => {
      const detail = (event as CustomEvent<{ entity_title?: string }>).detail
      void reload().then(() => showToast(`Linked ${detail?.entity_title ?? 'Entity'} to Swimmer`))
    }
    window.addEventListener('arbol-oaken-entity-linked', onEntityLinked)
    return () => window.removeEventListener('arbol-oaken-entity-linked', onEntityLinked)
  })

  $effect(() => {
    const onOpenSwimlane = (event: Event) => {
      const id = (event as CustomEvent<{ swimlane_id?: string }>).detail?.swimlane_id
      const lane = id ? swimlanes.find((candidate) => candidate.sid === id) : null
      if (lane) openSwimlane(lane)
      else if (id) void reload().then(() => {
        const refreshed = swimlanes.find((candidate) => candidate.sid === id)
        if (refreshed) openSwimlane(refreshed)
      })
    }
    window.addEventListener('arbol-oaken-open-swimlane', onOpenSwimlane)
    return () => window.removeEventListener('arbol-oaken-open-swimlane', onOpenSwimlane)
  })

  function newSwimlane(slot?: number) { createForSlot = slot ?? null; showCreate = true }

  async function sendToDashboard() {
    if (dashboardSending) return
    dashboardSending = true
    try {
      const fresh = await loadSwimlanesStrict()
      swimlanes = fresh
      const result = await dashboardSync.submit(fresh, true)
      if (!result.ok) throw new Error(result.error || 'Dashboard submission failed')
      showToast(result.taskCount === 0 ? 'Dashboard timeline cleared' : `Sent ${result.taskCount} tasks to Dashboard`)
    } catch {
      showToast('Could not send tasks to Dashboard')
    } finally {
      dashboardSending = false
    }
  }

  async function linkEntityToSwimmer(L: Swimlane, swimmer: Swimmer) {
    if (!L.sid) return
    try {
      await callNative('app.showEntitySearchForSwimmer', {
        swimlane_id: L.sid,
        swimmer_id: swimmer.id,
        swimmer_title: swimmer.nm,
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open Entity Search')
    }
  }

  function finishLane(L: Swimlane) {
    if (!L.sid) return
    finishSwimlane(L.sid)
      .then(() => { reload(); showToast('Swimlane finished') })
      .catch((e) => showToast(e instanceof Error ? e.message : 'Could not finish swimlane'))
  }

  function swapLanes(L: Swimlane, targetSlot: number) {
    if (!L.sid || L.n === targetSlot) return
    const occupied = swimlanes.some((lane) => lane.sid && lane.n === targetSlot)
    swapSwimlaneLanes(L.sid, targetSlot)
      .then(() => {
        reload()
        showToast(occupied ? `Swapped lanes ${L.n} and ${targetSlot}` : `Swimlane ${L.n} moved to lane ${targetSlot}`)
      })
      .catch((e) => showToast(e instanceof Error ? e.message : 'Could not swap lanes'))
  }

  async function chatLane(L: Swimlane) {
    if (!L.sid) return
    try {
      await createSwimlaneChat(L)
      showToast('New Composer opened with the Swimlane attached as a Chat Note')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open Swimlane chat')
    }
  }

  function removeLane(L: Swimlane) {
    if (!L.sid) return
    if (!window.confirm(`Remove empty Swimlane ${L.n}${L.tkt ? ` “${L.tkt}”` : ''}?`)) return
    removeEmptySwimlane(L.sid)
      .then(() => { reload(); showToast('Swimlane removed') })
      .catch((e) => showToast(e instanceof Error ? e.message : 'Could not remove swimlane'))
  }

  $effect(() => {
    const trackedPage = page === 'board' || page === 'details' ? 'swimlanes' : requestedTaskPage || 'jira'
    void callNative('app.consumeOpen', { page: trackedPage }).catch(() => {})
  })
  $effect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem(THEME_KEY, theme) })
  $effect(() => { localStorage.setItem(SCALE_KEY, String(uiScale)); document.documentElement.style.setProperty('--arbol-font-scale', String(uiScale)) })
  $effect(() => { localStorage.setItem(LAYOUT_KEY, layout) })

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === 'Tab' && (page === 'board' || page === 'tasks')) {
        e.preventDefault()
        if (page === 'board') openTasks()
        else back()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); if (page === 'details' || page === 'tasks') back() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function openSwimlane(L: Swimlane) { swimlane = L; page = 'details' }
  function back() { page = 'board' }
  function openTasks() { swimlane = null; page = 'tasks' }
  function showToast(msg: string) {
    toast = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = null), 2200)
  }

  const fontCtl = {
    onInc: () => (uiScale = Math.min(FONT_MAX, round2(uiScale + 0.1))),
    onDec: () => (uiScale = Math.max(FONT_MIN, round2(uiScale - 0.1))),
    get canInc() { return uiScale < FONT_MAX },
    get canDec() { return uiScale > FONT_MIN },
    get title() { return `Text size — ${Math.round(uiScale * 100)}%` },
  }

  const activeSwimlanes = $derived(swimlanes.filter((l) => !isEmptySwimlane(l)).length)
  const entityCount = $derived(swimlane?.swimmers?.reduce((n, s) => n + (s.items ? s.items.length : 0), 0) ?? 0)
  const anyOverdue = $derived(swimlane?.swimmers?.some((s) => isOverdue(s)) ?? false)
</script>

{#snippet headerLead()}
  {#if page === 'board'}
    <span style="color:var(--arbol-color-text-muted);white-space:nowrap">· Swimlanes</span>
  {:else if page === 'tasks'}
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <button onclick={back} title="Back to Swimlanes (⌥Tab or ⌘[)"
        style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:var(--arbol-color-surface-2);
               border:1px solid var(--arbol-color-border);border-radius:7px;padding:4px 9px 4px 7px;
               color:var(--arbol-color-text);font:600 calc(11px * var(--arbol-font-scale))/1 var(--arbol-font-ui);white-space:nowrap">
        <span style="font-size:calc(13px * var(--arbol-font-scale));line-height:1">‹</span>Swimlanes
      </button>
      <span style="color:var(--arbol-color-text-muted);opacity:0.5">⟩</span>
      <span style="color:var(--arbol-color-text);white-space:nowrap;font-weight:600">Tasks</span>
    </div>
  {:else}
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <button onclick={back} title="Back to Swimlanes (⌘[)"
        style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:var(--arbol-color-surface-2);
               border:1px solid var(--arbol-color-border);border-radius:7px;padding:4px 9px 4px 7px;
               color:var(--arbol-color-text);font:600 calc(11px * var(--arbol-font-scale))/1 var(--arbol-font-ui);white-space:nowrap">
        <span style="font-size:calc(13px * var(--arbol-font-scale));line-height:1">‹</span>Swimlanes
      </button>
      <span style="color:var(--arbol-color-text-muted);opacity:0.5">⟩</span>
      <span style="color:var(--arbol-color-text-muted);white-space:nowrap;font-weight:600;font-size:var(--arbol-type-label)">SWIMLANE {swimlane?.n}</span>
      <span style="color:var(--arbol-color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px;font-weight:600">{swimlane?.tkt}</span>
    </div>
  {/if}
{/snippet}

{#snippet headerExtras()}
  {#if page === 'board'}
    <div style="display:flex;align-items:center;gap:6px">
      <HeaderBtn title="Keep a compact Swimlanes timer above other windows" onclick={() => showCompactSwimlanesPanel().catch((error) => showToast(error instanceof Error ? error.message : 'Could not open timer panel'))}>{#snippet children()}Timer Panel{/snippet}</HeaderBtn>
      <HeaderBtn title="Open Arbol Dashboard and resend the current Swimlanes snapshot" onclick={sendToDashboard}>{#snippet children()}{dashboardSending ? 'Sending…' : 'Send to dashboard'}{/snippet}</HeaderBtn>
      <HeaderBtn title="Open Tasks (⌥Tab)" onclick={openTasks}>{#snippet children()}Tasks{/snippet}</HeaderBtn>
      <HeaderBtn title="Create a new swimlane" onclick={() => newSwimlane()}>{#snippet children()}＋ New Swimlane{/snippet}</HeaderBtn>
      <HeaderBtn title="Reset view" onclick={() => boardApi?.reset()}>{#snippet children()}↺ Reset view{/snippet}</HeaderBtn>
      <HeaderBtn title="Narrower columns" onclick={() => boardApi?.narrow()}>{#snippet children()}▭−{/snippet}</HeaderBtn>
      <HeaderBtn title="Wider columns" onclick={() => boardApi?.widen()}>{#snippet children()}▭＋{/snippet}</HeaderBtn>
      <HeaderBtn title="Fit all occupied swimlanes" on={boardApi?.isFit?.()} onclick={() => boardApi?.fit()}>{#snippet children()}Fit swimlanes{/snippet}</HeaderBtn>
    </div>
  {:else if page === 'details'}
    <Seg
      value={layout}
      onChange={(v) => (layout = v as 'feed' | 'split')}
      options={[{ value: 'feed', label: 'Feed', title: 'Spine left · one feed of items' },
                { value: 'split', label: 'Split', title: 'Spine centred · sessions left, events right' }]}
    />
  {/if}
{/snippet}

{#snippet headerActions()}
  {#if page === 'tasks' && mergeRequestReviewActive}<ChatWidthControl title="Review width" {...mergeRequestWidth} />{/if}
  <FontSizeControl onInc={fontCtl.onInc} onDec={fontCtl.onDec} canInc={fontCtl.canInc} canDec={fontCtl.canDec} title={fontCtl.title} />
{/snippet}

{#snippet status()}
  {#if page === 'board'}
    <Dot color="var(--arbol-color-ok)" /><span>Connected</span>
    <span style="opacity:0.5">·</span>
    <span style="font-family:var(--arbol-font-mono)">{activeSwimlanes} active swimlanes</span>
    <span style="flex:1"></span>
    <span style="opacity:0.7">Click a swimlane title to expand its swimmers →</span>
  {:else if page === 'tasks'}
    <Dot color="var(--arbol-color-ok)" /><span>Repo Artifacts</span>
    <span style="opacity:0.5">·</span>
    <span style="font-family:var(--arbol-font-mono)">Tasks · Jira</span>
    <span style="flex:1"></span>
    <span style="opacity:0.7">Inner Jira artifacts are shown; missing tickets are normalized for Tasks</span>
  {:else}
    <Dot color={anyOverdue ? 'var(--arbol-color-err)' : 'var(--arbol-color-ok)'} />
    <span style="font-family:var(--arbol-font-mono)">{swimlane?.swimmers?.length ?? 0} swimmers</span>
    <span style="opacity:0.5">·</span>
    <span style="font-family:var(--arbol-font-mono)">{entityCount} entities</span>
    <span style="flex:1"></span>
    <span style="opacity:0.7">Click a swimmer header for actions · ⌘[ back</span>
  {/if}
{/snippet}

<UIShell title="Oaken" {headerLead} {headerExtras} {headerActions} {theme} onTheme={(id) => (theme = id)} {status}>
  <div style="height:100%;min-width:0">
    {#if page === 'tasks'}
      <Tasks
        onSwimlaneCreated={(label) => { reload(); showToast(`Swimlane created from ${label}`) }}
        onSwimmerCreated={(label) => { reload(); showToast(`Swimmer created from ${label}`) }}
        onOpenSwimlane={openSwimlane}
        onGraftSaved={() => { void reload() }}
        requestedPage={requestedTaskPage}
        requestedEntityId={requestedTaskEntityId}
        requestId={taskPageRequestId}
        requestedGraftSource={requestedGraftSource}
        onGraftCreateOpened={() => (requestedGraftSource = null)}
      />
    {:else if page === 'board' || !swimlane}
      <Swimlanes
        {swimlanes}
        onOpenSwimlane={openSwimlane}
        onToast={showToast}
        onReady={(api) => (boardApi = api)}
        onNewSwimlane={newSwimlane}
        onFinishSwimlane={finishLane}
        onRemoveSwimlane={removeLane}
        onRenameSwimlane={(L) => (renameFor = L)}
        onSwapSwimlane={swapLanes}
        onChatSwimlane={chatLane}
        onAddEntity={linkEntityToSwimmer}
        onSetWall={(lane, swimmer) => (setWallFor = { lane, swimmer })}
      />
    {:else}
      <SwimlaneDetails {swimlane} {layout} onToast={showToast} />
    {/if}
  </div>
  {#if toast}<div class="dtoast">{toast}</div>{/if}
  {#if showCreate}
    <NewSwimlaneModal targetSlot={createForSlot ?? undefined} onClose={() => (showCreate = false)} onCreated={reload} onError={showToast} />
  {/if}
  {#if setWallFor?.lane.sid}
    <SetWallModal
      swimmerId={setWallFor.swimmer.id}
      swimmerTitle={setWallFor.swimmer.nm}
      currentType={setWallFor.swimmer.type}
      currentDueMs={setWallFor.swimmer.dueMs}
      onClose={() => (setWallFor = null)}
      onSaved={reload}
      onError={showToast}
    />
  {/if}
  {#if renameFor?.sid}
    <RenameSwimlaneModal
      swimlaneId={renameFor.sid}
      current={renameFor.tkt ?? ''}
      onClose={() => (renameFor = null)}
      onRenamed={reload}
      onError={showToast}
    />
  {/if}
</UIShell>
