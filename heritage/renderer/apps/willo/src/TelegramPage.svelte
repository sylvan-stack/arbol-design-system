<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { subscribe, onCoreReconnect } from '@arbol/design-system'
  import {
    telegramApi, telegramConversationName, telegramConversationPrefix,
    type TelegramConversation, type TelegramCursor, type TelegramMessage, type TelegramOverview,
  } from './telegramApi'

  let { openTarget = null }: { openTarget?: { messageId?: string; conversationId?: string } | null } = $props()
  let highlightedMessageId = $state<string | null>(null)

  $effect(() => {
    if (openTarget && !loading) {
      const target = openTarget
      untrack(() => { void openMessage(target.messageId, target.conversationId) })
    }
  })

  async function openMessage(itemId?: string, conversationId?: string) {
    const generation = ++messageSnapshotGeneration
    loadingMessages = true
    error = null
    try {
      const result = conversationId
        ? await telegramApi.conversationContext(conversationId, pageSize)
        : await telegramApi.messageContext(itemId!, pageSize)
      if (generation !== messageSnapshotGeneration) return
      selected = result.conversation
      tab = selected.kind === 'private' || selected.kind === 'bot' ? 'contacts' : 'chats'
      messages = result.messages; before = result.next_before; hasMore = result.has_more
      highlightedMessageId = itemId || null
      await tick()
      document.getElementById('telegram-message-' + itemId)?.scrollIntoView({ block: 'center' })
    } catch (e) { if (generation === messageSnapshotGeneration) error = msg(e) }
    finally { if (generation === messageSnapshotGeneration) loadingMessages = false }
  }

  function monthsBefore(value: Date, count: number) {
    const result = new Date(value)
    const day = result.getUTCDate()
    result.setUTCDate(1)
    result.setUTCMonth(result.getUTCMonth() - count)
    const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
    result.setUTCDate(Math.min(day, last))
    return result
  }
  let since = $state(monthsBefore(new Date(), 6).getTime())
  const rangeDateFormat = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  })
  let rangeStep = $state('month')
  let loadingSources = $state(false)
  let finding = $state(false)
  let query = $state('')
  let searchResults = $state<TelegramConversation[]>([])
  let searching = $state(false)
  let searched = $state(false)
  let searchGeneration = 0
  let sourceGeneration = 0
  let findButton = $state<HTMLButtonElement>()
  let searchInput = $state<HTMLInputElement>()
  let overview = $state<TelegramOverview | null>(null)
  let contacts = $state<TelegramConversation[]>([])
  let chats = $state<TelegramConversation[]>([])
  let ignoredConversations = $state<TelegramConversation[]>([])
  let selected = $state<TelegramConversation | null>(null)
  let tab = $state<'contacts' | 'chats' | 'ignored'>('contacts')
  let messages = $state<TelegramMessage[]>([])
  let before = $state<TelegramCursor | null>(null)
  let hasMore = $state(false)
  let loading = $state(true)
  let syncing = $state(false)
  let loadingMessages = $state(false)
  let error = $state<string | null>(null)
  let dragId = $state<string | null>(null)
  let dropId = $state<string | null>(null)
  let dragSource: 'contacts' | 'chats' | null = null
  let dragPointer: number | null = null
  let dragHandle: HTMLButtonElement | null = null
  let dragStartY = 0
  let timeline = $state<HTMLDivElement>()
  let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let liveRefreshInFlight = false
  let liveRefreshQueued = false
  let messageSnapshotGeneration = 0
  let lastReconcileRequestAt = 0

  const syncRunning = $derived(syncing || overview?.sync.status === 'running')
  const pageSize = $derived(overview?.preferences.message_page_size || 30)
  const vipContacts = $derived(contacts.filter((c) => !!c.is_vip))
  const regularContacts = $derived(contacts.filter((c) => !c.is_vip))
  const vipChats = $derived(chats.filter((c) => !!c.is_vip))
  const regularChats = $derived(chats.filter((c) => !c.is_vip))
  const msg = (e: unknown) => e instanceof Error ? e.message : String(e)

  async function loadOverview() {
    overview = await telegramApi.overview()
    if (overview.has_data) await loadSources()
  }

  async function loadSources() {
    const generation = ++sourceGeneration
    const [nextContacts, nextChats, nextIgnored] = await Promise.all([
      telegramApi.contacts(since), telegramApi.chats(since), telegramApi.ignored(),
    ])
    if (generation !== sourceGeneration) return
    contacts = nextContacts
    chats = nextChats
    ignoredConversations = nextIgnored
    if (selected) selected = [...contacts, ...chats, ...ignoredConversations].find((c) => c.id === selected?.id) || selected
  }

  async function expandRange(reset = false) {
    if (loadingSources) return
    const previous = since
    const date = new Date(since)
    if (reset) since = monthsBefore(new Date(), 6).getTime()
    else if (rangeStep === 'month') since = monthsBefore(date, 1).getTime()
    else { date.setUTCDate(date.getUTCDate() - (rangeStep === 'week' ? 7 : 1)); since = date.getTime() }
    loadingSources = true
    try { await loadSources() }
    catch (e) { since = previous; error = msg(e) }
    finally { loadingSources = false }
  }

  async function toggleSearch() {
    finding = !finding
    if (finding) { await tick(); searchInput?.focus() }
    else { searchGeneration++; searching = false; searched = false; searchResults = []; query = ''; await tick(); findButton?.focus() }
  }

  async function findConversations(event: SubmitEvent) {
    event.preventDefault()
    if (!query.trim()) return
    const generation = ++searchGeneration
    searching = true; searched = false; error = null; searchResults = []
    try {
      const [people, groups] = await Promise.all([
        telegramApi.contacts(undefined, query.trim()), telegramApi.chats(undefined, query.trim()),
      ])
      if (generation !== searchGeneration) return
      searchResults = [...people, ...groups].sort((a, b) =>
        (b.match_score || 0) - (a.match_score || 0) || (b.last_message_at || 0) - (a.last_message_at || 0))
      searched = true
    } catch (e) { if (generation === searchGeneration) error = msg(e) }
    finally { if (generation === searchGeneration) searching = false }
  }

  function selectTab(next: 'contacts' | 'chats' | 'ignored') {
    tab = next
    if (finding) void toggleSearch()
  }

  onMount(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    // Coalesce stream, focus, visibility, and reconnect refreshes. If another dirty
    // signal arrives while RPCs are in flight, run once more after they settle
    // so a change committed during the read cannot remain invisible.
    const refreshLiveNow = async () => {
      if (disposed) return
      if (liveRefreshInFlight) {
        liveRefreshQueued = true
        return
      }
      liveRefreshInFlight = true
      try {
        do {
          liveRefreshQueued = false
          await loadOverview()
          if (selected) await refreshSelectedConversation()
        } while (!disposed && liveRefreshQueued)
      } catch (e) {
        if (!disposed) error = msg(e)
      } finally {
        liveRefreshInFlight = false
      }
    }
    const refreshLive = (delay = 250) => {
      if (disposed || liveRefreshTimer) return
      liveRefreshTimer = setTimeout(() => {
        liveRefreshTimer = null
        void refreshLiveNow()
      }, delay)
    }
    const attach = () => {
      unsubscribe?.()
      unsubscribe = subscribe('telegram.surface.events', {}, (event) => {
        if (event.kind === 'error') return
        // `ready` reconciles the initial snapshot→subscription handshake;
        // `changed` is emitted directly after Telegram ingestion commits in Core.
        if (event.event === 'telegram.surface.ready') refreshLive(0)
        else if (event.event === 'telegram.surface.changed') refreshLive()
      })
    }
    const reconcileWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshLive(0)
      // Live MTProto frames are live-only. Ask integrations for a single bounded
      // catch-up when the user returns; throttle focus+visibility pairs.
      const now = Date.now()
      if (now - lastReconcileRequestAt < 30_000) return
      lastReconcileRequestAt = now
      void telegramApi.reconcile().catch((e) => { if (!disposed) error = msg(e) })
    }
    const startFreshness = () => {
      if (disposed) return
      attach()
      window.addEventListener('focus', reconcileWhenVisible)
      document.addEventListener('visibilitychange', reconcileWhenVisible)
      reconcileWhenVisible()
    }

    ;(async () => {
      try { await loadOverview() } catch (e) { error = msg(e) }
      finally {
        loading = false
        startFreshness()
      }
    })()
    const offReconnect = onCoreReconnect(() => { attach(); reconcileWhenVisible() })
    return () => {
      disposed = true
      unsubscribe?.()
      offReconnect()
      window.removeEventListener('focus', reconcileWhenVisible)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
      if (liveRefreshTimer) clearTimeout(liveRefreshTimer)
      liveRefreshTimer = null
      liveRefreshQueued = false
    }
  })

  async function sync() {
    if (syncRunning) return
    syncing = true; error = null
    try {
      const started = await telegramApi.sync()
      if (overview) overview = { ...overview, sync: started.sync }
      // Progress and completion are pushed by `telegram.surface.events` as the
      // integration daemon commits sync-state updates in Core.
    } catch (e) { error = msg(e) } finally { syncing = false }
  }

  async function openConversation(c: TelegramConversation) {
    const generation = ++messageSnapshotGeneration
    highlightedMessageId = null
    selected = c; messages = []; before = null; hasMore = false; loadingMessages = true; error = null
    try {
      const page = await telegramApi.messages(c.id, pageSize)
      if (generation !== messageSnapshotGeneration || selected?.id !== c.id) return
      messages = page.messages; before = page.next_before; hasMore = page.has_more
      await tick(); timeline?.scrollTo({ top: timeline.scrollHeight })
    } catch (e) { error = msg(e) }
    finally { if (generation === messageSnapshotGeneration) loadingMessages = false }
  }

  async function refreshSelectedConversation() {
    const current = selected
    if (!current) return
    // A pushed change may arrive while the initial snapshot or an older-page
    // request is in flight. Supersede that older read so it cannot overwrite
    // this post-commit reconciliation with stale data.
    const generation = ++messageSnapshotGeneration
    loadingMessages = true
    const wasNearBottom = !!timeline && timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 100
    try {
      const page = highlightedMessageId
        ? await telegramApi.messageContext(highlightedMessageId, Math.max(pageSize, messages.length || pageSize))
        : await telegramApi.messages(current.id, Math.max(pageSize, messages.length || pageSize))
      if (generation !== messageSnapshotGeneration || selected?.id !== current.id) return
      messages = page.messages; before = page.next_before; hasMore = page.has_more
      await tick()
      if (wasNearBottom) timeline?.scrollTo({ top: timeline.scrollHeight })
    } finally {
      if (generation === messageSnapshotGeneration) loadingMessages = false
    }
  }

  async function loadOlder() {
    if (!selected || !hasMore || !before || loadingMessages) return
    const current = selected
    const currentTimeline = timeline
    if (!currentTimeline) return
    const generation = ++messageSnapshotGeneration
    loadingMessages = true
    const oldHeight = currentTimeline.scrollHeight
    try {
      const page = await telegramApi.messages(current.id, pageSize, before)
      if (generation !== messageSnapshotGeneration || selected?.id !== current.id) return
      const existingIds = new Set(messages.map((message) => message.id))
      messages = [...page.messages.filter((message) => !existingIds.has(message.id)), ...messages]
      before = page.next_before; hasMore = page.has_more
      await tick(); currentTimeline.scrollTop += currentTimeline.scrollHeight - oldHeight
    } catch (e) { error = msg(e) }
    finally { if (generation === messageSnapshotGeneration) loadingMessages = false }
  }

  function timelineScroll() { if (timeline && timeline.scrollTop < 80) loadOlder() }

  function authorLabel(m: TelegramMessage): string {
    return m.author_name || m.author_username || m.author_external_id || 'Unknown'
  }

  async function toggleVip(c: TelegramConversation) {
    const next = !c.is_vip
    const update = (items: TelegramConversation[]) => items.map((x) => x.id === c.id ? { ...x, is_vip: next, sort_position: null } : x)
    if (c.kind === 'private' || c.kind === 'bot') contacts = update(contacts)
    else chats = update(chats)
    try { await telegramApi.setVip(c.id, next); await loadSources() }
    catch (e) { error = msg(e); await loadSources() }
    finally { reordering = false }
  }

  async function ignore(c: TelegramConversation) {
    // WKWebView does not provide a JavaScript confirm panel in the Willo host,
    // so window.confirm() silently prevented this RPC from ever being sent.
    // Ignore is intentionally a direct, optimistic action from the hover control.
    const wasSelected = selected?.id === c.id
    contacts = contacts.filter((x) => x.id !== c.id)
    chats = chats.filter((x) => x.id !== c.id)
    if (wasSelected) { selected = null; messages = [] }
    error = null
    try {
      await telegramApi.ignore(c.id)
      await Promise.all([loadSources(), loadOverview()])
    } catch (e) {
      error = msg(e)
      await loadSources()
      if (wasSelected) selected = [...contacts, ...chats].find((x) => x.id === c.id) || null
    }
  }

  async function unignore(c: TelegramConversation) {
    ignoredConversations = ignoredConversations.filter((x) => x.id !== c.id)
    error = null
    try {
      await telegramApi.unignore(c.id)
      await Promise.all([loadSources(), loadOverview()])
    } catch (e) {
      error = msg(e)
      await loadSources()
    }
  }

  let reordering = $state(false)
  async function moveVip(c: TelegramConversation, section: TelegramConversation[], offset: number, source: 'contacts' | 'chats') {
    const target = section[section.findIndex((item) => item.id === c.id) + offset]
    if (!target || reordering) return
    await dropOn(c.id, target, section, true, source)
  }

  function cancelDrag() {
    const handle = dragHandle
    const pointer = dragPointer
    dragId = null; dropId = null; dragSource = null; dragPointer = null; dragHandle = null
    if (handle && pointer !== null && handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer)
  }

  function startDrag(event: PointerEvent, c: TelegramConversation, source: 'contacts' | 'chats') {
    if (reordering || event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    cancelDrag()
    dragId = c.id; dragSource = source; dragPointer = event.pointerId; dragStartY = event.clientY
    dragHandle = event.currentTarget as HTMLButtonElement
    dragHandle.setPointerCapture(event.pointerId)
  }

  function trackDrag(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return
    event.preventDefault()
    if (Math.abs(event.clientY - dragStartY) < 4 && !dropId) return
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-telegram-vip-id]')
    dropId = row?.dataset.telegramVipSource === dragSource ? row.dataset.telegramVipId || null : null
    // Keep nearby rows reachable when the VIP list exceeds the sidebar height.
    const sidebar = dragHandle?.closest('.slack-sources')
    if (sidebar) {
      const bounds = sidebar.getBoundingClientRect()
      if (event.clientY < bounds.top + 30) sidebar.scrollTop -= 12
      else if (event.clientY > bounds.bottom - 30) sidebar.scrollTop += 12
    }
  }

  function finishDrag(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return
    trackDrag(event)
    const id = dragId
    const source = dragSource
    const section = source === 'contacts' ? vipContacts : vipChats
    const target = section.find((c) => c.id === dropId)
    cancelDrag()
    if (id && source && target) void dropOn(id, target, section, true, source)
  }

  async function dropOn(id: string, target: TelegramConversation, section: TelegramConversation[], isVip: boolean, source: 'contacts' | 'chats') {
    if (reordering || id === target.id) return
    const from = section.findIndex((c) => c.id === id)
    const to = section.findIndex((c) => c.id === target.id)
    if (from < 0 || to < 0) return
    const reordered = [...section]
    const [moved] = reordered.splice(from, 1); reordered.splice(to, 0, moved)
    const all = source === 'contacts' ? contacts : chats
    const other = all.filter((c) => !!c.is_vip !== isVip)
    const next = isVip ? [...reordered, ...other] : [...other, ...reordered]
    if (source === 'contacts') contacts = next
    else chats = next
    dragId = null
    reordering = true
    try { await telegramApi.reorder(reordered.map((c) => c.id), isVip); await loadSources() }
    catch (e) { error = msg(e); await loadSources() }
    finally { reordering = false }
  }

  function time(ts: number) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  }
