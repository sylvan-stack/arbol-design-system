<script lang="ts">
  /* Willo Station root (Svelte 5; ux-ui-guide §4). Navigation Panel | page:
   * Stations (the chat-session grid: Drafted/Running/Unread/On-going/Other
   * sections, live tails, event-driven refresh, activity-debounced ordering,
   * pagination, page-scoped transcript search, rename/on-going/read actions),
   * Blueprint Runs. Operational event inspection lives in Seqoya Monitoring.
   * Parity checklist vs the pre-Svelte Willo:
   * ~/Artifacts/Arbol/plans/willo-station-parity.md (compact mode remains). */
  import { onMount, onDestroy, untrack } from 'svelte'
  import { UIShell, ShellInsignia, Dot, Button, THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, callNative, subscribe, onCoreDisconnect, onCoreReconnect, installSharedCmdNumberHotkeys, installSharedWilloPageHotkeys, openEntityContextMenu } from '@arbol/design-system'
  import { listSessions, listStewardSessions, listIntelligenceProviders, getLightSession, openDraftInElma, openSessionInElma, renameSession, setSessionOnGoing, setSessionUnread, getSessionDetails, setAlwaysOnTop, beginWindowDrag, listBlueprintRuns, getBlueprintRun, type StationSession, type BlueprintRun, type BlueprintRunDetails, type IntelligenceProvider, type ElmaSearchHandoff } from './api'
  import { stationIsAgentic, withParentStationState, applyPendingSessionPatches, removeDraftFromStations, stationOrderActivity, type PendingSessionPatch, type StationOrderActivityMap, type TokenUsage } from './stations'
  import { fmtClockTime, stationAppearsDrafted, stationHasDraft, stationIsDraftOnly, stationIsRunning, stationIsUnread, stationOnGoing, compactActivityGroupSpacingPx, type IpByName } from './helpers'
  import { beginGenerationActivity, generationSpeeds, openLiveTails, recordGeneratedChunk, type GenerationActivity, type GenerationSpeed } from './liveTails'
  import { buildSearchHits, groupSearchHits, messageTurnMapFromMessages, splitHighlight, type StationSearchHit } from './stationSearch'
  import StationCard from './StationCard.svelte'
  import OpenInElmaBadge from './OpenInElmaBadge.svelte'
  import StationTags from './StationTags.svelte'
  import RunningChatBackground from './RunningChatBackground.svelte'
  import CompactStationCard from './CompactStationCard.svelte'
  import PaginationControls, { DEFAULT_STATIONS_PAGE_SIZE, type PageSize } from './PaginationControls.svelte'
  import BlueprintRuns from './BlueprintRuns.svelte'
  import RunDetails from './RunDetails.svelte'
  import SlackPage from './SlackPage.svelte'
  import TelegramPage from './TelegramPage.svelte'
  import EmailsPage from './EmailsPage.svelte'
  import ComunicadosPage from './ComunicadosPage.svelte'
  import AttentionColumn from './AttentionColumn.svelte'
  import { attentionApi, type ComunicadoItem, type SpotlightItem, type AttentionDescriptor } from './attentionApi'
  import WilloGlyph from './WilloGlyph.svelte'
  import { mailApi, mailSyncProgressLabel, type MailStatus, type MailSyncProgress } from './mailApi'
  import { emailSyncStatusText } from './emailAutomationState'

  type Page = 'stations' | 'agentic-stations' | 'stewards' | 'comunicados' | 'slack' | 'telegram' | 'emails' | 'runs' | 'run-details'
  type SlackOpenTarget = { conversationExternalId: string; threadTs?: string; messageTs?: string }

  // Elma publishes its attached Chat Session through shared browser state. Keep
  // the storage fallback because WKWebView does not reliably relay storage or
  // BroadcastChannel events between every Arbol window.
  const ELMA_ACTIVE_CHAT_SESSION_KEY = 'arbol:elma:active-chat-session-id'
  const ELMA_ACTIVE_CHAT_SESSION_CHANNEL = 'arbol:elma:active-chat-session'
  function readElmaActiveChatSessionId(): string {
    try { return localStorage.getItem(ELMA_ACTIVE_CHAT_SESSION_KEY) || '' } catch { return '' }
  }

  let emailsEnabled = $state(false)
  let page = $state<Page>('stations')
  let telegramOpenTarget = $state<{ messageId?: string; conversationId?: string } | null>(null)
  let slackOpenTarget = $state<SlackOpenTarget | null>(null)

  function acceptOpen(payload: { telegram_conversation_id?: unknown; telegram_message_id?: unknown; page?: unknown; slack_conversation_external_id?: unknown; slack_thread_ts?: unknown; slack_message_ts?: unknown } | null | undefined): boolean {
    const requested = payload?.page
    if (requested !== 'stations' && requested !== 'agentic-stations' && requested !== 'stewards' && requested !== 'comunicados' && requested !== 'slack' && requested !== 'telegram' && requested !== 'emails' && requested !== 'runs') return false
    compact = false
    page = requested === 'emails' && !emailsEnabled ? 'stations' : requested
    if (requested === 'telegram' && typeof payload?.telegram_conversation_id === 'string') {
      telegramOpenTarget = { conversationId: payload.telegram_conversation_id }
    }
    if (requested === 'telegram' && typeof payload?.telegram_message_id === 'string') {
      telegramOpenTarget = { messageId: payload.telegram_message_id }
    }
    if (requested === 'slack' && typeof payload?.slack_conversation_external_id === 'string') {
      // A fresh object also retriggers scrolling and breathing when the same
      // Spotlight card is selected more than once.
      slackOpenTarget = {
        conversationExternalId: payload.slack_conversation_external_id,
        ...(typeof payload.slack_thread_ts === 'string' ? { threadTs: payload.slack_thread_ts } : {}),
        ...(typeof payload.slack_message_ts === 'string' ? { messageTs: payload.slack_message_ts } : {}),
      }
    }
    if (window.webkit?.messageHandlers?.arbol) {
      void callNative('app.consumeOpen', { page: requested }).catch(() => {})
    }
    return true
  }
  let theme = $state(localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME)
  let sessions = $state<StationSession[]>([])
  let filteredStewardSessions = $state<StationSession[]>([])
  let stewardSessionsError = $state<string | null>(null)
  let activeElmaSessionId = $state(readElmaActiveChatSessionId())
  let sessionsLoading = $state(true)
  let sessionsError = $state<string | null>(null)
  let sessionsRetryTimer: ReturnType<typeof setTimeout> | null = null
  let ips = $state<IntelligenceProvider[]>([])
  let liveTails = $state<Record<string, string>>({})
  let liveUsage = $state<Record<string, TokenUsage>>({})
  let generationActivity = $state<Record<string, GenerationActivity>>({})
  let generationClock = $state(Date.now())
  let runs = $state<BlueprintRun[]>([])
  let runDetails = $state<BlueprintRunDetails | null>(null)
  let runsLoading = $state(false)
  let detailsLoading = $state(false)
  let stationMailStatus = $state<MailStatus | null>(null)
  let stationEmailSyncProgress = $state<MailSyncProgress | null>(null)
  let stationEmailSyncTimer: ReturnType<typeof setTimeout> | null = null
  let stationEmailSyncRefreshRunning = false
  let stationEmailSyncRefreshPending = false
  let comunicadoFeedOnTop = $state(false)
  let comunicadoFeedCount = $state(0)
  let comunicadoFeedVisible = $state(false)
  let comunicadoFeedUpdating = $state(false)
  let comunicadoFeedError = $state<string | null>(null)
  let actionItems = $state<ComunicadoItem[]>([])
  let spotlights = $state<SpotlightItem[]>([])
  let attentionLoading = $state(true)
  let attentionError = $state<string | null>(null)
  let removingSpotlight = $state<Record<string, boolean>>({})
  let spotlightingComunicado = $state<Record<string, boolean>>({})
  let closingActionItem = $state<Record<string, boolean>>({})
  let decidingActionItem = $state<Record<string, boolean>>({})
  let attentionRefreshInFlight = false
  let attentionRefreshQueued = false
  let emptySpotlightConfirmationTimer: ReturnType<typeof setTimeout> | null = null

  const spotlightedSlackMessageIds = $derived(spotlights
    .filter((item) => item.target.kind === 'slack')
    .map((item) => item.target.entity_id))

  let coreConnected = $state(true)
  let chatSessionSurfaceUnsubscribe: (() => void) | null = null
  let draftSurfaceUnsubscribe: (() => void) | null = null
  let attentionSurfaceUnsubscribe: (() => void) | null = null

  $effect(() => {
    const trackedPage = page === 'run-details' ? 'runs' : page
    void callNative('app.consumeOpen', { page: trackedPage }).catch(() => {})
  })
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  })

  // `listSessions` performs more than one RPC (the session snapshot plus draft
  // decoration), so concurrent refreshes can complete out of order. In
  // particular, a slow refresh started for TURN_FAILED must not overwrite the
  // newer `running` snapshot requested after USER_SENT_MESSAGE/TURN_STARTED.
  let sessionsRefreshGeneration = 0
  let sessionMutationGeneration = 0
  const pendingSessionPatches = new Map<string, PendingSessionPatch>()
  function formatEmailSyncTime(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(timestamp))
  }

  function scheduleStationEmailSyncRefresh(delay: number) {
    if (!emailsEnabled) return
    if (stationEmailSyncTimer !== null) clearTimeout(stationEmailSyncTimer)
    stationEmailSyncTimer = setTimeout(() => {
      stationEmailSyncTimer = null
      void refreshStationEmailSyncStatus()
    }, delay)
  }

  /** Keep email activity in the Station chrome rather than in the Emails page.
   * Sync All can start after any user chat message while any Willo page is
   * open, so this process-wide poll must live at the App root. Native progress
   * is cheap to read; Core status is refreshed at startup, after snapshot dirty
   * signals, and when a running operation reaches its terminal state. */
  async function refreshStationEmailSyncStatus(refreshDurableStatus = false) {
    if (!emailsEnabled) return
    if (stationEmailSyncRefreshRunning) {
      stationEmailSyncRefreshPending = stationEmailSyncRefreshPending || refreshDurableStatus
      return
    }
    stationEmailSyncRefreshRunning = true
    const previousProgress = stationEmailSyncProgress
    try {
      const progress = await mailApi.syncProgress()
      stationEmailSyncProgress = progress
      const newlyFinished = progress.phase === 'finished'
        && progress.run_id !== previousProgress?.run_id
      if (refreshDurableStatus || (previousProgress?.running && !progress.running)
          || newlyFinished || stationMailStatus === null) {
        stationMailStatus = await mailApi.status()
      }
    } catch {
      // Email status is supplementary chrome. A transient native/Core restart
      // must not replace the primary Willo connection status with an error.
    } finally {
      stationEmailSyncRefreshRunning = false
      const refreshPending = stationEmailSyncRefreshPending
      stationEmailSyncRefreshPending = false
      if (refreshPending) scheduleStationEmailSyncRefresh(0)
      else scheduleStationEmailSyncRefresh(stationEmailSyncProgress?.running ? 400 : 2_000)
    }
  }

  function applySpotlightSnapshot(nextSpotlights: SpotlightItem[]) {
    if (nextSpotlights.length > 0 || spotlights.length === 0) {
      if (emptySpotlightConfirmationTimer !== null) {
        clearTimeout(emptySpotlightConfirmationTimer)
        emptySpotlightConfirmationTimer = null
      }
      spotlights = nextSpotlights
      return
    }
    if (emptySpotlightConfirmationTimer !== null) return

    // Spotlight is a durable set. During Core reconnect/catalog refresh a dirty
    // signal can occasionally expose an empty intermediate read. Keep the last
    // good cards visible and only accept empty after a quiet confirmation, so
    // the whole section cannot disappear and immediately reappear.
    emptySpotlightConfirmationTimer = setTimeout(async () => {
      emptySpotlightConfirmationTimer = null
      try {
        const confirmedSpotlights = await attentionApi.spotlights()
        spotlights = confirmedSpotlights
        attentionError = null
      } catch (error) {
        attentionError = error instanceof Error ? error.message : 'Could not load Spotlight'
      }
    }, 250)
  }

  async function refreshAttention() {
    if (attentionRefreshInFlight) { attentionRefreshQueued = true; return }
    attentionRefreshInFlight = true
    try {
      do {
        attentionRefreshQueued = false
        const [nextActions, nextSpotlights] = await Promise.all([
          attentionApi.actionItems(), attentionApi.spotlights(),
        ])
        actionItems = nextActions
        applySpotlightSnapshot(nextSpotlights)
        attentionError = null
      } while (attentionRefreshQueued)
    } catch (error) {
      attentionError = error instanceof Error ? error.message : 'Could not load attention items'
    } finally {
      attentionLoading = false
      attentionRefreshInFlight = false
    }
  }

  function openAttentionDescriptor(descriptor: AttentionDescriptor) {
    if (descriptor.type === 'unavailable') {
      attentionError = descriptor.reason || 'This Entity cannot be opened yet'
      return
    }
    if (descriptor.type === 'link') {
      void callNative('link.open', { kind: descriptor.kind, target: descriptor.target })
        .catch((error) => { attentionError = error instanceof Error ? error.message : 'Could not open link' })
      return
    }
    const query = descriptor.query || {}
    if (descriptor.ui === 'willo') {
      acceptOpen(query as { page?: unknown; slack_conversation_external_id?: unknown; slack_thread_ts?: unknown; slack_message_ts?: unknown })
      return
    }
    void callNative('app.open', { ui: descriptor.ui, query })
      .catch((error) => { attentionError = error instanceof Error ? error.message : 'Could not open Entity' })
  }

  function openAttentionItem(item: ComunicadoItem | SpotlightItem) {
    openAttentionDescriptor(item.descriptor)
  }

  async function removeAttentionSpotlight(item: SpotlightItem) {
    const key = `${item.target.kind}:${item.target.entity_id}`
    if (removingSpotlight[key]) return
    removingSpotlight = { ...removingSpotlight, [key]: true }
    try {
      await attentionApi.remove(item.target)
      // The mutation response is authoritative; remove this card immediately.
      // Passive empty snapshots still use delayed confirmation to avoid flicker.
      spotlights = spotlights.filter((candidate) =>
        candidate.target.kind !== item.target.kind
          || candidate.target.entity_id !== item.target.entity_id,
      )
      await refreshAttention()
    } catch (error) {
      attentionError = error instanceof Error ? error.message : 'Could not remove Spotlight'
    } finally {
      const { [key]: _, ...rest } = removingSpotlight
      removingSpotlight = rest
    }
  }


  async function closeActionItem(item: ComunicadoItem) {
    if (closingActionItem[item.comunicado_id]) return
    closingActionItem = { ...closingActionItem, [item.comunicado_id]: true }
    try {
      await attentionApi.dismissActionItem(item.comunicado_id)
      actionItems = actionItems.filter((candidate) => candidate.comunicado_id !== item.comunicado_id)
      await refreshAttention()
    } catch (error) {
      attentionError = error instanceof Error ? error.message : 'Could not close Action Item'
    } finally {
      const { [item.comunicado_id]: _, ...rest } = closingActionItem
      closingActionItem = rest
    }
  }

  async function decidePermissionActionItem(item: ComunicadoItem, action: 'approve' | 'reject' | 'stop', details?: string) {
    if (decidingActionItem[item.comunicado_id]) return
    decidingActionItem = { ...decidingActionItem, [item.comunicado_id]: true }
    try {
      await attentionApi.decidePermission(item.comunicado_id, action, details)
      actionItems = actionItems.filter((candidate) => candidate.comunicado_id !== item.comunicado_id)
      await refreshAttention()
    } catch (error) {
      attentionError = error instanceof Error ? error.message : 'Could not decide permission request'
      await refreshAttention()
    } finally {
      const { [item.comunicado_id]: _, ...rest } = decidingActionItem
      decidingActionItem = rest
    }
  }

  async function spotlightActionItem(item: ComunicadoItem) {
    if (spotlightingComunicado[item.comunicado_id]) return
    spotlightingComunicado = { ...spotlightingComunicado, [item.comunicado_id]: true }
    try {
      await attentionApi.add({
        repo: item.entity.repo, kind: item.entity.kind, entity_id: item.entity.entity_id,
      })
      await refreshAttention()
    } catch (error) {
      attentionError = error instanceof Error ? error.message : 'Could not add Spotlight'
    } finally {
      const { [item.comunicado_id]: _, ...rest } = spotlightingComunicado
      spotlightingComunicado = rest
    }
  }

  async function refreshComunicadoFeedState() {
    if (!window.webkit?.messageHandlers?.arbol) return
    try {
      const result = await callNative('comunicado.feed.state', {})
      if (typeof result?.enabled === 'boolean') comunicadoFeedOnTop = result.enabled
      if (typeof result?.count === 'number') comunicadoFeedCount = result.count
      if (typeof result?.visible === 'boolean') comunicadoFeedVisible = result.visible
      comunicadoFeedError = null
    } catch (error) {
      comunicadoFeedError = error instanceof Error ? error.message : 'Could not read Comunicado Feed state'
    }
  }

  async function toggleComunicadoFeed(event: Event) {
    const enabled = (event.currentTarget as HTMLInputElement).checked
    const previous = comunicadoFeedOnTop
    comunicadoFeedOnTop = enabled
    comunicadoFeedUpdating = true
    comunicadoFeedError = null
    try {
      const result = await callNative('comunicado.feed.setEnabled', { enabled })
      if (!result?.ok) throw new Error(result?.error || 'Could not update Comunicado Feed')
      comunicadoFeedOnTop = Boolean(result.enabled)
      comunicadoFeedCount = typeof result.count === 'number' ? result.count : comunicadoFeedCount
      comunicadoFeedVisible = typeof result.visible === 'boolean' ? result.visible : comunicadoFeedVisible
    } catch (error) {
      comunicadoFeedOnTop = previous
      comunicadoFeedError = error instanceof Error ? error.message : 'Could not update Comunicado Feed'
    } finally {
      comunicadoFeedUpdating = false
    }
  }

  async function playCompletedTurnSounds(
    previous: readonly StationSession[],
    current: readonly StationSession[],
  ) {
    if (!window.webkit?.messageHandlers?.arbol || previous.length === 0) return
    const previousById = new Map(previous.map((session) => [session.id, session]))
    const completed = current.filter((session) => {
      const before = String(previousById.get(session.id)?.status || '').toLowerCase()
      const after = String(session.status || '').toLowerCase()
      return before === 'running' && after === 'idle'
    })
    await Promise.all(completed.map(async (session) => {
      try {
        const result = await callNative('sound.completion.play', {
          sessionId: session.id,
          completionId: `turn-finished-${session.id}-${session.updated_at || Date.now()}`,
        })
        if (!result?.ok) throw new Error(result?.error || 'Could not play completion sound')
      } catch (error) {
        console.error('Could not play completion sound', error)
      }
    }))
  }

  function refreshSessions() {
    const generation = ++sessionsRefreshGeneration
    if (sessionsRetryTimer !== null) {
      clearTimeout(sessionsRetryTimer)
      sessionsRetryTimer = null
    }
    if (sessions.length === 0) sessionsLoading = true
    Promise.all([listSessions(1000), listStewardSessions(1000).catch((error: unknown) => {
      stewardSessionsError = error instanceof Error ? error.message : 'Unable to load Steward sessions'
      return null
    })])
      .then(([next, nextStewards]) => {
        if (generation !== sessionsRefreshGeneration) return
        const previous = sessions
        const reconciled = applyPendingSessionPatches(next, pendingSessionPatches)
        sessions = reconciled
        void playCompletedTurnSounds(previous, reconciled)
        if (nextStewards) { filteredStewardSessions = nextStewards; stewardSessionsError = null }
        sessionsLoading = false
        sessionsError = null
      })
      .catch((error: unknown) => {
        if (generation !== sessionsRefreshGeneration) return
        sessionsLoading = false
        sessionsError = error instanceof Error ? error.message : 'Unable to load chat sessions'
        // Core and the WKWebView often restart together. A request can lose that
        // race before the disconnect/reconnect notifications are installed, so
        // retry independently instead of waiting forever for a future event.
        sessionsRetryTimer = setTimeout(() => {
          sessionsRetryTimer = null
          refreshSessions()
        }, 1500)
      })
  }

  onMount(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('open')
      if (raw) acceptOpen(JSON.parse(raw) as { page?: unknown })
    } catch { /* malformed one-shot payload: ignore */ }
    const consumeStickyPendingOpen = () => {
      const hostWindow = window as Window & { __arbolPendingOpen?: { page?: unknown } }
      const pending = hostWindow.__arbolPendingOpen
      if (!pending) return
      delete hostWindow.__arbolPendingOpen
      acceptOpen(pending)
    }
    const onOpen = (event: Event) => {
      delete (window as Window & { __arbolPendingOpen?: { page?: unknown } }).__arbolPendingOpen
      acceptOpen((event as CustomEvent<{ page?: unknown }>).detail)
    }
    window.addEventListener('arbol-open', onOpen)
    consumeStickyPendingOpen()

    const applyActiveElmaSession = (value?: unknown) => {
      activeElmaSessionId = typeof value === 'string' ? value : readElmaActiveChatSessionId()
    }
    const activeSessionStorageChanged = (event: StorageEvent) => {
      if (event.key === ELMA_ACTIVE_CHAT_SESSION_KEY) applyActiveElmaSession(event.newValue || '')
    }
    const activeSessionNativeChanged = (event: Event) => {
      const sessionId = (event as CustomEvent<{ session_id?: unknown }>).detail?.session_id
      applyActiveElmaSession(typeof sessionId === 'string' ? sessionId : '')
    }
    const refreshActiveSessionFromNative = () => {
      // Elma and Willo are separate WKWebView processes. Their localStorage is
      // not authoritative across apps, and a suspended Willo can miss the
      // distributed change notification. Re-read the native shared state every
      // time Willo becomes active/visible so the open-card highlight recovers.
      if (!window.webkit?.messageHandlers?.arbol) {
        applyActiveElmaSession()
        return
      }
      void callNative('app.getActiveChatSession')
        .then((result) => applyActiveElmaSession(typeof result?.session_id === 'string' ? result.session_id : ''))
        .catch(() => applyActiveElmaSession())
    }
    const refreshActiveSessionOnVisibility = () => {
      if (document.visibilityState === 'visible') refreshActiveSessionFromNative()
    }
    window.addEventListener('storage', activeSessionStorageChanged)
    window.addEventListener('arbol-active-chat-session-changed', activeSessionNativeChanged)
    window.addEventListener('focus', refreshActiveSessionFromNative)
    document.addEventListener('visibilitychange', refreshActiveSessionOnVisibility)
    let activeSessionChannel: BroadcastChannel | null = null
    if ('BroadcastChannel' in window) {
      activeSessionChannel = new BroadcastChannel(ELMA_ACTIVE_CHAT_SESSION_CHANNEL)
      activeSessionChannel.addEventListener('message', (event) => applyActiveElmaSession(event.data?.sessionId))
    }
    refreshActiveSessionFromNative()

    const refreshEmailFeature = async () => {
      let enabled = false
      try { enabled = (await callNative('webMail.featureStatus')).enabled === true } catch {}
      if (enabled === emailsEnabled) return
      emailsEnabled = enabled
      if (enabled) void refreshStationEmailSyncStatus(true)
      else {
        if (stationEmailSyncTimer !== null) clearTimeout(stationEmailSyncTimer)
        stationEmailSyncTimer = null
        stationMailStatus = null
        stationEmailSyncProgress = null
        if (page === 'emails') page = 'stations'
      }
    }
    void refreshEmailFeature()
    const emailFeatureTimer = setInterval(() => void refreshEmailFeature(), 2_000)
    const emailSnapshotChanged = () => void refreshStationEmailSyncStatus(true)
    const emailSyncProgressChanged = () => void refreshStationEmailSyncStatus()
    const refreshEmailOnFocus = () => void refreshStationEmailSyncStatus(true)
    const comunicadoFeedStateChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: unknown; count?: unknown; visible?: unknown }>).detail
      if (typeof detail?.enabled === 'boolean') comunicadoFeedOnTop = detail.enabled
      if (typeof detail?.count === 'number') comunicadoFeedCount = detail.count
      if (typeof detail?.visible === 'boolean') comunicadoFeedVisible = detail.visible
      comunicadoFeedError = null
    }
    window.addEventListener('arbol-email-snapshot-changed', emailSnapshotChanged)
    window.addEventListener('arbol-email-sync-progress-changed', emailSyncProgressChanged)
    window.addEventListener('arbol-comunicado-feed-state-changed', comunicadoFeedStateChanged)
    window.addEventListener('focus', refreshEmailOnFocus)
    void refreshStationEmailSyncStatus(true)
    void refreshComunicadoFeedState()

    refreshSessions()
    listIntelligenceProviders().then((r) => (ips = r)).catch(() => {})
    loadRuns()
    const openChatSessionSurface = () => {
      chatSessionSurfaceUnsubscribe?.()
      chatSessionSurfaceUnsubscribe = subscribe('chat_session.surface.events', {}, (event) => {
        if (event.kind === 'error') return
        if (event.event === 'chat_session.surface.ready') {
          scheduleSessionRefresh()
          void refreshAttention()
        } else if (event.event === 'chat_session.surface.changed') {
          const data = event.data && typeof event.data === 'object' ? event.data : {}
          const sessionId = typeof data.chat_session_id === 'string' ? data.chat_session_id : ''
          // Parent changes also invalidate descendant chrome, including parents
          // outside the currently loaded list and nested agent-created chats.
          if (sessions.some((session) => session.parent_chat_session_id === sessionId
              || session.parent_chat_session?.ongoing_chat_session_id === sessionId)) scheduleSessionRefresh()
          if (sessionId) void refreshOneSession(sessionId)
          else scheduleSessionRefresh()
          void refreshAttention()
        }
      })
    }
    // Draft events are non-durable, so reconnect must both reattach this stream
    // and reload the authoritative snapshot. A one-time subscription silently
    // died whenever Core restarted, leaving stale detached cards indefinitely.
    const openDraftSurface = () => {
      draftSurfaceUnsubscribe?.()
      draftSurfaceUnsubscribe = subscribe('draft.surface.events', {}, (event) => {
        if (event.kind === 'error') return
        if (event.event === 'draft.surface.changed') {
          const data = event.data && typeof event.data === 'object' ? event.data : {}
          if (data.change === 'discarded' && typeof data.draft_id === 'string') {
            // Discard is authoritative. Remove its card/decoration before the
            // cross-entity snapshot refresh completes, then reconcile normally.
            sessions = removeDraftFromStations(sessions, data.draft_id)
          }
        }
        if (event.event === 'draft.surface.ready' || event.event === 'draft.surface.changed') refreshSessions()
      })
    }
    openChatSessionSurface()
    openDraftSurface()
    const offCoreDisconnect = onCoreDisconnect(() => { coreConnected = false })
    const offCoreReconnect = onCoreReconnect(() => {
      coreConnected = true
      openChatSessionSurface()
      openDraftSurface()
      refreshSessions()
      void refreshAttention()
      listIntelligenceProviders().then((r) => (ips = r)).catch(() => {})
    })
    void refreshAttention()
    attentionSurfaceUnsubscribe = subscribe('attention.surface.events', {}, (event) => {
      if (event.kind === 'error') return
      if (event.event === 'attention.surface.ready' || event.event === 'attention.surface.changed') {
        void refreshAttention()
      }
    })
    // The dirty stream is intentionally non-durable. macOS may suspend Willo's
    // background WKWebView while the user types in Elma, so a Draft change can
    // legitimately be missed without a Core disconnect. Reconcile the complete
    // snapshot whenever Willo becomes visible/key again.
    const refreshOnFocus = () => { refreshSessions(); void refreshAttention() }
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') { refreshSessions(); void refreshAttention() }
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisibility)
    return () => {
      window.removeEventListener('arbol-open', onOpen)
      window.removeEventListener('storage', activeSessionStorageChanged)
      window.removeEventListener('arbol-active-chat-session-changed', activeSessionNativeChanged)
      window.removeEventListener('focus', refreshActiveSessionFromNative)
      document.removeEventListener('visibilitychange', refreshActiveSessionOnVisibility)
      activeSessionChannel?.close()
      clearInterval(emailFeatureTimer)
      window.removeEventListener('arbol-email-snapshot-changed', emailSnapshotChanged)
      window.removeEventListener('arbol-email-sync-progress-changed', emailSyncProgressChanged)
      window.removeEventListener('arbol-comunicado-feed-state-changed', comunicadoFeedStateChanged)
      window.removeEventListener('focus', refreshEmailOnFocus)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibility)
      offCoreDisconnect()
      offCoreReconnect()
      chatSessionSurfaceUnsubscribe?.()
      chatSessionSurfaceUnsubscribe = null
      draftSurfaceUnsubscribe?.()
      draftSurfaceUnsubscribe = null
      attentionSurfaceUnsubscribe?.()
      attentionSurfaceUnsubscribe = null
    }
  })

  const refreshingSessionIds = new Set<string>()
  const dirtySessionIds = new Set<string>()
  async function refreshOneSession(id: string) {
    // Serialize each card's reads: an older running response must never arrive
    // after a newer idle response and undo completion (or play its sound twice).
    if (refreshingSessionIds.has(id)) {
      dirtySessionIds.add(id)
      return
    }
    refreshingSessionIds.add(id)
    try {
      do {
        dirtySessionIds.delete(id)
        await readOneSession(id)
      } while (dirtySessionIds.has(id))
    } finally {
      refreshingSessionIds.delete(id)
    }
  }

  async function readOneSession(id: string) {
    // Creation and archive change list membership and Draft decoration; those
    // still require the complete snapshot projection.
    if (!sessions.some((session) => session.id === id)) {
      scheduleSessionRefresh()
      return
    }
    try {
      const updated = await getLightSession(id)
      if (updated.status === 'archived' || updated.status === 'imported_readonly') {
        scheduleSessionRefresh()
        return
      }
      const optimistic = pendingSessionPatches.get(id)
      const patch = optimistic ? { ...updated, ...optimistic.patch } : updated
      const previous = sessions
      patchSession(id, patch)
      void playCompletedTurnSounds(previous, sessions)
      filteredStewardSessions = filteredStewardSessions.map((session) =>
        session.id === id ? { ...session, ...patch } : session)
    } catch {
      // A delete or transient reconnect needs full membership reconciliation.
      scheduleSessionRefresh()
    }
  }

  // Surface invalidations normally identify one Chat Session. Patch that card
  // with a lightweight read; debounce only membership/identity-less changes.
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSessionRefresh() {
    if (refreshTimer !== null) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => { refreshTimer = null; refreshSessions() }, 150)
  }
  onDestroy(() => {
    if (refreshTimer !== null) clearTimeout(refreshTimer)
    if (sessionsRetryTimer !== null) clearTimeout(sessionsRetryTimer)
    if (stationEmailSyncTimer !== null) clearTimeout(stationEmailSyncTimer)
    if (emptySpotlightConfirmationTimer !== null) clearTimeout(emptySpotlightConfirmationTimer)
  })

  // Live response tails use the UI-facing render stream; durable domain events
  // remain internal to Core (liveTails.ts).
  // Streamed chunks double as the live agent-activity signal for ordering.
  const runningIdsKey = $derived(sessions.filter(stationIsRunning).map((s) => s.id).sort().join('\0'))
  $effect(() => {
    const ids = runningIdsKey ? runningIdsKey.split('\0').filter(Boolean) : []
    const allowed = new Set(ids)
    untrack(() => {
      if (Object.keys(liveTails).some((id) => !allowed.has(id))) {
        liveTails = Object.fromEntries(Object.entries(liveTails).filter(([id]) => allowed.has(id)))
      }
      if (Object.keys(liveUsage).some((id) => !allowed.has(id))) {
        liveUsage = Object.fromEntries(Object.entries(liveUsage).filter(([id]) => allowed.has(id)))
      }
      const nextActivity = Object.fromEntries(ids.map((id) => [
        id,
        generationActivity[id] || beginGenerationActivity(),
      ]))
      generationActivity = nextActivity
    })
    if (ids.length === 0) return
    return openLiveTails(ids, (id, update) => {
      if (update.refresh || update.terminal) {
        // The render stream crosses the Core ↔ Default Trunk process boundary
        // independently of Root's process-local surface dirty events. Reconcile
        // both terminal snapshots and subsequent projection invalidations.
        void refreshOneSession(id)
        return
      }
      if (update.usage) {
        liveUsage = { ...liveUsage, [id]: update.usage }
        return
      }
      if (!update.chunk) return
      liveTails = { ...liveTails, [id]: update.tail || '' }
      generationActivity = {
        ...generationActivity,
        [id]: recordGeneratedChunk(generationActivity[id] || beginGenerationActivity(update.at), update.chunk, update.at),
      }
      generationClock = update.at
      liveActivity = { ...liveActivity, [id]: update.at }
    })
  })

  // Recompute rolling averages even when no frame arrives. This is what makes a
  // running-but-silent chat decay to 0 tok/min and become visibly stale.
  $effect(() => {
    if (!runningIdsKey) return
    const timer = setInterval(() => { generationClock = Date.now() }, 1_000)
    return () => clearInterval(timer)
  })
  const generationSpeedById = $derived.by(() => {
    const now = generationClock
    return Object.fromEntries(
      Object.entries(generationActivity).map(([id, activity]) => [id, generationSpeeds(activity, now)]),
    ) as Record<string, GenerationSpeed>
  })

  const ipByName = $derived(Object.fromEntries(ips.map((ip) => [ip.name, ip])) as IpByName)

  // Activity-based card ordering (pre-port parity): sort by last agent
  // activity, but debounce the sort key so concurrently streaming agents don't
  // reshuffle the grid on every chunk — order settles ~1.2s after activity
  // quiesces. Compact mode debounces harder (10s): its cards compete for the
  // top slot while several agents respond, and constant reshuffling is noise.
  // Activity inside cards (tail, relative time) still renders live.
  const CARD_ORDER_DEBOUNCE_MS = 1200
  const COMPACT_CARD_ORDER_DEBOUNCE_MS = 10_000
  let liveActivity = $state<StationOrderActivityMap>({})
  let orderActivity = $state<StationOrderActivityMap>({})
  const rawOrderActivity = $derived(Object.fromEntries(sessions.map((s) => [
    s.id,
    Math.max(s.updated_at || 0, s.created_at || 0, liveActivity[s.id] || 0),
  ])) as StationOrderActivityMap)
  $effect(() => {
    const next = rawOrderActivity
    const delay = compact ? COMPACT_CARD_ORDER_DEBOUNCE_MS : CARD_ORDER_DEBOUNCE_MS
    const t = setTimeout(() => { orderActivity = next }, delay)
    return () => clearTimeout(t)
  })
  const stationSessions = $derived(withParentStationState(sessions).filter((session) =>
    page === 'agentic-stations' ? stationIsAgentic(session) : !stationIsAgentic(session)))
  const sorted = $derived([...stationSessions].sort(
    (a, b) => stationOrderActivity(b, orderActivity) - stationOrderActivity(a, orderActivity),
  ))

  // ── Card interactions (pre-port parity): open marks read, Cmd-click rename,
  //    right-click → Ongoing toggle. All optimistic; failures surface in the
  //    error strip and fall back to a snapshot refresh.
  let editingId = $state<string | null>(null)
  let savingId = $state<string | null>(null)
  let actionError = $state<string | null>(null)

  function patchSession(id: string, patch: Partial<StationSession>) {
    sessions = sessions.map((s) => (s.id === id ? { ...s, ...patch } : s))
  }

  function openWithHandoff(id: string, search: ElmaSearchHandoff | undefined, restoreDraft: boolean) {
    // Highlight immediately, then let Elma's authoritative publication keep it
    // synchronized when the user switches sessions inside Elma itself.
    activeElmaSessionId = id
    openSessionInElma(id, search, restoreDraft)
      .then(() => {
        // Opening a chat is an explicit read action: update Willo immediately
        // and persist so chat_session.list moves it out of the Unread row.
        patchSession(id, { isUnread: false })
        setSessionUnread(id, false).catch(() => refreshSessions())
      })
      .catch((e) => { actionError = e instanceof Error ? e.message : 'Elma handoff failed' })
  }

  function openStation(s: StationSession) {
    if (stationIsDraftOnly(s)) {
      openDraftInElma(s.draftId || '').catch((e) => {
        actionError = e instanceof Error ? e.message : 'Elma Draft handoff failed'
      })
      return
    }
    openWithHandoff(s.id, undefined, stationHasDraft(s))
  }

  async function saveTitle(id: string, title: string) {
    if (sessions.find((session) => session.id === id)?.entityKind === 'draft') return
    savingId = id
    actionError = null
    try {
      const updated = await renameSession(id, title)
      patchSession(id, { ...updated, title: updated.title || title })
      editingId = null
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Could not rename chat'
    } finally {
      savingId = null
    }
  }

  function startEdit(id: string) {
    if (sessions.find((session) => session.id === id)?.entityKind === 'draft') return
    actionError = null
    editingId = id
  }

  function openContextMenu(e: MouseEvent, session: StationSession) {
    if (stationIsDraftOnly(session)) return
    e.preventDefault()
    e.stopPropagation()
    actionError = null
    openEntityContextMenu(
      { repo: 'Arbol', kind: 'chat', entityId: session.id, title: session.title || 'Untitled Chat Session' },
      e.clientX, e.clientY,
      { specificItems: [{
        label: session.onGoing ? 'Stop ongoing' : 'Ongoing',
        action: () => toggleOnGoing(session.id, !session.onGoing),
      }] },
    )
  }

  async function toggleOnGoing(id: string, onGoing: boolean) {
    id = sessions.find((session) => session.id === id)?.parent_chat_session?.ongoing_chat_session_id || id
    const mutation = ++sessionMutationGeneration
    pendingSessionPatches.set(id, { mutation, patch: { onGoing } })
    patchSession(id, { onGoing })
    try {
      const updated = await setSessionOnGoing(id, onGoing)
      if (pendingSessionPatches.get(id)?.mutation !== mutation) return
      pendingSessionPatches.delete(id)
      patchSession(id, { ...updated, onGoing })
      scheduleSessionRefresh()
    } catch (e) {
      if (pendingSessionPatches.get(id)?.mutation !== mutation) return
      pendingSessionPatches.delete(id)
      actionError = e instanceof Error ? e.message : 'Could not update ongoing flag'
      void refreshOneSession(id)
    }
  }

  async function loadRuns() {
    runsLoading = true
    try { runs = await listBlueprintRuns(500) } finally { runsLoading = false }
  }

  async function openRun(run: BlueprintRun) {
    page = 'run-details'
    runDetails = null
    detailsLoading = true
    try { runDetails = await getBlueprintRun(run.id) } finally { detailsLoading = false }
  }

  // Keep each session in exactly one visual group.
  const drafted = $derived(sorted.filter(stationAppearsDrafted))
  const ongoingRunning = $derived(sorted.filter((s) => !stationAppearsDrafted(s) && s.onGoing && stationIsRunning(s)))
  const ongoingUnread = $derived(sorted.filter((s) => !stationAppearsDrafted(s) && s.onGoing && !stationIsRunning(s) && stationIsUnread(s)))
  const ongoingIdle = $derived(sorted.filter((s) => !stationAppearsDrafted(s) && s.onGoing && !stationIsRunning(s) && !stationIsUnread(s)))
  const others = $derived(sorted.filter((s) => !stationAppearsDrafted(s) && !s.onGoing))

  // ── Keep-on-Top compact mode (pre-port parity): a floating always-on-top
  //    narrow list of inspected, on-going, and drafted chats. The flag persists and
  //    drives the native window level. Compact drops UIShell, so the shared
  //    Cmd+number handoff is installed here while compact is active.
  const COMPACT_KEY = 'arbol-willo-keep-on-top'
  const MINIMAL_COMPACT_KEY = 'arbol-willo-minimal-compact'
  let compact = $state(localStorage.getItem(COMPACT_KEY) === '1')
  let minimalCompact = $state(localStorage.getItem(MINIMAL_COMPACT_KEY) === '1')
  $effect(() => {
    localStorage.setItem(COMPACT_KEY, compact ? '1' : '0')
    localStorage.setItem(MINIMAL_COMPACT_KEY, minimalCompact ? '1' : '0')
    setAlwaysOnTop(compact, minimalCompact).catch((e) => console.error('Willo always-on-top failed', e))
  })
  $effect(() => {
    if (!compact) return
    const cleanups = [installSharedCmdNumberHotkeys(), installSharedWilloPageHotkeys()]
    return () => cleanups.forEach((cleanup) => cleanup())
  })
  function dragCompactHeader(e: MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button,input,textarea,select,a,[role=button]')) return
    beginWindowDrag().catch(() => {})
  }
  const hasResponding = $derived(sessions.some(stationIsRunning))
  const compactOrdered = $derived([
    ...sorted.filter((s) => stationOnGoing(s)),
    ...sorted.filter((s) => stationAppearsDrafted(s) && !stationOnGoing(s)),
  ])

  // ── Pagination (pre-port parity): the page slices the group-concatenated
  //    order, then each section re-filters its members from the page slice.
  //    Compact mode paginates its own (on-going + drafted) order.
  let stationPage = $state(0)
  let pageSize = $state<PageSize>(DEFAULT_STATIONS_PAGE_SIZE)
  $effect(() => { page; stationPage = 0; editingId = null })
  const ordered = $derived(compact
    ? compactOrdered
    : [...drafted, ...ongoingRunning, ...ongoingUnread, ...ongoingIdle, ...others])
  const pageCount = $derived(Math.max(1, Math.ceil(ordered.length / pageSize)))
  const safePage = $derived(Math.min(Math.max(0, stationPage), pageCount - 1))
  const pageSessions = $derived(ordered.slice(safePage * pageSize, (safePage + 1) * pageSize))
  const pageDrafted = $derived(pageSessions.filter(stationAppearsDrafted))
  const pageOngoingRunning = $derived(pageSessions.filter((s) => !stationAppearsDrafted(s) && s.onGoing && stationIsRunning(s)))
  const pageOngoingUnread = $derived(pageSessions.filter((s) => !stationAppearsDrafted(s) && s.onGoing && !stationIsRunning(s) && stationIsUnread(s)))
  const pageOngoingIdle = $derived(pageSessions.filter((s) => !stationAppearsDrafted(s) && s.onGoing && !stationIsRunning(s) && !stationIsUnread(s)))
  const pageOthers = $derived(pageSessions.filter((s) => !stationAppearsDrafted(s) && !s.onGoing))

  // Willo Stewards is deliberately a projection of the same authoritative
  // Chat Session snapshot. Initiator provenance, rather than title or IP-name
  // convention, determines membership.
  const stewardSessions = $derived(filteredStewardSessions)
  const stewardPageCount = $derived(Math.max(1, Math.ceil(stewardSessions.length / pageSize)))
  const stewardSafePage = $derived(Math.min(Math.max(0, stationPage), stewardPageCount - 1))
  const stewardPageSessions = $derived(stewardSessions.slice(stewardSafePage * pageSize, (stewardSafePage + 1) * pageSize))

  // Compact list rows: an "Ongoing"/"Drafted" head before each section's first
  // card, and a growing gap before cards whose activity bucket is older than
  // their predecessor's (recency reads at a glance).
  const compactRows = $derived.by(() => {
    const now = Date.now()
    return pageSessions.map((s, i) => {
      const prev = i > 0 ? pageSessions[i - 1] : null
      const section = stationOnGoing(s) ? 'Ongoing' : 'Drafted'
      const prevSection = prev ? (stationOnGoing(prev) ? 'Ongoing' : 'Drafted') : ''
      const showHead = i === 0 || section !== prevSection
      const spacing = showHead || !prev ? 0 : compactActivityGroupSpacingPx(
        stationOrderActivity(prev, orderActivity),
        stationOrderActivity(s, orderActivity),
        now,
      )
      return { s, section, showHead, spacing, activityAt: rawOrderActivity[s.id] || 0 }
    })
  })

  // ── Station search (pre-port parity): debounced full-text search over the
  //    current page's transcripts. Hits carry turn/role occurrence coordinates
  //    so Elma can scroll to and highlight the exact match on open.
  let searchQuery = $state('')
  let searchHits = $state<StationSearchHit[]>([])
  let searchLoading = $state(false)
  let searchError = $state<string | null>(null)
  $effect(() => {
    const q = searchQuery.trim()
    if (!q) {
      searchHits = []
      searchLoading = false
      searchError = null
      return
    }
    const rowsToSearch = page === 'stewards' ? stewardPageSessions : pageSessions
    let cancelled = false
    const timer = setTimeout(() => {
      searchLoading = true
      searchError = null
      Promise.all(rowsToSearch.filter((session) => !stationIsDraftOnly(session)).map(async (session) => ({ session, detail: await getSessionDetails(session.id) })))
        .then((rows) => { if (!cancelled) searchHits = buildSearchHits(rows, q, messageTurnMapFromMessages(rows)) })
        .catch((e) => { if (!cancelled) searchError = e instanceof Error ? e.message : 'Could not search chats' })
        .finally(() => { if (!cancelled) searchLoading = false })
    }, 180)
    return () => { cancelled = true; clearTimeout(timer) }
  })

  const searchGroups = $derived(groupSearchHits(searchHits))

  function openHit(hit: StationSearchHit) {
    const session = sessions.find((s) => s.id === hit.sessionId)
    const handoff: ElmaSearchHandoff = { query: searchQuery.trim(), turnId: hit.turnId, role: hit.role, occurrenceIndex: hit.occurrenceIndex }
    openWithHandoff(
      hit.sessionId,
      handoff,
      session ? stationHasDraft(session) : false,
    )
  }

  const hasAttention = $derived(actionItems.length > 0 || spotlights.length > 0)

  const navItems: { id: Exclude<Page, 'run-details'>; label: string }[] = $derived([
    { id: 'stations', label: 'Stations' },
    { id: 'agentic-stations', label: 'Agentic Stations' },
    { id: 'stewards', label: 'Stewards' },
    { id: 'comunicados', label: 'Comunicados' },
    { id: 'slack', label: 'Slack' },
    { id: 'telegram', label: 'Telegram' },
    ...(emailsEnabled ? [{ id: 'emails' as const, label: 'Emails' }] : []),
    { id: 'runs', label: 'Blueprint Runs' },
  ])
