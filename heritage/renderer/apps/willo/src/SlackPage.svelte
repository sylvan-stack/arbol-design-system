<script lang="ts">
  import { entityLinkTarget } from '@arbol/design-system'
  import { onMount, tick } from 'svelte'
  import { callNative, subscribe, onCoreReconnect, GraftModal, type GraftSource } from '@arbol/design-system'
  import { slackApi, slackConversationName, type SlackConversation, type SlackCursor, type SlackMessage, type SlackOverview } from './slackApi'
  import SlackMessageView from './SlackMessageView.svelte'
  import { attentionApi } from './attentionApi'

  type SlackOpenTarget = { conversationExternalId: string; threadTs?: string; messageTs?: string }
  let {
    target = null,
    spotlightedSlackMessageIds = [],
    onSpotlightsChanged,
  }: {
    target?: SlackOpenTarget | null
    spotlightedSlackMessageIds?: string[]
    onSpotlightsChanged?: () => void | Promise<void>
  } = $props()

  let overview = $state<SlackOverview | null>(null)
  let contacts = $state<SlackConversation[]>([])
  let channels = $state<SlackConversation[]>([])
  let ignoredConversations = $state<SlackConversation[]>([])
  let selected = $state<SlackConversation | null>(null)
  let tab = $state<'contacts' | 'channels' | 'ignored'>('contacts')
  let messages = $state<SlackMessage[]>([])
  let before = $state<SlackCursor | null>(null)
  let hasMore = $state(false)
  let loading = $state(true)
  let syncing = $state(false)
  let loadingMessages = $state(false)
  let error = $state<string | null>(null)
  let dragId = $state<string | null>(null)
  let timeline = $state<HTMLDivElement>()
  let expandedThreads = $state<Record<string, boolean>>({})
  let threadReplies = $state<Record<string, SlackMessage[]>>({})
  let loadingThreads = $state<Record<string, boolean>>({})
  let copiedMessageId = $state<string | null>(null)
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null
  let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let liveRefreshInFlight = false
  let liveRefreshQueued = false
  let messageSnapshotGeneration = 0
  let lastReconcileRequestAt = 0
  let targetReady = $state(false)
  let openingTarget = false
  let queuedTarget: SlackOpenTarget | null = null
  let highlightedMessageTs = $state<string | null>(null)
  let breathingMessageTs = $state<string | null>(null)
  let graftMessage = $state<SlackMessage | null>(null)
  let graftConversation = $state<SlackConversation | null>(null)
  let highlightBreathingTimer: ReturnType<typeof setTimeout> | null = null
  let changingSpotlight = $state<Record<string, boolean>>({})

  const spotlightedSlackMessages = $derived(new Set(spotlightedSlackMessageIds))
  const isMessageSpotlighted = (message: SlackMessage) => spotlightedSlackMessages.has(message.id)
  const pageSize = $derived(overview?.preferences.message_page_size || 30)
  const vipContacts = $derived(contacts.filter((c) => !!c.is_vip))
  const regularContacts = $derived(contacts.filter((c) => !c.is_vip))
  const vipChannels = $derived(channels.filter((c) => !!c.is_vip))
  const regularChannels = $derived(channels.filter((c) => !c.is_vip))
  const msg = (e: unknown) => e instanceof Error ? e.message : String(e)

  async function loadOverview() {
    overview = await slackApi.overview()
    if (overview.has_data) await loadSources()
  }

  async function loadSources() {
    const [nextContacts, nextChannels, nextIgnored] = await Promise.all([
      slackApi.contacts(), slackApi.channels(), slackApi.ignored(),
    ])
    contacts = nextContacts
    channels = nextChannels
    ignoredConversations = nextIgnored
    if (selected) selected = [...contacts, ...channels].find((c) => c.id === selected?.id) || null
  }

  function selectTab(next: 'contacts' | 'channels' | 'ignored') {
    tab = next
  }

  function clearMessageHighlight() {
    highlightedMessageTs = null
    breathingMessageTs = null
    if (highlightBreathingTimer) clearTimeout(highlightBreathingTimer)
    highlightBreathingTimer = null
  }

  async function highlightSourceMessage(messageTs: string) {
    // Keep the selected message highlighted until the user opens another
    // conversation. Only the attention-seeking breathing phase is transient.
    highlightedMessageTs = messageTs
    breathingMessageTs = null
    await tick()
    breathingMessageTs = messageTs
    await tick()
    const message = timeline?.querySelector<HTMLElement>(`[data-message-ts="${CSS.escape(messageTs)}"]`)
    message?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (highlightBreathingTimer) clearTimeout(highlightBreathingTimer)
    highlightBreathingTimer = setTimeout(() => {
      breathingMessageTs = null
      highlightBreathingTimer = null
    }, 3000)
  }

  async function openQuickInputTarget(next: SlackOpenTarget) {
    if (openingTarget) {
      queuedTarget = next
      return
    }
    openingTarget = true
    try {
      let conversation = [...contacts, ...channels, ...ignoredConversations]
        .find((item) => item.external_id === next.conversationExternalId)
      if (!conversation) {
        await loadSources()
        conversation = [...contacts, ...channels, ...ignoredConversations]
          .find((item) => item.external_id === next.conversationExternalId)
      }
      if (!conversation) throw new Error('Imported Slack conversation is not visible yet')
      tab = conversation.kind === 'im' ? 'contacts'
        : ignoredConversations.some((item) => item.id === conversation?.id) ? 'ignored' : 'channels'
      await openConversation(conversation)
      const threadTs = next.threadTs
      if (threadTs) {
        loadingThreads = { ...loadingThreads, [threadTs]: true }
        try {
          const replies = await slackApi.threadReplies(conversation.id, threadTs)
          threadReplies = { ...threadReplies, [threadTs]: replies }
          expandedThreads = { ...expandedThreads, [threadTs]: true }
        } finally {
          loadingThreads = { ...loadingThreads, [threadTs]: false }
        }
      }
      const messageTs = next.messageTs || threadTs
      if (messageTs) await highlightSourceMessage(messageTs)
    } finally {
      openingTarget = false
      const queued = queuedTarget
      queuedTarget = null
      if (queued) void openQuickInputTarget(queued).catch((e) => { error = msg(e) })
    }
  }

  $effect(() => {
    const next = target
    if (!targetReady || !next?.conversationExternalId) return
    void openQuickInputTarget(next).catch((e) => { error = msg(e) })
  })

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
      unsubscribe = subscribe('slack.surface.events', {}, (event) => {
        if (event.kind === 'error') return
        // `ready` reconciles the initial snapshot→subscription handshake;
        // `changed` is emitted directly after Slack ingestion commits in Core.
        if (event.event === 'slack.surface.ready') refreshLive(0)
        else if (event.event === 'slack.surface.changed') refreshLive()
      })
    }
    const reconcileWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshLive(0)
      // Socket Mode frames are live-only. Ask integrations for a single bounded
      // Web API catch-up when the user returns; throttle focus+visibility pairs.
      const now = Date.now()
      if (now - lastReconcileRequestAt < 30_000) return
      lastReconcileRequestAt = now
      void slackApi.reconcile().catch((e) => { if (!disposed) error = msg(e) })
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
        targetReady = true
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
      if (copyResetTimer) clearTimeout(copyResetTimer)
      if (highlightBreathingTimer) clearTimeout(highlightBreathingTimer)
      liveRefreshTimer = null
      highlightBreathingTimer = null
      liveRefreshQueued = false
    }
  })

  async function sync() {
    syncing = true; error = null
    try {
      const started = await slackApi.sync()
      if (overview) overview = { ...overview, sync: started.sync }
      // Progress and completion are pushed by `slack.surface.events` as the
      // integration daemon commits sync-state updates in Core.
    } catch (e) { error = msg(e) } finally { syncing = false }
  }

  async function openConversation(c: SlackConversation) {
    clearMessageHighlight()
    const generation = ++messageSnapshotGeneration
    selected = c; messages = []; before = null; hasMore = false; expandedThreads = {}; threadReplies = {}; loadingThreads = {}; loadingMessages = true; error = null
    try {
      const page = await slackApi.messages(c.id, pageSize)
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
    const expanded = Object.entries(expandedThreads).filter(([, open]) => open).map(([ts]) => ts)
    try {
      const [page, refreshedThreads] = await Promise.all([
        slackApi.messages(current.id, Math.max(pageSize, messages.length || pageSize)),
        Promise.all(expanded.map(async (threadTs) => [
          threadTs,
          await slackApi.threadReplies(current.id, threadTs),
        ] as const)),
      ])
      if (generation !== messageSnapshotGeneration || selected?.id !== current.id) return
      messages = page.messages; before = page.next_before; hasMore = page.has_more
      if (refreshedThreads.length) {
        threadReplies = { ...threadReplies, ...Object.fromEntries(refreshedThreads) }
      }
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
      const page = await slackApi.messages(current.id, pageSize, before)
      if (generation !== messageSnapshotGeneration || selected?.id !== current.id) return
      const existingIds = new Set(messages.map((message) => message.id))
      messages = [...page.messages.filter((message) => !existingIds.has(message.id)), ...messages]
      before = page.next_before; hasMore = page.has_more
      await tick(); currentTimeline.scrollTop += currentTimeline.scrollHeight - oldHeight
    } catch (e) { error = msg(e) }
    finally { if (generation === messageSnapshotGeneration) loadingMessages = false }
  }

  function timelineScroll() { if (timeline && timeline.scrollTop < 80) loadOlder() }

  async function toggleThread(message: SlackMessage) {
    if (!selected || !message.reply_count) return
    const threadTs = message.external_ts
    if (expandedThreads[threadTs]) {
      expandedThreads = { ...expandedThreads, [threadTs]: false }
      return
    }
    expandedThreads = { ...expandedThreads, [threadTs]: true }
    if (threadReplies[threadTs] || loadingThreads[threadTs]) return
    loadingThreads = { ...loadingThreads, [threadTs]: true }
    try {
      const replies = await slackApi.threadReplies(selected.id, threadTs)
      if (selected) threadReplies = { ...threadReplies, [threadTs]: replies }
    } catch (e) {
      error = msg(e)
      expandedThreads = { ...expandedThreads, [threadTs]: false }
    } finally {
      loadingThreads = { ...loadingThreads, [threadTs]: false }
    }
  }

  async function writeClipboard(text: string) {
    // Clipboard API writes are denied for our arbolapp:// WKWebView origin even
    // though `navigator.clipboard` exists. Use the macOS pasteboard in-app.
    if (window.webkit?.messageHandlers?.arbol) {
      const result = await callNative('clipboard.writeText', { text }) as { ok?: boolean; error?: string }
      if (!result?.ok) throw new Error(result?.error || 'Could not copy the Slack link')
      return
    }
    // Keep the browser path usable for previews and renderer tests. Some
    // browsers expose writeText but reject it outside a secure origin, so only
    // treat it as successful after the promise resolves.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // Fall through to the selection-based compatibility path.
    }
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.focus()
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    if (!copied) throw new Error('Could not copy the Slack link')
  }


  function openGraft(message: SlackMessage, conversation = selected) {
    if (!conversation) return
    graftMessage = message
    graftConversation = conversation
  }

  function closeGraft() {
    graftMessage = null
    graftConversation = null
  }

  function graftSource(message: SlackMessage): GraftSource {
    return {
      repo: 'Any',
      kind: 'slack',
      entityId: message.id,
      title: (message.rendered_content ?? message.content).replace(/\s+/g, ' ').trim().slice(0, 240) || 'Slack message',
    }
  }

  function graftTitle(message: SlackMessage, conversation: SlackConversation): string {
    const author = message.author_name || message.author_external_id || 'Unknown'
    const context = `${conversation.kind === 'im' ? '' : '#'}${slackConversationName(conversation)}`
    return `${author} in ${context}`
  }

  async function copyMessageLink(message: SlackMessage, conversation = selected) {
    if (!conversation) return
    try {
      // Ask Slack for its canonical URL. This works for root messages and thread
      // replies and does not rely on a separately configured workspace domain.
      const permalink = await slackApi.permalink(conversation.external_id, message.external_ts, message.thread_ts)
      if (!permalink) throw new Error('Slack did not return a message link')
      await writeClipboard(permalink)
      copiedMessageId = message.id
      if (copyResetTimer) clearTimeout(copyResetTimer)
      copyResetTimer = setTimeout(() => { copiedMessageId = null; copyResetTimer = null }, 1800)
    } catch (e) {
      error = msg(e)
    }
  }

  async function toggleMessageSpotlight(message: SlackMessage, conversation = selected) {
    if (!conversation || changingSpotlight[message.id]) return
    const wasSpotlighted = isMessageSpotlighted(message)
    changingSpotlight = { ...changingSpotlight, [message.id]: true }
    error = null
    try {
      if (wasSpotlighted) {
        await attentionApi.remove({ kind: 'slack', entity_id: message.id })
      } else {
        const threadTs = message.thread_ts || message.external_ts
        await attentionApi.addSlackThread(conversation.external_id, threadTs, message.external_ts)
      }
      // Refresh the shared snapshot so this hover action and the Spotlight
      // column switch state together after the durable mutation succeeds.
      await onSpotlightsChanged?.()
    } catch (e) {
      error = msg(e)
    } finally {
      const { [message.id]: _, ...rest } = changingSpotlight
      changingSpotlight = rest
    }
  }


  async function toggleVip(c: SlackConversation) {
    const next = !c.is_vip
    const update = (items: SlackConversation[]) => items.map((x) => x.id === c.id ? { ...x, is_vip: next, sort_position: null } : x)
    if (c.kind === 'im') contacts = update(contacts)
    else channels = update(channels)
    try { await slackApi.setVip(c.id, next); await loadSources() }
    catch (e) { error = msg(e); await loadSources() }
  }

  async function ignore(c: SlackConversation) {
    // WKWebView does not provide a JavaScript confirm panel in the Willo host,
    // so window.confirm() silently prevented this RPC from ever being sent.
    // Ignore is intentionally a direct, optimistic action from the hover control.
    const wasSelected = selected?.id === c.id
    contacts = contacts.filter((x) => x.id !== c.id)
    channels = channels.filter((x) => x.id !== c.id)
    if (wasSelected) { selected = null; messages = [] }
    error = null
    try {
      await slackApi.ignore(c.id)
      await Promise.all([loadSources(), loadOverview()])
    } catch (e) {
      error = msg(e)
      await loadSources()
      if (wasSelected) selected = [...contacts, ...channels].find((x) => x.id === c.id) || null
    }
  }

  async function unignore(c: SlackConversation) {
    ignoredConversations = ignoredConversations.filter((x) => x.id !== c.id)
    error = null
    try {
      await slackApi.unignore(c.id)
      await Promise.all([loadSources(), loadOverview()])
    } catch (e) {
      error = msg(e)
      await loadSources()
    }
  }

  async function dropOn(target: SlackConversation, section: SlackConversation[], isVip: boolean, source: 'contacts' | 'channels') {
    if (!dragId || dragId === target.id) return
    const from = section.findIndex((c) => c.id === dragId)
    const to = section.findIndex((c) => c.id === target.id)
    if (from < 0 || to < 0) return
    const reordered = [...section]
    const [moved] = reordered.splice(from, 1); reordered.splice(to, 0, moved)
    const all = source === 'contacts' ? contacts : channels
    const other = all.filter((c) => !!c.is_vip !== isVip)
    const next = isVip ? [...reordered, ...other] : [...other, ...reordered]
    if (source === 'contacts') contacts = next
    else channels = next
    dragId = null
    try { await slackApi.reorder(reordered.map((c) => c.id), isVip); await loadSources() }
    catch (e) { error = msg(e); await loadSources() }
  }

  function time(ts: number) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  }