</script>

<svelte:window
  onpointermove={trackDrag}
  onpointerup={finishDrag}
  onpointercancel={(event) => { if (event.pointerId === dragPointer) cancelDrag() }}
  onblur={cancelDrag}
  onkeydown={(event) => {
    if (event.key === 'Escape' && dragId) { event.preventDefault(); cancelDrag() }
    else if (finding && event.key === 'Escape') { event.preventDefault(); void toggleSearch() }
  }}
/>

{#if loading}
  <div class="slack-empty" role="status"><span class="telegram-progress"><span class="telegram-spinner" aria-hidden="true"></span>Loading Telegram…</span></div>
{:else if !overview?.has_data}
  <div class="slack-empty">
    <button class="slack-sync" onclick={sync} disabled={syncRunning}>{syncRunning ? 'Syncing with Telegram…' : overview?.sync.status === 'failed' ? 'Retry Sync with Telegram' : 'Sync with Telegram'}</button>
    {#if syncRunning}<div class="telegram-progress" role="status"><span class="telegram-spinner" aria-hidden="true"></span>Syncing contacts, chats and messages…</div>{/if}
    {#if error || overview?.sync.error}<div class="slack-error">{error || overview?.sync.error}</div>{/if}
  </div>
{:else}
  <div class="slack-page">
    <div>
    <nav class="slack-tabs" aria-label="Telegram pages">
      <button class:active={tab === 'contacts'} onclick={() => selectTab('contacts')}>Contacts</button>
      <button class:active={tab === 'chats'} onclick={() => selectTab('chats')}>Chats</button>
      <button class:active={tab === 'ignored'} onclick={() => selectTab('ignored')}>
        Ignored{ignoredConversations.length ? ` (${ignoredConversations.length})` : ''}
      </button>
      <button class="telegram-find-toggle" bind:this={findButton} class:active={finding} aria-expanded={finding} aria-controls="telegram-find-panel" onclick={toggleSearch}>Find by number/name</button>
    </nav>
    {#if syncRunning}
      <div class="telegram-sync-status telegram-progress" role="status"><span class="telegram-spinner" aria-hidden="true"></span>Syncing contacts, chats and messages…</div>
    {:else if overview.sync.status === 'failed'}
      <div class="slack-error" role="alert">{overview.sync.error || 'Telegram sync failed.'}</div>
    {/if}

    </div>
    <div class="slack-browser">
    <aside class="slack-sources">
      {#if finding}
        <div class="telegram-source-tools" id="telegram-find-panel">
          <form onsubmit={findConversations}>
            <label for="telegram-search">Find a contact or chat</label>
            <div class="telegram-tool-row">
              <input id="telegram-search" type="search" bind:this={searchInput} bind:value={query} maxlength="200" placeholder="Name, username or phone number" />
              <button class="telegram-tool" disabled={searching || !query.trim()}>Find</button>
              <button type="button" class="telegram-tool" onclick={toggleSearch}>Close</button>
            </div>
          </form>
          <p><strong>Search range:</strong> All synced history · No date cutoff.</p>
          <p>Includes older and ignored conversations.</p>
          <details class="telegram-search-help">
            <summary>Missing someone?</summary>
            <p>Refresh contacts from Telegram, then search again. Phone numbers are available when shared by Telegram.</p>
            <button class="telegram-tool" disabled={syncRunning} onclick={sync}>{syncRunning ? 'Syncing…' : 'Refresh from Telegram'}</button>
          </details>
        </div>
      {/if}
      {#if !finding && tab !== 'ignored'}
        <p class="telegram-range-label" role="status">
          <strong>{loadingSources ? 'Loading activity since' : 'Showing activity since'}</strong>
          <time datetime={new Date(since).toISOString()}>{rangeDateFormat.format(since)}</time>
        </p>
      {/if}
      {#if finding}
        <section class="slack-source-section" aria-live="polite">
          {#if searching}<div class="telegram-progress" role="status"><span class="telegram-spinner" aria-hidden="true"></span>Searching all contacts and chats…</div>
          {:else if searched}<h2>Results ({searchResults.length})</h2>{/if}
          {#if searched && !searchResults.length}<p class="slack-source-empty">No matches. Try part of a name or number.</p>{/if}
          {#each searchResults as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem">
              <button class="slack-source-main" onclick={() => openConversation(c)}>
                {telegramConversationPrefix(c)}{telegramConversationName(c)}
                <small class="telegram-result-detail">{c.kind}{c.username ? ` · @${c.username}` : ''}{c.phone ? ` · +${c.phone.replace(/^\+/, '')}` : ''}{c.ignored ? ' · Ignored' : ''}</small>
              </button>
            </div>
          {/each}
        </section>
      {:else if tab === 'contacts'}
        <section class="slack-source-section">
          <h2>VIP</h2>
          {#each vipContacts as c, index (c.id)}
            <div class:selected={selected?.id === c.id} class:telegram-dragging={dragId === c.id} class:telegram-drop-target={dropId === c.id && dragId !== c.id} class="slack-source" role="listitem" data-telegram-vip-id={c.id} data-telegram-vip-source="contacts">
              <button class="telegram-drag-handle" title="Drag to reorder VIP" aria-label={`Drag ${telegramConversationName(c)} to reorder VIP; use the up and down buttons for keyboard ordering`} disabled={reordering} onpointerdown={(event) => startDrag(event, c, 'contacts')} onlostpointercapture={cancelDrag}>
                <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
                  <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
                  <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
                </svg>
              </button>
              <button class="telegram-order" title="Move up in VIP" aria-label={`Move ${telegramConversationName(c)} up in VIP`} disabled={reordering || index === 0} onclick={() => moveVip(c, vipContacts, -1, 'contacts')}>↑</button>
              <button class="telegram-order" title="Move down in VIP" aria-label={`Move ${telegramConversationName(c)} down in VIP`} disabled={reordering || index === vipContacts.length - 1} onclick={() => moveVip(c, vipContacts, 1, 'contacts')}>↓</button>
              <button class="slack-source-main" onclick={() => openConversation(c)}>{telegramConversationName(c)}</button>
              <button class="slack-star on" title="Remove from VIP" onclick={() => toggleVip(c)}>★</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
        <section class="slack-source-section">
          <h2>Regular</h2>
          {#if !contacts.length}<p class="slack-source-empty">No contacts in this range. Load older or find by number/name.</p>{/if}
          {#each regularContacts as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem">
              <button class="slack-source-main" onclick={() => openConversation(c)}>{telegramConversationName(c)}</button>
              <button class="slack-star" title="Add to VIP" onclick={() => toggleVip(c)}>☆</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
      {:else if tab === 'chats'}
        <section class="slack-source-section">
          <h2>VIP</h2>
          {#each vipChats as c, index (c.id)}
            <div class:selected={selected?.id === c.id} class:telegram-dragging={dragId === c.id} class:telegram-drop-target={dropId === c.id && dragId !== c.id} class="slack-source" role="listitem" data-telegram-vip-id={c.id} data-telegram-vip-source="chats">
              <button class="telegram-drag-handle" title="Drag to reorder VIP" aria-label={`Drag ${telegramConversationName(c)} to reorder VIP; use the up and down buttons for keyboard ordering`} disabled={reordering} onpointerdown={(event) => startDrag(event, c, 'chats')} onlostpointercapture={cancelDrag}>
                <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
                  <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
                  <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
                </svg>
              </button>
              <button class="telegram-order" title="Move up in VIP" aria-label={`Move ${telegramConversationName(c)} up in VIP`} disabled={reordering || index === 0} onclick={() => moveVip(c, vipChats, -1, 'chats')}>↑</button>
              <button class="telegram-order" title="Move down in VIP" aria-label={`Move ${telegramConversationName(c)} down in VIP`} disabled={reordering || index === vipChats.length - 1} onclick={() => moveVip(c, vipChats, 1, 'chats')}>↓</button>
              <button class="slack-source-main" onclick={() => openConversation(c)}>{telegramConversationPrefix(c)}{telegramConversationName(c)}</button>
              <button class="slack-star on" title="Remove from VIP" aria-label={`Remove ${telegramConversationName(c)} from VIP`} onclick={() => toggleVip(c)}>★</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
        <section class="slack-source-section">
          <h2>Regular</h2>
          {#if !chats.length}<p class="slack-source-empty">No chats in this range. Load older or find by number/name.</p>{/if}
          {#each regularChats as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem">
              <button class="slack-source-main" onclick={() => openConversation(c)}>{telegramConversationPrefix(c)}{telegramConversationName(c)}</button>
              <button class="slack-star" title="Add to VIP" aria-label={`Add ${telegramConversationName(c)} to VIP`} onclick={() => toggleVip(c)}>☆</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
      {:else}
        <section class="slack-source-section slack-ignored-section">
          <h2>Ignored</h2>
          {#if ignoredConversations.length === 0}
            <p class="slack-source-empty">No ignored contacts or chats.</p>
          {:else}
            {#each ignoredConversations as c (c.id)}
              <div class="slack-source" role="listitem">
                <span class="slack-source-label">{telegramConversationPrefix(c)}{telegramConversationName(c)}</span>
                <button class="slack-unignore" onclick={() => unignore(c)}>Unignore</button>
              </div>
            {/each}
          {/if}
        </section>
      {/if}
      {#if !finding && tab !== 'ignored'}
        <details class="telegram-range">
          <summary>Load older</summary>
          <div class="telegram-tool-row">
            <select aria-label="Extend activity range by" bind:value={rangeStep} disabled={loadingSources}>
              <option value="day">1 day</option>
              <option value="week">1 week</option>
              <option value="month">1 month</option>
            </select>
            <button class="telegram-tool" disabled={loadingSources} onclick={() => expandRange()}>Load older</button>
            <button class="telegram-tool" disabled={loadingSources} onclick={() => expandRange(true)}>Reset to 6 months</button>
          </div>
        </details>
        {#if loadingSources}<div class="telegram-range-status telegram-progress" role="status"><span class="telegram-spinner" aria-hidden="true"></span>Loading conversations…</div>{/if}
      {/if}
    </aside>

    <main class="slack-conversation">
      {#if error}<div class="slack-error">{error}</div>{/if}
      {#if !selected}
        <div class="slack-empty"><span>Select a contact or chat.</span></div>
      {:else}
        <header class="slack-conversation-head">
          <b>{telegramConversationPrefix(selected)}{telegramConversationName(selected)}</b>
          <label>Messages per load <input type="number" min="10" max="200" value={pageSize} onchange={async (e) => { const n = Number((e.currentTarget as HTMLInputElement).value); await telegramApi.setPageSize(n); if (overview) overview = { ...overview, preferences: { message_page_size: Math.max(10, Math.min(200, n)) } } }} /></label>
        </header>
        <div class="slack-timeline" bind:this={timeline} onscroll={timelineScroll}>
          {#if loadingMessages}<div class="slack-loading telegram-progress" role="status"><span class="telegram-spinner" aria-hidden="true"></span>Loading messages…</div>{/if}
          {#each messages as m (m.id)}
            <article id={'telegram-message-' + m.id} class="telegram-message" class:telegram-highlight={highlightedMessageId === m.id}>
              <div class="slack-message-body">
                <div class="slack-message-meta">
                  <b>{authorLabel(m)}</b>
                  {#if m.author_username}<span>@{m.author_username}</span>{/if}
                  <time>{time(m.occurred_at)}</time>
                  {#if m.edited_at}<span>edited</span>{/if}
                  {#if m.reply_to_external_id}<span>↩ reply</span>{/if}
                </div>
                <div class="slack-message-text">{m.content}</div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </main>
    </div>
  </div>
{/if}

<style>
  .telegram-drag-handle { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 28px; width: 28px; height: 32px; border: 1px solid var(--arbol-color-border); border-radius: 4px; background: var(--arbol-color-surface-1); color: var(--arbol-color-text); padding: 4px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
  .telegram-drag-handle svg { flex: none; pointer-events: none; }
  .telegram-drag-handle:hover { background: var(--arbol-color-surface-2); }
  .telegram-drag-handle:disabled { opacity: .3; cursor: default; }
  .telegram-dragging { opacity: .5; }
  .telegram-dragging .telegram-drag-handle { cursor: grabbing; }
  .telegram-drop-target { outline: 2px solid var(--arbol-color-border); outline-offset: -2px; }
  .telegram-order { border: 0; background: transparent; color: var(--arbol-color-text-muted); cursor: pointer; padding: 4px; }
  .telegram-order:disabled { opacity: .3; cursor: default; }
  .telegram-highlight { background: var(--arbol-color-surface); outline: 2px solid var(--arbol-color-border); }
  .telegram-source-tools { padding: 12px; border-bottom: 1px solid var(--arbol-color-border); }
  .telegram-tool-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .telegram-source-tools p, .telegram-source-tools label, .telegram-result-detail { font-size: 12px; color: var(--arbol-color-text-muted); }
  .telegram-source-tools form { margin: 0; }
  .telegram-source-tools input { min-width: 0; flex: 1; width: 100%; }
  .telegram-tool, .telegram-range select, .telegram-source-tools input { padding: 7px 9px; border: 1px solid var(--arbol-color-border); border-radius: 8px; background: var(--arbol-color-bg); color: var(--arbol-color-text); }
  .telegram-tool { cursor: pointer; }
  .telegram-tool:disabled { opacity: .5; cursor: default; }
  .slack-tabs { flex-wrap: wrap; }
  .telegram-find-toggle { margin-left: auto; }
  .telegram-range { padding: 12px; border-top: 1px solid var(--arbol-color-border); }
  .telegram-range summary, .telegram-search-help summary { cursor: pointer; color: var(--arbol-color-text-muted); font-size: 12px; }
  .telegram-range-label { margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--arbol-color-border); font-size: 12px; line-height: 1.5; color: var(--arbol-color-text-muted); }
  .telegram-range-label time { display: block; color: var(--arbol-color-text); }
  .telegram-progress { display: flex; align-items: center; gap: 8px; color: var(--arbol-color-text-muted); font-size: 12px; }
  .telegram-sync-status, .telegram-range-status { padding: 10px 12px; }
  .telegram-spinner { display: inline-block; width: 13px; height: 13px; flex-shrink: 0; border: 2px solid var(--arbol-color-border); border-top-color: currentColor; border-radius: 50%; animation: telegram-spin .8s linear infinite; }
  @keyframes telegram-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .telegram-spinner { animation: none; } }
  .telegram-result-detail { display: block; margin-top: 4px; }
</style>