</script>

{#snippet cards(rows: StationSession[], compact = false)}
  {#each rows as s (s.id)}
    <div class="station-card-stack">
      <div>
        <OpenInElmaBadge active={activeElmaSessionId === s.id} />
        <StationCard
          session={s}
          openInElma={activeElmaSessionId === s.id}
          liveTail={liveTails[s.id] || ''}
          liveUsage={liveUsage[s.id]}
          generationSpeed={generationSpeedById[s.id]}
          now={generationClock}
          liveAgentActivityAt={liveActivity[s.id] || 0}
          {ipByName}
          editing={editingId === s.id}
          saving={savingId === s.id}
          {compact}
          onOpen={openStation}
          onStartEdit={startEdit}
          onSaveTitle={saveTitle}
          onCancelEdit={() => (editingId = null)}
          onContextMenu={openContextMenu}
        />
      </div>
      {#if (s.metadata?.tags ?? []).length}<StationTags tags={s.metadata?.tags ?? []} {compact} />{/if}
    </div>
  {/each}
{/snippet}

{#snippet searchBox(placeholder: string)}
  <label class="willo-search-box">
    <span>Search</span>
    <input bind:value={searchQuery} {placeholder} />
    {#if searchQuery}<button type="button" onclick={() => (searchQuery = '')} aria-label="Clear search">×</button>{/if}
  </label>
{/snippet}

{#snippet paginationBar()}
  <PaginationControls
    page={safePage}
    {pageCount}
    total={ordered.length}
    {pageSize}
    onPage={(p) => (stationPage = p)}
    onPageSizeChange={(size) => { pageSize = size; stationPage = 0 }}
  />
{/snippet}

{#snippet stewardPaginationBar()}
  <PaginationControls
    page={stewardSafePage}
    pageCount={stewardPageCount}
    total={stewardSessions.length}
    {pageSize}
    onPage={(p) => (stationPage = p)}
    onPageSizeChange={(size) => { pageSize = size; stationPage = 0 }}
  />
{/snippet}

{#snippet searchPanel()}
  {#if searchQuery.trim()}
    <aside class="willo-search-panel" aria-label="Search results">
      <div class="willo-search-panel-head">
        <b>{searchLoading ? 'Searching…' : `${searchHits.length} occurrence${searchHits.length === 1 ? '' : 's'}`}</b>
        <span>Page {page === 'stewards' ? stewardSafePage + 1 : safePage + 1} / {page === 'stewards' ? stewardPageCount : pageCount}</span>
      </div>
      <div class="willo-search-panel-sub">Only chats on the current station page are searched.</div>
      {#if searchError}<div class="willo-title-error">{searchError}</div>{/if}
      {#if !searchLoading && !searchError && searchHits.length === 0}
        <div class="willo-search-empty">No matches for “{searchQuery.trim()}”.</div>
      {/if}
      <div class="willo-search-results">
        {#each searchGroups as group (group.sessionId)}
          <section class="willo-search-group" aria-label={`${group.sessionTitle}, ${group.hits.length} matches`}>
            <div class="willo-search-group-head">
              <span class="willo-search-group-title" title={group.sessionTitle}>{group.sessionTitle}</span>
              <span class="willo-search-group-count">{group.hits.length}</span>
              <span class="willo-search-group-context" title={`Chat Session ${group.sessionId}`}>
                <span>{group.repo}</span>
                <code>{group.sessionId.slice(0, 8)}</code>
              </span>
            </div>
            <div class="willo-search-group-hits">
              {#each group.hits as hit (hit.key)}
                {@const h = splitHighlight(hit.snippet, searchQuery, hit.matchStart)}
                <button type="button" class="willo-search-hit" onclick={() => openHit(hit)}>
                  <span class="willo-search-hit-role">{hit.role}</span>
                  <span class="willo-search-hit-text">{h.before}{#if h.match}<mark class="willo-search-mark">{h.match}</mark>{/if}{h.after}</span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </aside>
  {/if}
{/snippet}

{#snippet willoGlyph()}<WilloGlyph />{/snippet}

{#snippet headerActions()}
  <Button size="s" onclick={() => (compact = true)} title="Keep compact Willo Station above other windows">Keep on Top</Button>
{/snippet}

{#snippet status()}
  <Dot color={coreConnected ? 'var(--arbol-color-ok)' : 'var(--arbol-color-err)'} />
  <span>{coreConnected ? 'Connected' : 'Disconnected'}</span>
  <span style="opacity:0.5">·</span>
  <span style="font-family:var(--arbol-font-mono)">{sessions.length} stations</span>
  {#if hasResponding}<span class="willo-responding-indicator" title="At least one chat session is responding"></span>{/if}
  {#if page === 'stewards'}<span style="opacity:0.5">·</span><span style="font-family:var(--arbol-font-mono)">{stewardSessions.length} steward chats</span>{/if}
  {#if emailsEnabled && stationEmailSyncProgress?.running}
    <span style="opacity:0.5">·</span>
    <span
      class="willo-status-email-sync"
      role="status"
      aria-live="polite"
      title={mailSyncProgressLabel(stationEmailSyncProgress)}
    >
      <span class="willo-status-email-sync-copy">
        <b>Email sync</b>
        {#if stationEmailSyncProgress.total > 0}
          <span>{stationEmailSyncProgress.current} / {stationEmailSyncProgress.total}</span>
        {:else}
          <span>{mailSyncProgressLabel(stationEmailSyncProgress)}</span>
        {/if}
      </span>
      <progress
        max={Math.max(1, stationEmailSyncProgress.total)}
        value={stationEmailSyncProgress.total > 0 ? stationEmailSyncProgress.current : undefined}
        aria-label="Email synchronization progress"
      ></progress>
    </span>
  {:else if emailsEnabled && emailSyncStatusText(stationMailStatus?.sync, formatEmailSyncTime)}
    <span style="opacity:0.5">·</span>
    <span
      class="willo-status-email-last-sync"
      class:is-error={stationMailStatus?.sync.status === 'failed' || stationMailStatus?.sync.status === 'needs_login'}
      title={stationMailStatus?.sync.error || emailSyncStatusText(stationMailStatus?.sync, formatEmailSyncTime) || ''}
    >{emailSyncStatusText(stationMailStatus?.sync, formatEmailSyncTime)}</span>
  {/if}
{/snippet}

{#if compact}
  <div class="willo-compact-shell" class:is-minimal={minimalCompact}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="willo-compact-header" onmousedown={dragCompactHeader}>
      {#if hasResponding}<span class="willo-responding-indicator" title="At least one chat session is responding"></span>{/if}
      <button
        type="button"
        class="willo-compact-density-toggle"
        class:is-on={minimalCompact}
        aria-pressed={minimalCompact}
        title="Use the extra-small, animation-free widget view"
        onclick={() => (minimalCompact = !minimalCompact)}
      >
        <span class="willo-density-switch" aria-hidden="true"><span></span></span>
        <span>Mini</span>
      </button>
      <Button size="s" kind="soft" onclick={() => (compact = false)}>Full View</Button>
    </div>
    <div class="willo-compact-stations">
      {#if !minimalCompact}
        <div class="willo-compact-tools">
          {@render searchBox('Search page…')}
          {@render paginationBar()}
        </div>
      {/if}
      {#if actionError}<div class="willo-title-error">{actionError}</div>{/if}
      {#if sessionsError && sessions.length === 0}
        <div class="willo-title-error">Could not load chat sessions. Retrying…</div>
      {/if}
      {#if sessionsLoading && stationSessions.length === 0}
        <div class="willo-empty">Loading chat sessions…</div>
      {:else if ordered.length === 0}
        <div class="willo-empty">No ongoing or drafted chat sessions. Right-click a chat in full view and enable Ongoing, or start a draft in Elma.</div>
      {:else}
        <div class="willo-compact-list">
          {#each compactRows as row (row.s.id)}
            {#if row.showHead && !minimalCompact}
              <div class="willo-compact-section-head {row.section === 'Inspection' ? 'is-inspection' : row.section === 'Drafted' ? 'is-drafted' : 'is-ongoing'}"><span>{row.section}</span></div>
            {/if}
            <div class="station-card-stack" style:margin-top={`${minimalCompact ? 0 : row.spacing}px`}>
              <RunningChatBackground compact enabled={stationIsRunning(row.s)}>
              <div>
                <OpenInElmaBadge active={activeElmaSessionId === row.s.id} />
                <CompactStationCard
                  session={row.s}
                  openInElma={activeElmaSessionId === row.s.id}
                  editing={editingId === row.s.id}
                  saving={savingId === row.s.id}
                  activityAt={row.activityAt}
                  liveTail={liveTails[row.s.id] || ''}
                  liveUsage={liveUsage[row.s.id]}
                  generationSpeed={generationSpeedById[row.s.id]}
                  now={generationClock}
                  liveAgentActivityAt={liveActivity[row.s.id] || 0}
                  spacingBeforePx={0}
                  running={stationIsRunning(row.s)}
                  minimal={minimalCompact}
                  {ipByName}
                  onOpen={openStation}
                  onStartEdit={startEdit}
                  onSaveTitle={saveTitle}
                  onCancelEdit={() => (editingId = null)}
                  onContextMenu={openContextMenu}
                />
              </div>
              {#if (row.s.metadata?.tags ?? []).length}<StationTags tags={row.s.metadata?.tags ?? []} compact />{/if}
              </RunningChatBackground>
            </div>
          {/each}
        </div>
      {/if}
      {#if !minimalCompact}{@render searchPanel()}{/if}
    </div>
  </div>
{:else}
<UIShell title="Willo Station" headerGlyph={willoGlyph} {theme} onTheme={(id) => (theme = id)} {status} {headerActions}>
  <div
    class="willo-full-layout"
    class:has-attention={hasAttention}
  >
    <!-- Navigation Panel -->
    <div style="border-right:1px solid var(--arbol-color-border);background:var(--arbol-color-bg);
                display:flex;flex-direction:column;min-height:0">
      <ShellInsignia ui="Willo" label="Station" sub="Chats · signals" glyph={willoGlyph} hue={104} />
      <div class="willo-navigation-scroll">
        <nav aria-label="Willo Station" class="willo-navigation-tabs">
        {#each navItems as it}
          {@const on = it.id === page || (it.id === 'runs' && page === 'run-details')}
          <button
            onclick={() => (page = it.id)}
            style="display:flex;align-items:center;gap:var(--arbol-space-2);text-align:left;
                   background:{on ? 'var(--arbol-color-surface-2)' : 'transparent'};
                   color:{on ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'};
                   border:1px solid {on ? 'var(--arbol-color-border)' : 'transparent'};
                   border-radius:var(--arbol-radius-m);padding:9px var(--arbol-space-3);
                   font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);cursor:pointer">
            <span style="flex:1">{it.label}</span>
            {#if on}<span style="width:4px;height:4px;border-radius:99px;background:var(--arbol-color-accent)"></span>{/if}
          </button>
        {/each}
        </nav>

        <section class="willo-control-panel" aria-labelledby="willo-controls-heading">
          <div class="willo-control-panel-head">
            <span class="willo-control-panel-kicker">Station Controls</span>
            <span class="willo-control-panel-mark" aria-hidden="true">⌁</span>
          </div>
          <h2 id="willo-controls-heading">Presentation</h2>
          <label class="willo-control-toggle" class:is-on={comunicadoFeedOnTop}>
            <span class="willo-control-toggle-copy">
              <b>Comunicado Feed On Top</b>
              <span>Float a compact feed of Arbol Comunicados above other apps.</span>
            </span>
            <input
              type="checkbox"
              checked={comunicadoFeedOnTop}
              disabled={comunicadoFeedUpdating}
              onchange={toggleComunicadoFeed}
            />
            <span class="willo-control-switch" aria-hidden="true"><span></span></span>
          </label>
          <div class="willo-control-panel-foot">
            <span class:active={comunicadoFeedVisible}>{comunicadoFeedVisible ? 'Feed visible' : comunicadoFeedOnTop ? 'Waiting for an active Comunicado' : 'Feed off'}</span>
            {#if comunicadoFeedCount > 0}<span>{comunicadoFeedCount} active</span>{/if}
          </div>
          {#if comunicadoFeedError}<p class="willo-control-error" role="alert">{comunicadoFeedError}</p>{/if}
        </section>
      </div>
    </div>

    <!-- Page -->
    <div style="min-width:0;overflow:auto;padding:var(--arbol-space-5)">
      {#if page === 'stations' || page === 'agentic-stations'}
        <div class={searchQuery.trim() ? 'willo-stations-layout has-search' : 'willo-stations-layout'}>
          <main class="willo-stations-main">
            <div class="willo-stations-head">
              <span style="flex:1">
                {#if page === 'agentic-stations'}<h1 style="margin:0;font:600 var(--arbol-type-title)/1.2 var(--arbol-font-ui)">Agentic Stations</h1>{/if}
              </span>
              {@render searchBox('Search current page…')}
            </div>
            {@render paginationBar()}
            {#if actionError}<div class="willo-title-error">{actionError}</div>{/if}
            {#if sessionsError}
              <div class="willo-title-error">
                Could not refresh chat sessions. {sessions.length === 0 ? 'Retrying automatically…' : 'Showing the last available snapshot.'}
                <button type="button" onclick={refreshSessions}>Retry now</button>
              </div>
            {/if}
            <div class="station-sections">
          {#if pageDrafted.length}
            <section class="station-section" aria-labelledby="drafted-heading">
              <div class="station-section-heading"><h2 id="drafted-heading">Drafted</h2><span>{pageDrafted.length}</span></div>
              <div class="station-grid">{@render cards(pageDrafted)}</div>
            </section>
          {/if}
          {#if pageOngoingRunning.length}
            <section class="station-section" aria-labelledby="running-heading">
              <RunningChatBackground>
              <div class="station-section-heading"><h2 id="running-heading">Running</h2><span>{pageOngoingRunning.length}</span></div>
              <div class="station-grid">{@render cards(pageOngoingRunning)}</div>
              </RunningChatBackground>
            </section>
          {/if}
          {#if pageOngoingUnread.length}
            <section class="station-section" aria-labelledby="unread-heading">
              <div class="station-section-heading"><h2 id="unread-heading">Unread</h2><span>{pageOngoingUnread.length}</span></div>
              <div class="station-grid">{@render cards(pageOngoingUnread)}</div>
            </section>
          {/if}
          {#if pageOngoingIdle.length}
            <section class="station-section" aria-labelledby="ongoing-heading">
              <div class="station-section-heading"><h2 id="ongoing-heading">Other on-going</h2><span>{pageOngoingIdle.length}</span></div>
              <div class="station-grid">{@render cards(pageOngoingIdle)}</div>
            </section>
          {/if}
          {#if pageOthers.length}
            <section class="station-section station-section--compact" aria-labelledby="other-heading">
              <div class="station-section-heading"><h2 id="other-heading">Other chats</h2><span>{pageOthers.length}</span></div>
              <div class="station-grid">{@render cards(pageOthers, true)}</div>
            </section>
          {/if}
            </div>
            {#if sessionsLoading && sessions.length === 0}
              <div style="color:var(--arbol-color-text-muted)">Loading chat sessions…</div>
            {:else if !sessionsError && stationSessions.length === 0}
              <div style="color:var(--arbol-color-text-muted)">{page === 'agentic-stations' ? 'No agent-initiated chat sessions yet.' : 'No chat sessions yet.'}</div>
            {/if}
          </main>
          {@render searchPanel()}
        </div>
      {:else if page === 'stewards'}
        <div class={searchQuery.trim() ? 'willo-stations-layout has-search' : 'willo-stations-layout'}>
          <main class="willo-stations-main">
            <div class="willo-stations-head">
              <div style="flex:1">
                <h1 style="margin:0;font:600 var(--arbol-type-title)/1.2 var(--arbol-font-ui)">Willo Stewards</h1>
                <p style="margin:5px 0 0;color:var(--arbol-color-text-muted)">Chat Sessions initiated by Stewards under versioned Mandates.</p>
              </div>
              {@render searchBox('Search Steward chats…')}
            </div>
            {@render stewardPaginationBar()}
            {#if actionError}<div class="willo-title-error">{actionError}</div>{/if}
            {#if stewardSessionsError}
              <div class="willo-title-error">Could not refresh Steward sessions. <button type="button" onclick={refreshSessions}>Retry now</button></div>
            {/if}
            {#if sessionsLoading && sessions.length === 0}
              <div class="willo-empty">Loading Steward Chat Sessions…</div>
            {:else if stewardSessions.length === 0}
              <div class="willo-empty">No Chat Sessions have been initiated by Stewards yet.</div>
            {:else}
              <section class="station-section" aria-labelledby="steward-sessions-heading">
                <div class="station-section-heading"><h2 id="steward-sessions-heading">Steward Chat Sessions</h2><span>{stewardSessions.length}</span></div>
                <div class="station-grid">{@render cards(stewardPageSessions)}</div>
              </section>
            {/if}
          </main>
          {@render searchPanel()}
        </div>
      {:else if page === 'comunicados'}
        <ComunicadosPage />
      {:else if page === 'slack'}
        <SlackPage
          target={slackOpenTarget}
          {spotlightedSlackMessageIds}
          onSpotlightsChanged={refreshAttention}
        />
      {:else if page === 'telegram'}
        <TelegramPage openTarget={telegramOpenTarget} />
      {:else if page === 'emails' && emailsEnabled}
        <EmailsPage />
      {:else if page === 'runs'}
        <BlueprintRuns {runs} loading={runsLoading} onOpen={openRun} />
      {:else if page === 'run-details'}
        <RunDetails details={runDetails} loading={detailsLoading} onBack={() => (page = 'runs')} />
      {/if}
    </div>
    {#if hasAttention}
      <AttentionColumn
        {actionItems}
        {spotlights}
        loading={attentionLoading}
        error={attentionError}
        removing={removingSpotlight}
        spotlighting={spotlightingComunicado}
        closing={closingActionItem}
        deciding={decidingActionItem}
        {activeElmaSessionId}
        onOpen={openAttentionItem}
        onCloseActionItem={closeActionItem}
        onRemoveSpotlight={removeAttentionSpotlight}
        onSpotlightComunicado={spotlightActionItem}
        onDecidePermission={decidePermissionActionItem}
      />
    {/if}
  </div>
</UIShell>
{/if}




<style>
  .willo-full-layout { display:grid;grid-template-columns:var(--arbol-navigation-panel-width) minmax(0,1fr);height:100%; }
  .willo-full-layout.has-attention { grid-template-columns:var(--arbol-navigation-panel-width) minmax(0,1fr) minmax(300px,360px); }
  .station-sections { display:flex; flex-direction:column; gap:var(--arbol-space-6); }
  .station-section { min-width:0; }
  .station-section + .station-section { border-top:1px solid var(--arbol-color-border); padding-top:var(--arbol-space-5); }
  .station-section-heading { display:flex; align-items:center; gap:var(--arbol-space-2); margin-bottom:var(--arbol-space-3); }
  .station-section-heading::after { content:''; height:1px; flex:1; background:var(--arbol-color-hairline); }
  .station-section-heading h2 { margin:0; font:600 var(--arbol-type-label)/1 var(--arbol-font-mono); letter-spacing:.65px; text-transform:uppercase; color:var(--arbol-color-text-muted); }
  .station-section-heading span { order:2; min-width:20px; padding:2px 6px; border:1px solid var(--arbol-color-border); border-radius:99px; color:var(--arbol-color-text-muted); font:500 10px/1 var(--arbol-font-mono); text-align:center; }
  .station-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:var(--arbol-space-4); }
  .station-card-stack { display:flex; min-width:0; flex-direction:column; gap:6px; }
  .station-section--compact .station-card-stack { gap:4px; }
  /* Non-ongoing chats are supporting context, so their cards use 70% of the
     ongoing card footprint (300px × 142px baseline). */
  .station-section--compact .station-grid { grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:calc(var(--arbol-space-4) * .7); }
</style>