</script>

{#if loading}
  <div class="slack-empty"><span>Loading…</span></div>
{:else if !overview?.has_data}
  <div class="slack-empty">
    <button class="slack-sync" onclick={sync} disabled={syncing}>{syncing ? 'Syncing with Slack…' : overview?.sync.status === 'failed' ? 'Retry Sync with Slack' : 'Sync with Slack'}</button>
    {#if error}<div class="slack-error">{error}</div>{/if}
  </div>
{:else}
  <div class="slack-page">
    <nav class="slack-tabs" aria-label="Slack pages">
      <button class:active={tab === 'contacts'} onclick={() => selectTab('contacts')}>Contacts</button>
      <button class:active={tab === 'channels'} onclick={() => selectTab('channels')}>Channels</button>
      <button class:active={tab === 'ignored'} onclick={() => selectTab('ignored')}>
        Ignored{ignoredConversations.length ? ` (${ignoredConversations.length})` : ''}
      </button>
    </nav>

    <div class="slack-browser">
    <aside class="slack-sources">
      {#if tab === 'contacts'}
        <section class="slack-source-section">
          <h2>VIP</h2>
          {#each vipContacts as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem" draggable="true" ondragstart={() => (dragId = c.id)} ondragover={(e) => e.preventDefault()} ondrop={() => dropOn(c, vipContacts, true, 'contacts')}>
              <button class="slack-source-main" onclick={() => openConversation(c)}>{slackConversationName(c)}</button>
              <button class="slack-star on" title="Remove from VIP" onclick={() => toggleVip(c)}>★</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
        <section class="slack-source-section">
          <h2>Regular</h2>
          {#each regularContacts as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem" draggable="true" ondragstart={() => (dragId = c.id)} ondragover={(e) => e.preventDefault()} ondrop={() => dropOn(c, regularContacts, false, 'contacts')}>
              <button class="slack-source-main" onclick={() => openConversation(c)}>{slackConversationName(c)}</button>
              <button class="slack-star" title="Add to VIP" onclick={() => toggleVip(c)}>☆</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
      {:else if tab === 'channels'}
        <section class="slack-source-section">
          <h2>VIP</h2>
          {#each vipChannels as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem" draggable="true" ondragstart={() => (dragId = c.id)} ondragover={(e) => e.preventDefault()} ondrop={() => dropOn(c, vipChannels, true, 'channels')}>
              <button class="slack-source-main" onclick={() => openConversation(c)}># {slackConversationName(c)}</button>
              <button class="slack-star on" title="Remove from VIP" aria-label={`Remove ${slackConversationName(c)} from VIP`} onclick={() => toggleVip(c)}>★</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
        <section class="slack-source-section">
          <h2>Regular</h2>
          {#each regularChannels as c (c.id)}
            <div class:selected={selected?.id === c.id} class="slack-source" role="listitem" draggable="true" ondragstart={() => (dragId = c.id)} ondragover={(e) => e.preventDefault()} ondrop={() => dropOn(c, regularChannels, false, 'channels')}>
              <button class="slack-source-main" onclick={() => openConversation(c)}># {slackConversationName(c)}</button>
              <button class="slack-star" title="Add to VIP" aria-label={`Add ${slackConversationName(c)} to VIP`} onclick={() => toggleVip(c)}>☆</button>
              <button class="slack-ignore" onclick={() => ignore(c)}>Ignore</button>
            </div>
          {/each}
        </section>
      {:else}
        <section class="slack-source-section slack-ignored-section">
          <h2>Ignored</h2>
          {#if ignoredConversations.length === 0}
            <p class="slack-source-empty">No ignored contacts or channels.</p>
          {:else}
            {#each ignoredConversations as c (c.id)}
              <div class="slack-source" role="listitem">
                <span class="slack-source-label">{c.kind === 'im' ? '' : '# '}{slackConversationName(c)}</span>
                <button class="slack-unignore" onclick={() => unignore(c)}>Unignore</button>
              </div>
            {/each}
          {/if}
        </section>
      {/if}
    </aside>

    <main class="slack-conversation">
      {#if error}<div class="slack-error">{error}</div>{/if}
      {#if !selected}
        <div class="slack-empty"><span>Select a contact or channel.</span></div>
      {:else}
        <header class="slack-conversation-head">
          <b>{selected.kind === 'im' ? '' : '# '}{slackConversationName(selected)}</b>
          <label>Messages per load <input type="number" min="10" max="200" value={pageSize} onchange={async (e) => { const n = Number((e.currentTarget as HTMLInputElement).value); await slackApi.setPageSize(n); if (overview) overview = { ...overview, preferences: { message_page_size: Math.max(10, Math.min(200, n)) } } }} /></label>
        </header>
        <div class="slack-timeline" bind:this={timeline} onscroll={timelineScroll}>
          {#if loadingMessages && messages.length === 0}<div class="slack-loading">Loading messages…</div>{/if}
          {#if loadingMessages && messages.length > 0}<div class="slack-loading">Loading older messages…</div>{/if}
          {#each messages as m (m.id)}
            <article
              class="slack-message"
              use:entityLinkTarget={{ repo: 'Any', kind: 'slack', entityId: m.id, title: (m.rendered_content ?? m.content).slice(0, 120) || 'Slack message' }}
              class:has-thread={!!m.reply_count}
              class:source-highlight={highlightedMessageTs === m.external_ts}
              class:source-highlight-breathing={breathingMessageTs === m.external_ts}
              data-message-ts={m.external_ts}
            >
              <SlackMessageView message={m} {time} copied={copiedMessageId === m.id} oncopy={copyMessageLink} ongraft={openGraft} spotlighted={isMessageSpotlighted(m)} spotlightBusy={!!changingSpotlight[m.id]} onspotlight={toggleMessageSpotlight} />
              <div class="slack-message-thread-content">
                {#if m.reply_count}
                  <button class="slack-thread-toggle" aria-expanded={!!expandedThreads[m.external_ts]} onclick={() => toggleThread(m)}>
                    <span class="slack-thread-chevron" class:expanded={!!expandedThreads[m.external_ts]}>›</span>
                    {m.reply_count} {m.reply_count === 1 ? 'reply' : 'replies'}
                  </button>
                {/if}
                {#if expandedThreads[m.external_ts]}
                  <div class="slack-thread">
                    {#if loadingThreads[m.external_ts]}
                      <div class="slack-thread-loading">Loading thread…</div>
                    {:else}
                      {#each threadReplies[m.external_ts] || [] as reply (reply.id)}
                        <article
                          class="slack-thread-reply"
                          use:entityLinkTarget={{ repo: 'Any', kind: 'slack', entityId: reply.id, title: (reply.rendered_content ?? reply.content).slice(0, 120) || 'Slack message' }}
                          class:source-highlight={highlightedMessageTs === reply.external_ts}
                          class:source-highlight-breathing={breathingMessageTs === reply.external_ts}
                          data-message-ts={reply.external_ts}
                        >
                          <SlackMessageView message={reply} {time} compact copied={copiedMessageId === reply.id} oncopy={copyMessageLink} ongraft={openGraft} spotlighted={isMessageSpotlighted(reply)} spotlightBusy={!!changingSpotlight[reply.id]} onspotlight={toggleMessageSpotlight} />
                        </article>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </main>
    </div>
  </div>
{/if}


{#if graftMessage && graftConversation}
  <GraftModal
    source={graftSource(graftMessage)}
    initialTitle={graftTitle(graftMessage, graftConversation)}
    onClose={closeGraft}
    onSaved={() => { error = null }}
    onError={(message) => (error = message)}
  />
{/if}
