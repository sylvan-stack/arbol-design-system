<script lang="ts">
  import { entityLinkTarget, formatEntityUri } from '@arbol/design-system'
  /* Elma Chat root (Svelte 5 port; ux-ui-guide.md §1.5 + §1.9 hotkey-first).
   * Viewport = Navigation Panel | Elma Page. Owns: theme, font scaling, active
   * repo, current Intelligence Provider, thinking level, and the conversation as
   * a TREE.
   *
   * Conversation model — the chat area only ever shows ONE turn. The full backlog
   * is a tree: `nodes` keyed by id (each turn has `parentId` + `children`),
   * `rootId`, and `activeChild` (which branch is followed at each fork). The chat
   * renders the active root→leaf PATH; `viewIndex` says which turn on that path is
   * on screen. All conversation mutations go through the pure `TREE` helpers.
   *
   * Real data: repos ← `repos.list`; IPs ← `ip.list`. Sending streams a turn over
   * `chat_session.create` + `chat_session.send`; the shared fold (`chatSessionView`)
   * renders it. The conversation *tree* is client view state; its active branch
   * persists on the Chat Session so every reopen returns to the same branch. */
  import { scrollResponse } from './chat/finalAnswerNavigation'
  import { copyableChatNote } from './chat/chatNoteClipboard'
  import { onMount } from 'svelte'
  import { OpenHandoffGuard } from './app/open-handoff-guard'
  import { createReadReceipt } from './app/read-receipt'
  import { UIShell, bridgeDiagnostic, callNative, reportRendererError } from '@arbol/design-system'
  import {
    chatSessionView,
    initialChatSession,
    type ChatSessionView,
    type StreamingOverlay,
    type NativeToolCallView,
  } from '@arbol/events'
  import {
    api,
    chooseFolder,
    elmaBridge,
    hasBridge,
    ipEnabled,
    ipLabel as ipLabelOf,
    readLocalFile,
    listDocHistory,
    appendDocHistory,
    type LocalFilePreview,
    prohibitedIpsForRepo,
    prohibitedReposForIp,
    providerOf,
    repoDefaultIp,
    newChatIp,
    subLoggedIn,
    type Ip,
    type RepoPolicy,
    type Repo,
    type WorktreeInfo,
    type Subscription,
    type SessionTokenUsage,
  } from './api'
  import ElmaChatGlyph from './ElmaChatGlyph.svelte'
  import { FontSizeControl } from '@arbol/design-system'
  import { ChatWidthControl } from '@arbol/design-system'
  import NavigationPanel from './nav/NavigationPanel.svelte'
  import { reconcileRecordedTokenUsage, withLiveTokenUsage } from './nav/sessionTokenUsage'
  import type { RepoSlot } from './nav/NavigationPanel.types'
  import { buildRepoSlots, repoForWorkspacePath, repoNavigationAction } from './nav/repoNavigation'
  import ElmaPage from './pages/ElmaPage.svelte'
  import ChangeWalkthroughPage from './change-walkthrough/ChangeWalkthroughPage.svelte'
  import { appendToDraft } from './change-walkthrough/state'
  import type { ChangeWalkthroughSummary, WorktreeDiffMode } from './change-walkthrough/types'
  import ErrorBoundary from './ErrorBoundary.svelte'
  import RenderErrorCard from './RenderErrorCard.svelte'
  import type { AgentStatusState, AgentStatusKind } from './chat/AgentStatusBar.types'
  import { addOrReplaceTag, removeTag, type ChatTag, type ChatTagDefinition } from './chat/sessionTags'
  import { approvalsFromView, type PendingApproval } from './chat/usePendingApprovals'
  import { BranchIcon, PencilIcon, TREE, buildTreeFromView } from './chat/branching'
  import { CheckCircleIcon, CopyIcon, WhatsWrongIcon, type QuickAction } from './quick'
  import {
    CONTENT_MAX,
    ELMA_CONTENT_SCALE_KEY,
    ELMA_DEFAULT_THEME,
    ELMA_THEME_KEY,
    ELMA_UI_SCALE_KEY,
    FONT_STEP,
    SCALE_MIN,
    THINKING_LEVELS,
    UI_MAX,
    DEFAULT_THINKING,
    DEFAULT_MODEL,
    enabledModelOptions,
    modelLabel,
    loadBranchView,
    loadRecents,
    loadSessionId,
    saveSessionId,
    mkSessionId,
    assistantBlocks,
    type AssistantCycle,
    mockAnswer,
    parseMarkdown,
    round2,
    saveBranchView,
    seedTree,
    withRecent,
    type ActiveChild,
    type AnswerBlock,
    type RecentRepo,
    type ModelId,
    type ThinkingLevel,
    type ImageAttachment,
    type Turn,
    type TurnMap,
  } from './constants'

  // Pure, stateless helpers live in ./app/* to keep this root focused on the
  // reactive wiring (state, effects, handlers).
  import {
    ELMA_ACTIVE_CHAT_SESSION_KEY,
    ELMA_ACTIVE_CHAT_SESSION_CHANNEL,
    loadElmaLastChatSessionId,
    clearElmaLastChatSessionId,
    publishElmaActiveChatSessionId,
    restoreDraftRequested,
    searchTargetFromOpenPayload,
    sameEntry,
    parseFileLocator,
    parseLeadingTitleBlock,
    turnAssistantCycles,
    type ElmaOpenPayload,
    type ElmaSearchTarget,
    type PreviewEntry,
  } from './app/helpers'
  import { buildToolOutputPreviews } from './app/tool-preview'
  import { bindDraftToComposer, draftIdForComposer, forgetComposerDraftBinding, composerToDraftAttachments, draftToComposerAttachments } from './app/drafts'
  import {
    discardCachedComposerDraft,
    discardCachedComposerDraftIfUnchanged,
    draftCacheIdentity,
    loadCachedComposerDraft,
    loadCachedDraftForComposer,
    moveCachedComposerDraft,
    newestComposerDraft,
    saveCachedComposerDraft,
  } from './app/draft-cache'
  import { newSubmissionId } from './app/submissions'
  import { agentActivityRunningState, chatMarkedRunningState } from './app/send-state'
  import { shouldCompleteActiveTurn } from './app/active-turn-state'
  import { adoptEditReplacement } from './app/edit-replacement'
  import { persistedActiveBranchKey } from './app/branch-reconciliation'
  import { PostPaintScheduler } from './app/post-paint-scheduler'
  import { isArchiveSessionHotkey } from './app/hotkeys'
  import { enabledThinkingLevels, modelAfterOptionsRefresh, nextModelSelection, thinkingAfterModelChange } from './app/model-selection'
  import ElmaHeaderTitle from './ElmaHeaderTitle.svelte'
  import ElmaStatusBar from './ElmaStatusBar.svelte'
  import {
    CHAT_WIDTH_STEP,
    DEFAULT_CHAT_WIDTH,
    ELMA_CHAT_WIDTH_KEY,
    MAX_CHAT_WIDTH,
    MIN_CHAT_WIDTH,
    clampChatWidth,
  } from './app/chat-width'

  type Ref<T> = { current: T }
  const ref = <T,>(v: T): Ref<T> => ({ current: v })

  // ── Reference / config data ───────────────────────────────────────────────
  let repos = $state<Repo[]>([])
  let ips = $state<Ip[]>([])
  let subs = $state<Subscription[]>([])
  let policy = $state<RepoPolicy>({ rules: [], global_default: '' })
  let recents = $state<RecentRepo[]>(loadRecents())
  let activeRepo = $state('')
  let activeRepoPath = $state('')
  let currentIp = $state('')
  let ipExplicit = $state(false)
  // Only an IP picked while no session is attached may override a repo's
  // default for the next chat. A choice made inside an existing session must
  // not leak into the next session.
  let ipExplicitForNewChat = $state(false)
  const activeRepoPathRef = ref('')
  // Repository tag catalogs are independent of Chat Session lifetime. Track the
  // selected Repo separately so VIP definitions can be hydrated as soon as the
  // Repo is known, including before the first Turn creates a Chat Session.
  const tagCatalogRepoPathRef = ref('')
  const ipExplicitRef = ref(false)
  const currentIpRef = ref('')
  const ipsRef = ref<Ip[]>([])
  let thinking = $state<ThinkingLevel>(DEFAULT_THINKING)
  let fastMode = $state(false)
  let model = $state<ModelId>(DEFAULT_MODEL)
  let worktreeSupported = $state(false)
  let worktreePath = $state<string | null>(null)
  let worktrees = $state<WorktreeInfo[]>([])
  let worktreeBusy = $state(false)
  let affectedFiles = $state(0)
  let affectedLines = $state(0)
  let worktreeDiffMode = $state<WorktreeDiffMode>('uncommitted')
  let worktreeDiffSummary = $state<ChangeWalkthroughSummary | null>(null)
  let changeWalkthroughEnabled = $state(false)
  let worktreeStatsError = $state<string | null>(null)
  let worktreeStatsLoading = $state(false)
  let overlayEmbedPending = $state(0)
  let overlayEmbedRunning = $state(false)
  let worktreeStatsGeneration = 0
  // `worktreePath` is durable Chat Session state. The branch list may still
  // be loading when the status bar first paints, so do not present that brief
  // reconciliation window as "No Worktree".
  const worktreeBranch = $derived(worktreeDiffSummary?.branch || '')
  const primaryBranch = $derived(
    worktreeDiffSummary?.master_ref?.replace(/^refs\/(?:heads|remotes\/origin)\//, '')
      ?? (/^(?:main|master)$/.test(worktreeBranch) ? worktreeBranch : null)
      ?? worktrees.find((item) => item.branch === 'master')?.branch
      ?? worktrees.find((item) => item.branch === 'main')?.branch
      ?? null,
  )
  const primaryIsCurrent = $derived(Boolean(primaryBranch && worktreeBranch === primaryBranch))

  async function refreshWorktreeStats(path: string | null) {
    const generation = ++worktreeStatsGeneration
    if (!path || !changeWalkthroughEnabled) {
      affectedFiles = 0
      affectedLines = 0
      worktreeDiffSummary = null
      worktreeStatsError = null
      worktreeStatsLoading = false
      overlayEmbedPending = 0
      overlayEmbedRunning = false
      return
    }
    // Do not render the reset numeric values as a successful empty summary
    // while overlay status/catalog requests are still ahead of the Diff load.
    worktreeStatsError = null
    worktreeStatsLoading = true
    // Overlay embeds are on-demand: poll the worktree-scoped pending count so
    // the status bar can offer "Embed N chunks". Independent of the diff stats
    // below — either may fail without blanking the other.
    if (hasBridge()) {
      try {
        const st = await api.knowledge.overlayEmbedStatus(path)
        if (generation === worktreeStatsGeneration) {
          overlayEmbedPending = st.overlay?.pending ?? 0
          overlayEmbedRunning = !!st.progress?.running
        }
      } catch {
        if (generation === worktreeStatsGeneration) {
          overlayEmbedPending = 0
          overlayEmbedRunning = false
        }
      }
    }
    try {
      if (!changeWalkthroughEnabled || generation !== worktreeStatsGeneration) return
      const catalog = await api.changeWalkthrough.targets(undefined, false)
      if (!changeWalkthroughEnabled || generation !== worktreeStatsGeneration) return
      const target = catalog.repos.flatMap((repo) => repo.targets).find((item) => item.worktree_root === path)
      if (!target) throw new Error('Repository statistics target unavailable')
      // The primary branch has no meaningful primary-branch or parent view.
      // Normalize before loading so both the selected button and its statistics
      // describe the same working-copy-only comparison.
      const requestedMode = /^(?:main|master)$/.test(target.branch ?? '') && (worktreeDiffMode === 'master' || worktreeDiffMode === 'parent')
        ? 'uncommitted'
        : worktreeDiffMode
      if (requestedMode !== worktreeDiffMode) worktreeDiffMode = requestedMode
      const summary = await api.changeWalkthrough.summary(target.target_id, requestedMode, false)
      if (generation !== worktreeStatsGeneration) return
      affectedFiles = summary.totals.files
      affectedLines = summary.totals.additions + summary.totals.deletions
      worktreeDiffSummary = summary
      worktreeStatsLoading = false
    } catch (error) {
      if (generation !== worktreeStatsGeneration) return
      affectedFiles = 0
      affectedLines = 0
      worktreeDiffSummary = null
      worktreeStatsLoading = false
      worktreeStatsError = error instanceof Error ? error.message : String(error)
    }
  }

  $effect(() => {
    const path = worktreePath
    const enabled = changeWalkthroughEnabled
    // A newly selected/current Worktree must load its active Diff View before
    // the status bar decides whether it has changes. Zero is not a loading
    // value: rendering it before a summary was requested incorrectly showed
    // “No changes”, most visibly for the primary main/master Worktree. Cache
    // validation in Core keeps this on-demand refresh bounded and invalidates
    // it whenever Git state changes.
    ++worktreeStatsGeneration
    affectedFiles = 0
    affectedLines = 0
    worktreeStatsError = null
    worktreeStatsLoading = false
    worktreeDiffSummary = null
    overlayEmbedPending = 0
    overlayEmbedRunning = false
    if (path && enabled) {
      const sid = coreSessionIdRef.current
      if (sid && paintedSessionId !== sid) deferUntilSessionPaint(`worktree-stats:${sid}`, () => refreshWorktreeStats(path))
      else void refreshWorktreeStats(path)
    }
  })

  // ── View / chrome state ─────────────────────────────────────────────────────
  let theme = $state(localStorage.getItem(ELMA_THEME_KEY) || ELMA_DEFAULT_THEME)
  let uiScale = $state(parseFloat(localStorage.getItem(ELMA_UI_SCALE_KEY) || '1') || 1)
  let contentScale = $state(
    Math.max(
      parseFloat(localStorage.getItem(ELMA_CONTENT_SCALE_KEY) || '1') || 1,
      parseFloat(localStorage.getItem(ELMA_UI_SCALE_KEY) || '1') || 1,
    ),
  )
  let chatWidth = $state(clampChatWidth(parseFloat(localStorage.getItem(ELMA_CHAT_WIDTH_KEY) || String(DEFAULT_CHAT_WIDTH))))

  // ── Conversation state (the tree) ───────────────────────────────────────────
  let nodes = $state<TurnMap>({})
  let rootId = $state<string | null>(null)
  let activeChild = $state<ActiveChild>({})
  let viewIndex = $state(0)
  const nodesRef = ref<TurnMap>({})
  const rootIdRef = ref<string | null>(null)
  const activeChildRef = ref<ActiveChild>({})
  const viewIndexRef = ref(0)

  // ── Compose state ─────────────────────────────────────────────────────────
  let composing = $state(false)
  let composeMode = $state<'new' | 'branch' | 'edit'>('new')
  let branchFromId = $state<string | null>(null)
  let editId = $state<string | null>(null)
  let pendingRemoveId = $state<string | null>(null)
  let pendingArchive = $state(false)
  let pendingStopSend = $state<{ text: string; chatTitle: string | null; attachments: ImageAttachment[]; composeMode: 'new' | 'branch' | 'edit'; branchFromId: string | null; editId: string | null } | null>(null)
  let composerNonce = $state(0)
  let overlayOpen = $state(false)
  let quickOpen = $state(false)
  let tagDialogOpen = $state(false)
  let chatTags = $state<ChatTag[]>([])
  let tokenUsage = $state<SessionTokenUsage | null>(null)
  // Core's usage.tick is cumulative for the active Turn. Add it to the
  // completed-session snapshot. When the render store seals its streaming
  // overlay at TURN_COMPLETED, preserve that observed total until the durable
  // request_log projection catches up.
  const cockpitTokenUsage = $derived(withLiveTokenUsage(tokenUsage, streaming.usage))
  let lastLiveTokenUsage: SessionTokenUsage | null = null
  let lastLiveTokenSessionId: string | null = null
  $effect(() => {
    const live = streaming.usage
    const sid = coreSessionId
    if (live && sid) {
      lastLiveTokenUsage = live
      lastLiveTokenSessionId = sid
    } else if (lastLiveTokenUsage) {
      // The render projection intentionally clears its transient overlay when a
      // Turn becomes terminal. Transfer the last cumulative live sample into
      // the visible session total before that overlay disappears from cockpit.
      if (sid && sid === lastLiveTokenSessionId) {
        tokenUsage = withLiveTokenUsage(tokenUsage, lastLiveTokenUsage)
      }
      lastLiveTokenUsage = null
      lastLiveTokenSessionId = null
    }
  })
  let knownTags = $state<string[]>([])
  let tagDefinitions = $state<ChatTagDefinition[]>([])
  let tagEditing = $state<ChatTag | null>(null)
  let tagSaving = $state(false)
  let toast = $state<string | null>(null)
  let sessionId = $state('')
  let chatTitle = $state('')
  let titleEditing = $state(false)
  let titleSaving = $state(false)
  let parentChatSession = $state<import('./api').ParentChatSession | null>(null)
  let sessionOnGoing = $state(false)
  let ongoingSaving = $state(false)
  let coreSessionId = $state<string | null>(null)
  let searchTarget = $state<ElmaSearchTarget | null>(null)
  let agentTerminals = $state<Record<string, Extract<AgentStatusKind, 'completed' | 'failed' | 'cancelled'>>>({})
  let agentFailureDetails = $state<Record<string, string>>({})
  let filePreview = $state<LocalFilePreview | null>(null)
  let threadInspectorOpen = $state(false)
  let filePreviewLoading = $state(false)
  let filePreviewEditing = $state(false)
  let viewFullscreen = $state(false)
  // Chat and Change Walkthrough are sibling pages. Keep the initialized
  // Walkthrough mounted while hidden so its target/file/scroll state survives
  // the header and Option+Tab toggle.
  let elmaPage = $state<'chat' | 'change-walkthrough'>('chat')
  let walkthroughInitialized = $state(false)
  let walkthroughLaunchChatSessionId = $state<string | null>(null)
  let walkthroughLaunchWorktreePath = $state<string | null>(null)
  let walkthroughLaunchDiffMode = $state<'uncommitted' | null>(null)
  let walkthroughRefreshToken = $state(0)
  let walkthroughLaunchToken = $state(0)
  $effect(() => { void callNative('app.consumeOpen', { page: elmaPage }).catch(() => {}) })
  let previewHistory = $state<{ items: PreviewEntry[]; index: number }>({ items: [], index: -1 })
  const draftRef = ref('')
  const attachmentsRef = ref<ImageAttachment[]>([])
  let draftChatNotes = $state<string[]>([])
  const composerRef = ref<HTMLTextAreaElement | null>(null)
  const scrollRef = ref<HTMLDivElement | null>(null)
  const respondTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftStatusRef = ref(false)
  const draftTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftSyncSeqRef = ref(0)
  // Synchronous, renderer-local shadow. Core is the durable source of truth,
  // but a native app/window switch can suspend WebKit before an async RPC is
  // posted or completed. The shadow captures every input event immediately.
  // `null` means the local composer agrees with Core; false specifically keeps
  // track of a user clearing a draft until that discard reaches Core.
  const pendingDraftStateRef = ref<boolean | null>(null)
  // Serialize draft writes. Without this, an older slow RPC can finish after a
  // newer one and overwrite the latest composer snapshot.
  const draftSaveChainRef = ref<Promise<void>>(Promise.resolve())
  // Revision seen after this window's latest durable write. Accepted-send cleanup
  // uses it as a compare-and-delete guard so another Elma window's newer edit
  // cannot be removed after our submission completes.
  const draftRevisionRef = ref<Record<string, number>>({})
  // The Draft opened from Willo is an entity identity, not a property of the
  // current repo/session-shaped composer slot. Keep it explicit while the card
  // is open so navigation and queued writes cannot mint a second Draft.
  const activeDraftIdRef = ref<string | null>(null)
  const openDraftTokenRef = ref(0)
  const acknowledgeRead = createReadReceipt((id) => api.session.setUnread(id, false))
  const unreadReadAckIncompleteTargetRef = ref('')

  const sessionRef = ref<{ id: string; repo: string; ip: string } | null>(null)
  const nodeTurnIdRef = ref<Record<string, string>>({})
  // Reactive revision for ref-only durable-ID updates; active-branch persistence
  // must rerun when Core acknowledges an optimistic local Turn.
  let nodeTurnIdRevision = $state(0)
  const mutatedRef = ref(false)
  const sendInFlightRef = ref(false)
  // The composer is cleared before the send RPC resolves. Keep that interval
  // explicit so blur/focus restoration cannot mistake the deliberately cleared
  // textarea for a lost draft and resurrect the just-sent message.
  const pendingComposerSendRef = ref<{ submissionId: string; text: string; attachments: ImageAttachment[]; chatNotes: string[]; draftId: string; composerIdentity: string; composerToken: number; chatSessionId: string | null; cacheSnapshotId?: string } | null>(null)
  const pendingLandRef = ref<string | null>(null)
  const followLeafRef = ref(true)
  const attachTokenRef = ref(0)
  const thinkingSaveChainRef = ref<Promise<void>>(Promise.resolve())
  // Model selection is Chat Session metadata, never a shared IP setting.
  const modelSaveChainRef = ref<Promise<void>>(Promise.resolve())
  const activeBranchSaveChainRef = ref<Promise<void>>(Promise.resolve())
  const lastSavedActiveBranchRef = ref('')
  let activeTurnId = $state('')
  const activeTurnIdRef = ref('')
  function setActiveTurnId(id: string) { activeTurnIdRef.current = id; activeTurnId = id }
  const awaitRef = ref(false)
  const sawRunningRef = ref(false)
  const liveTextRef = ref('')
  const liveBlocksRef = ref<AnswerBlock[]>([])
  const liveCyclesRef = ref<AssistantCycle[]>([])
  const durableCycleCountRef = ref(0)
  const prevLiveThinkingActiveRef = ref(false)
  const prevLiveThinkingValueRef = ref('')
  const prevLiveTextValueRef = ref('')
  const afterToolBoundaryRef = ref(false)
  const seenNativeToolBoundariesRef = ref<Set<string>>(new Set())
  const thinkingStreamStartRef = ref<number | null>(null)
  const textStreamStartRef = ref<number | null>(null)
  const boundaryOrderRef = ref<{ ts: number; seq?: number } | null>(null)
  const prevTurnPhaseRef = ref<string | null>(null)
  const lastDisplayRef = ref('')

  // ── The shared fold (event-sourcing.md §14) ─────────────────────────────────
  let view = $state<ChatSessionView>(initialChatSession(''))
  let streaming = $state<StreamingOverlay>({ text: '', thinking: '', toolOutputs: {} })
  let sessionHistoryHydrated = $state(false)
  let hasMoreSessionHistory = $state(false)
  let loadingOlderSessionHistory = $state(false)
  let loadOlderSessionHistory: () => Promise<void> = async () => {}
  const viewRef = ref<ChatSessionView>(view)
  const coreSessionIdRef = ref<string | null>(null)
  let sessionOpenId = $state<string | undefined>(undefined)
  const sessionOpenStartedRef = ref<number | null>(null)
  const paintedSessionOpenRef = ref('')
  const postPaintScheduler = new PostPaintScheduler()
  const postPaintGenerationRef = ref(0)
  const initialSessionAttachStartedRef = ref(false)
  const openHandoffGuard = new OpenHandoffGuard()
  let paintedSessionId = $state('')

  function acknowledgeSessionOpen(sessionId: string, sessionOpenId: string) {
    const identity = { session_id: sessionId, session_open_id: sessionOpenId }
    void callNative('app.consumeOpen', identity).then((result) => {
      if ((result as { consumed?: boolean } | null)?.consumed) openHandoffGuard.markAcknowledged(identity)
    }).catch(() => {
      // Keep the handled identity pending. A duplicate durable delivery can retry
      // acknowledgement without repeating telemetry or attachment work.
    })
  }

  function beginSessionPaintGate() {
    postPaintGenerationRef.current = postPaintScheduler.begin()
    paintedSessionOpenRef.current = ''
    paintedSessionId = ''
  }

  function deferUntilSessionPaint(key: string, task: () => void | Promise<void>) {
    postPaintScheduler.defer(key, postPaintGenerationRef.current, task)
  }

  // Bind to Core's durable render projection for the open session.
  $effect(() => {
    const id = coreSessionId
    coreSessionIdRef.current = id
    const store = chatSessionView(elmaBridge, id, sessionOpenId)
    const unsub = store.subscribe((s) => {
      view = s.view
      streaming = s.streaming
      sessionHistoryHydrated = s.historyHydrated
      hasMoreSessionHistory = s.hasMoreHistory
      loadingOlderSessionHistory = s.loadingOlderHistory
      loadOlderSessionHistory = s.loadOlderHistory
      viewRef.current = s.view
    })
    return unsub
  })

  $effect(() => {
    const openId = sessionOpenId
    const sid = coreSessionId
    if (!sid || !sessionHistoryHydrated || paintedSessionOpenRef.current === (openId || sid)) return
    // Empty history is an explicit usable state; otherwise require at least one
    // durable Turn/message before declaring readiness. Wait through DOM commit
    // and one animation frame so this is visual readiness, not RPC completion.
    if (!Object.keys(view.turns || {}).length && (view.messages || []).length) return
    paintedSessionOpenRef.current = openId || sid
    const paintGeneration = postPaintGenerationRef.current
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (coreSessionIdRef.current !== sid) return
      paintedSessionId = sid
      postPaintScheduler.markPainted(paintGeneration)
      if (openId) bridgeDiagnostic({
        stage: 'first_usable_history_painted', session_id: sid, session_open_id: openId,
        elapsed_ms: sessionOpenStartedRef.current == null ? undefined : performance.now() - sessionOpenStartedRef.current,
      })
    }))
  })

  const toolOutputPreviews = $derived.by(() => buildToolOutputPreviews(view, streaming))

  $effect(() => {
    if (!coreSessionId || titleEditing) return
    if (typeof view.title === 'string' && view.title.trim() && view.title !== chatTitle) chatTitle = view.title
  })

  const publishedElmaActiveChatSessionIdRef = ref<string | null>(null)
  const attachingSessionIdRef = ref<string | null>(null)

  $effect(() => {
    if (coreSessionId) {
      attachingSessionIdRef.current = null
      publishedElmaActiveChatSessionIdRef.current = coreSessionId
      publishElmaActiveChatSessionId(coreSessionId)
      void callNative('app.setActiveChatSession', { session_id: coreSessionId }).catch(() => {})
    } else if (publishedElmaActiveChatSessionIdRef.current && !attachingSessionIdRef.current) {
      publishedElmaActiveChatSessionIdRef.current = null
      publishElmaActiveChatSessionId(null)
      void callNative('app.setActiveChatSession', { session_id: '' }).catch(() => {})
    }
  })

  onMount(() => () => {
    publishedElmaActiveChatSessionIdRef.current = null
    publishElmaActiveChatSessionId(null)
    void callNative('app.setActiveChatSession', { session_id: '' }).catch(() => {})
  })

  // Session chrome and approval cards are fields of the same materialized DTO;
  // they do not open independent durable-event subscriptions.
  $effect(() => {
    // Attaching sets coreSessionId before the first materialized page arrives.
    // Do not let initialChatSession(false) overwrite metadata already returned
    // by chat_session.get during that hydration window.
    if (coreSessionId && sessionHistoryHydrated) sessionOnGoing = Boolean(parentChatSession?.onGoing ?? view.onGoing)
  })

  $effect(() => {
    const latest = view.workingDirectoryChanges[view.workingDirectoryChanges.length - 1]
    if (!coreSessionId || !latest || latest.worktree_path === worktreePath) return
    worktreePath = latest.worktree_path
    void callNative('app.setActiveWorktree', { path: worktreePath }).catch(() => {})
    void refreshWorktreeStats(worktreePath)
  })

  // The click_required approval queue (effector approval gate).
  const approvals = $derived<PendingApproval[]>(approvalsFromView(view))
  let approvalBusy = $state<Set<string>>(new Set())
  let dismissedApprovalIds = $state<Set<string>>(new Set())
  const visibleApprovals = $derived(approvals.filter((a) => !dismissedApprovalIds.has(a.request_id)))

  // Reconcile optimistic dismissals once the durable queue catches up. Request
  // ids are globally unique; retain only ids that still exist in the source.
  $effect(() => {
    const pendingIds = new Set(approvals.map((a) => a.request_id))
    const next = new Set([...dismissedApprovalIds].filter((id) => pendingIds.has(id)))
    if (next.size !== dismissedApprovalIds.size) dismissedApprovalIds = next
  })

  function dismissApproval(requestId: string) {
    // Close immediately. A decision event or the next snapshot confirms it;
    // stale already-resolved requests must not leave an uncloseable card.
    dismissedApprovalIds = new Set([...dismissedApprovalIds, requestId])
  }

  function decideApproval(requestId: string, rpc: (sessionId: string, requestId: string) => Promise<unknown>) {
    const sid = sessionRef.current?.id
    if (!sid) return
    dismissApproval(requestId)
    const next = new Set(approvalBusy); next.add(requestId); approvalBusy = next
    Promise.resolve(rpc(sid, requestId))
      .catch(() => {
        // A real transport failure may mean the decision never arrived. Restore
        // the card so the user can retry; already-resolved clicks are idempotent
        // in the effector and follow the success path instead.
        const restored = new Set(dismissedApprovalIds); restored.delete(requestId); dismissedApprovalIds = restored
        flashToast('Could not submit decision — please try again')
      })
      .finally(() => { const n = new Set(approvalBusy); n.delete(requestId); approvalBusy = n })
  }

  const openQuery: ElmaOpenPayload = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('open')
      return raw ? (JSON.parse(raw) as ElmaOpenPayload) : {}
    } catch { return {} }
  })()
  if (openQuery.session_id && openQuery.session_open_id) {
    openHandoffGuard.accept(openQuery)
    sessionOpenId = openQuery.session_open_id
    sessionOpenStartedRef.current = performance.now()
    bridgeDiagnostic({ stage: 'handoff_received', session_id: openQuery.session_id, session_open_id: openQuery.session_open_id, elapsed_ms: 0 })
  }
  const requestedSessionIdRef = ref<string | null>(openQuery.session_id || null)
  const requestedDraftIdRef = ref<string | null>(openQuery.draft_id || null)
  const requestedSearchTargetRef = ref<ElmaSearchTarget | null>(searchTargetFromOpenPayload(openQuery))
  const pendingDraftRestoreRef = ref<{ sessionId: string; text: string; attachments: ImageAttachment[] } | null>(null)
  const requestedCmdNumberRef = ref<string | null>(typeof openQuery.cmd_number === 'string' && /^[0-9]$/.test(openQuery.cmd_number) ? openQuery.cmd_number : null)
  const requestedEntityURIRef = ref<string | null>(typeof openQuery.insert_entity_uri === 'string' ? openQuery.insert_entity_uri : null)

  function defaultThinkingForIp(ipName: string, ipList: Ip[] = ipsRef.current): ThinkingLevel {
    const configured = ipList.find((ip) => ip.name === ipName)?.thinking_level
    return THINKING_LEVELS.includes(configured as ThinkingLevel) ? (configured as ThinkingLevel) : DEFAULT_THINKING
  }

  // ── Fold → active-turn sync ────────────────────────────────────────────────
  // (turnAssistantCycles ← ./app/helpers)
  const turnToolResults = (turnId: string) => {
    const coreTurnId = nodeTurnIdRef.current[turnId] || view.turn?.turn_id || ''
    return (view.toolResults || [])
      .filter((r) => !coreTurnId || !r.turn_id || r.turn_id === coreTurnId)
      .map((r) => ({
        request_id: r.request_id,
        turn_id: r.turn_id,
        kind: r.kind,
        params: view.toolRequestParams?.[r.request_id] || {},
        ok: r.ok,
        result: r.result,
        error: r.error,
        opened_ts: r.opened_ts,
        ts: r.ts,
      }))
  }
  const turnToolStatuses = (turnId: string) => {
    const coreTurnId = nodeTurnIdRef.current[turnId] || view.turn?.turn_id || ''
    return Object.values(view.toolRequests || {})
      .filter((r) => !coreTurnId || !r.turn_id || r.turn_id === coreTurnId)
      .map((r) => ({
        request_id: r.request_id,
        turn_id: r.turn_id,
        kind: r.kind,
        params: view.toolRequestParams?.[r.request_id] || {},
        ts: view.toolRequestOpenedAt?.[r.request_id],
        phase: r.phase,
        decision: r.decision,
        ok: r.ok,
      }))
  }
  const turnNativeToolCalls = (turnId: string) => {
    const coreTurnId = nodeTurnIdRef.current[turnId] || view.turn?.turn_id || ''
    return (view.nativeToolCalls || []).filter((c) => !coreTurnId || c.turn_id === coreTurnId)
  }

  function refreshTokenUsage(sessionId: string) {
    void api.session.get(sessionId, true).then((result) => {
      if ((coreSessionIdRef.current || sessionRef.current?.id) === sessionId) {
        // A terminal render can arrive before request_log is projected. Never
        // replace the just-observed live total with an empty or stale snapshot.
        tokenUsage = reconcileRecordedTokenUsage(tokenUsage, result.chat_session?.last_usage)
      }
    }).catch(() => {})
  }

  function finishActive(
    blocks: AnswerBlock[],
    terminal: Extract<AgentStatusKind, 'completed' | 'failed' | 'cancelled'> = 'completed',
    failureDetail?: string,
  ) {
    const tid = activeTurnIdRef.current
    if (tid) {
      const stamp = Date.now()
      const currentNodes = nodesRef.current
      nodesRef.current =
        currentNodes[tid] && currentNodes[tid].respondedAt === null
          ? { ...currentNodes, [tid]: { ...currentNodes[tid], answer: blocks, thinking: undefined, respondedAt: stamp } }
          : currentNodes
      if (nodes[tid] && nodes[tid].respondedAt === null) nodes = { ...nodes, [tid]: { ...nodes[tid], answer: blocks, thinking: undefined, respondedAt: stamp } }
      agentTerminals = { ...agentTerminals, [tid]: terminal }
      if (terminal === 'failed' && failureDetail?.trim()) {
        agentFailureDetails = { ...agentFailureDetails, [tid]: failureDetail.trim() }
      }
    }
    awaitRef.current = false
    sawRunningRef.current = false
    setActiveTurnId('')
    liveTextRef.current = ''
    liveBlocksRef.current = []
    liveCyclesRef.current = []
    durableCycleCountRef.current = 0
    prevLiveThinkingActiveRef.current = false
    prevLiveThinkingValueRef.current = ''
    prevLiveTextValueRef.current = ''
    afterToolBoundaryRef.current = false
    seenNativeToolBoundariesRef.current = new Set()
    thinkingStreamStartRef.current = null
    textStreamStartRef.current = null
    boundaryOrderRef.current = null
    prevTurnPhaseRef.current = null
    lastDisplayRef.current = ''
    const sessionId = coreSessionIdRef.current || sessionRef.current?.id
    if (sessionId) refreshTokenUsage(sessionId)
  }

  // Drive the active node off the folded turn (runs on view/streaming change).
  $effect(() => {
    // Reactive deps: touch view + streaming so this re-runs on every fold tick.
    const v = view
    const s = streaming
    if (!awaitRef.current || !activeTurnIdRef.current) return
    const tid = activeTurnIdRef.current
    if (v.status === 'running') sawRunningRef.current = true
    // A bounded transcript can evict old messages during this turn. Counts are
    // not stable offsets; wait for the submission identity and select by it.
    void nodeTurnIdRevision
    const coreTurnId = nodeTurnIdRef.current[tid]
    if (!coreTurnId) return
    const turnCycles = turnAssistantCycles(v.messages, coreTurnId)
    const turnText = turnCycles.map((cycle) => cycle.content).filter(Boolean).join('\n\n')
    const results = turnToolResults(tid)
    const statuses = turnToolStatuses(tid)
    const nativeCalls = turnNativeToolCalls(tid)
    const durableBlocks = assistantBlocks(turnCycles, results, statuses, nativeCalls)

    const terminal = v.lastTurnTerminal?.turn_id === coreTurnId ? v.lastTurnTerminal : null
    const baseBlocks = durableBlocks.length ? durableBlocks : liveBlocksRef.current.length ? liveBlocksRef.current : parseMarkdown(turnText || liveTextRef.current)
    if (v.status === 'error' || terminal?.phase === 'failed') {
      const detail = terminal?.error?.trim()
      finishActive([...baseBlocks, { t: 'p', v: detail ? `⚠︎ ${detail}` : '⚠︎ The turn failed.' }], 'failed', detail)
      return
    }
    if (terminal?.phase === 'cancelled') {
      finishActive([...baseBlocks, { t: 'p', v: '⏹ The turn was canceled.' }], 'cancelled')
      return
    }
    const newAssistant = turnCycles.length > 0
    // The fold's idle state is authoritative. `lastTurnTerminal` is bounded
    // projection convenience data and may already be absent by the time this
    // effect observes idle. Once this optimistic Turn has observed its fold
    // running, idle must finish it even without that retained terminal.
    if (shouldCompleteActiveTurn({
      foldStatus: v.status,
      terminalPhase: terminal?.phase,
      sawRunning: sawRunningRef.current,
      newAssistant,
    })) {
      finishActive(baseBlocks, 'completed')
      return
    }
    const display = [turnText, s.text].filter(Boolean).join('\n\n')

    if (turnCycles.length !== durableCycleCountRef.current) {
      const delta = Math.max(0, turnCycles.length - durableCycleCountRef.current)
      if (delta) liveCyclesRef.current = liveCyclesRef.current.slice(delta)
      durableCycleCountRef.current = turnCycles.length
    }

    const turnPhase = v.turn?.phase ?? null
    if (turnPhase === 'awaiting_tools' && prevTurnPhaseRef.current !== 'awaiting_tools') afterToolBoundaryRef.current = true
    prevTurnPhaseRef.current = turnPhase

    const thinkingActive = Boolean(s.thinking)
    const textActive = Boolean(s.text)
    let liveCycles = liveCyclesRef.current

    // Native calls are observational and do not change the turn phase, so the
    // old phase-based boundary missed them. Consume offsets captured by the
    // stream store at invocation time; this remains correct even if Svelte
    // batches the invocation and subsequent thinking delta into one effect.
    for (const boundary of s.nativeToolBoundaries || []) {
      if (seenNativeToolBoundariesRef.current.has(boundary.toolUseId)) continue
      seenNativeToolBoundariesRef.current.add(boundary.toolUseId)
      afterToolBoundaryRef.current = true
      thinkingStreamStartRef.current = boundary.thinkingOffset
      textStreamStartRef.current = boundary.textOffset
      boundaryOrderRef.current = { ts: boundary.ts, seq: boundary.seq }
    }

    if (thinkingActive && s.thinking !== prevLiveThinkingValueRef.current) {
      const start = thinkingStreamStartRef.current
      const thinkingChunk = start != null && start <= s.thinking.length ? s.thinking.slice(start) : s.thinking
      const last = liveCycles[liveCycles.length - 1]
      const startsNewThinkingCycle = afterToolBoundaryRef.current || !prevLiveThinkingActiveRef.current || !last || Boolean(last.content)
      const boundaryOrder = boundaryOrderRef.current
      if (startsNewThinkingCycle && thinkingChunk) liveCycles = [...liveCycles, {
        thinking: thinkingChunk,
        ts: boundaryOrder?.ts ?? Date.now(),
        seq: boundaryOrder?.seq != null ? boundaryOrder.seq + 0.5 : undefined,
      }]
      else if (thinkingChunk) liveCycles = [...liveCycles.slice(0, -1), { ...last, thinking: thinkingChunk }]
      prevLiveThinkingValueRef.current = s.thinking
      afterToolBoundaryRef.current = false
    } else if (!thinkingActive) {
      prevLiveThinkingValueRef.current = ''
      thinkingStreamStartRef.current = null
    }

    if (textActive && s.text !== prevLiveTextValueRef.current) {
      const start = textStreamStartRef.current
      const textChunk = start != null && start <= s.text.length ? s.text.slice(start) : s.text
      const last = liveCycles[liveCycles.length - 1]
      const startsNewTextOnlyCycle = afterToolBoundaryRef.current || !last
      const boundaryOrder = boundaryOrderRef.current
      if (startsNewTextOnlyCycle && textChunk) liveCycles = [...liveCycles, {
        content: textChunk,
        ts: boundaryOrder?.ts ?? Date.now(),
        seq: boundaryOrder?.seq != null ? boundaryOrder.seq + 0.5 : undefined,
      }]
      else if (textChunk) liveCycles = [...liveCycles.slice(0, -1), { ...last, content: textChunk }]
      prevLiveTextValueRef.current = s.text
      afterToolBoundaryRef.current = false
    } else if (!textActive) {
      prevLiveTextValueRef.current = ''
      textStreamStartRef.current = null
    }
    if (!thinkingActive && !textActive && !(s.nativeToolBoundaries || []).length) boundaryOrderRef.current = null

    liveCyclesRef.current = liveCycles
    prevLiveThinkingActiveRef.current = thinkingActive

    const displayCycles = [...turnCycles, ...liveCycles]
    const displayBlocks = assistantBlocks(displayCycles, results, statuses, nativeCalls)
    liveTextRef.current = display
    liveBlocksRef.current = displayBlocks
    const displayKey = JSON.stringify(displayBlocks)
    if (displayKey !== lastDisplayRef.current) {
      lastDisplayRef.current = displayKey
      if (nodes[tid] && nodes[tid].respondedAt === null) nodes = { ...nodes, [tid]: { ...nodes[tid], answer: displayBlocks, thinking: undefined } }
    }
  })

  // ── Reload-restore: derive the tree from the fold until the user mutates ─────
  $effect(() => {
    const v = view
    const s = streaming
    if (!hasBridge() || mutatedRef.current || !coreSessionId) return
    const { nodes: dn, rootId: dr } = buildTreeFromView(v, s)
    nodes = dn
    rootId = dr
    const map: Record<string, string> = {}
    for (const id in dn) map[id] = id
    nodeTurnIdRef.current = map
    if (pendingLandRef.current && dn[pendingLandRef.current]) {
      const tid = pendingLandRef.current
      const ac = { ...activeChild, ...TREE.activeChildFor(dn, tid) }
      activeChild = ac
      viewIndex = Math.max(0, TREE.activePath(dn, dr, ac).indexOf(tid))
      pendingLandRef.current = null
      followLeafRef.current = false
    } else if (pendingLandRef.current && sessionHistoryHydrated) {
      // The selected branch may have fallen outside the bounded newest-Turn
      // page. Walk older projection pages until its identifying Turn appears.
      if (hasMoreSessionHistory && !loadingOlderSessionHistory) {
        void loadOlderSessionHistory()
      } else if (!hasMoreSessionHistory) {
        // The saved Turn was removed (or belongs to corrupt legacy metadata).
        // Fall back to the normal newest branch instead of leaving viewIndex at
        // the first Turn. Updating viewIndex also wakes the persistence effect;
        // pendingLandRef itself is intentionally non-reactive.
        pendingLandRef.current = null
        const p = TREE.activePath(dn, dr, activeChild)
        viewIndex = Math.max(0, p.length - 1)
      }
    } else if (followLeafRef.current) {
      const p = TREE.activePath(dn, dr, activeChild)
      viewIndex = Math.max(0, p.length - 1)
    }
  })

  // ── Derived view state ──────────────────────────────────────────────────────
  const loggedInSubs = $derived(new Set(subs.filter(subLoggedIn).map((s) => s.name)))
  const enabledIpNames = $derived(new Set(ips.filter((ip) => ipEnabled(ip, loggedInSubs)).map((ip) => ip.name)))
  const prohibitedIpNames = $derived(prohibitedIpsForRepo(policy, activeRepoPath))
  const prohibitedRepoPaths = $derived(ipExplicit ? prohibitedReposForIp(policy, currentIp) : new Set<string>())
  // Before the first Turn there is no pinned session IP. Show the same
  // repository-policy result that atomic submission will use, rather than a
  // blank/stale selection left by a previously attached Chat Session.
  const effectiveIpName = $derived(coreSessionId
    ? currentIp
    // Reference-data RPCs settle independently. If policy cannot yet resolve a
    // usable route, retain the selected/attached IP instead of blanking status.
    : newChatIp(policy, activeRepoPath, ips, loggedInSubs, currentIp, ipExplicitForNewChat) || currentIp)
  const activeIp = $derived(ips.find((ip) => ip.name === effectiveIpName))
  // Keep the route visible even while ip.list is refreshing or returns a stale
  // snapshot. The policy's stable IP name is still authoritative and is better
  // than rendering an empty gap between the Rings mark and model.
  const ipLabel = $derived(ipLabelOf(ips, effectiveIpName).trim() || effectiveIpName.trim() || 'No IP')
  const hotkeyModels = $derived(enabledModelOptions(activeIp?.provider, activeIp?.enabled_models, activeIp?.default_model))
  const currentModelForDisplay = $derived(model || activeIp?.default_model || hotkeyModels[0]?.value || DEFAULT_MODEL)
  const currentModelLabel = $derived(modelLabel(currentModelForDisplay, activeIp?.provider))
  const hotkeyThinkingLevels = $derived(enabledThinkingLevels(activeIp?.enabled_thinking_levels, currentModelForDisplay))
  const fastModeAvailable = $derived((activeIp?.provider || '').toLowerCase() === 'codex')

  $effect(() => {
    thinking = thinkingAfterModelChange(thinking, hotkeyThinkingLevels)
  })

  $effect(() => {
    // ip.list refreshes independently from the session fold and can briefly omit
    // the attached IP. Do not interpret that incomplete snapshot as a provider
    // change: doing so resets an explicit per-turn model after the first reply.
    model = modelAfterOptionsRefresh(model, Boolean(activeIp), hotkeyModels)
  })

  const chatNotes = $derived(view.messages
    .filter((message) => message.message_type === 'note')
    .map((message) => ({ id: message.id, content: message.content, ts: message.ts, turnId: message.turn_id })))
  const path = $derived(TREE.activePath(nodes, rootId, activeChild))
  const pathNodes = $derived(path.map((id) => nodes[id]))
  const phase = $derived<'empty' | 'active'>(rootId && nodes[rootId] ? 'active' : 'empty')
  const current = $derived<Turn | null>(path.length ? nodes[path[viewIndex]] ?? null : null)
  const responding = $derived(!!current && current.respondedAt === null)
  // Activity chrome follows the folded lifecycle, not optimistic/local Turn
  // bookkeeping, which may remain incomplete briefly after a terminal event.
  // A different session's last snapshot can still be present for one reactive
  // tick while the projection store is being replaced, so bind Running to the
  // exact session that supplied this fold rather than its status alone.
  const agentRunning = $derived(
    coreSessionId !== null
      && view.chat_session_id === coreSessionId
      && agentActivityRunningState(view.status),
  )

  // Mirror the reactive tree state into the imperative refs handlers read.
  $effect(() => { nodesRef.current = nodes; rootIdRef.current = rootId; activeChildRef.current = activeChild; viewIndexRef.current = viewIndex })

  const currentNativeToolCalls = $derived.by<NativeToolCallView[]>(() => {
    if (!current) return []
    const coreTurnId = nodeTurnIdRef.current[current.id] || (activeTurnIdRef.current === current.id ? view.turn?.turn_id : undefined) || current.id
    return (view.nativeToolCalls || []).filter((c) => c.turn_id === coreTurnId)
  })

  // Track the latest displayed leaf while still incomplete/running.
  $effect(() => {
    if (!coreSessionId || !current) return
    if (viewIndex !== Math.max(0, path.length - 1)) return
    const target = `${coreSessionId}:${current.id}:${viewIndex}:${path.length}`
    if (current.respondedAt === null || responding || view.status === 'running') unreadReadAckIncompleteTargetRef.current = target
  })

  // Read receipt for Willo Station's isUnread flag.
  $effect(() => {
    if (!hasBridge() || !coreSessionId || current?.respondedAt == null) return
    if (view.chat_session_id !== coreSessionId) return
    if (responding || view.status === 'running') return
    if (viewIndex !== Math.max(0, path.length - 1)) return
    const cid = coreSessionId
    const cur = current
    const target = `${cid}:${cur.id}:${viewIndex}:${path.length}`
    const key = `${cid}:${cur.id}:${cur.respondedAt}`
    const completedInAlreadyOpenView = unreadReadAckIncompleteTargetRef.current === target
    if (completedInAlreadyOpenView) unreadReadAckIncompleteTargetRef.current = ''
    const markRead = (explicit = false) => {
      void acknowledgeRead(cid, key, explicit).catch(() => {})
    }
    if (!completedInAlreadyOpenView) markRead()
    const onFocus = () => markRead(true)
    const onVisibility = () => { if (document.visibilityState === 'visible') markRead(true) }
    const onReadInteraction = () => markRead(true)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pointerdown', onReadInteraction, true)
    window.addEventListener('keydown', onReadInteraction, true)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointerdown', onReadInteraction, true)
      window.removeEventListener('keydown', onReadInteraction, true)
    }
  })

  const curSiblings = $derived(current ? TREE.siblings(nodes, rootId, current.id) : [])
  const branchIndex = $derived(current ? curSiblings.indexOf(current.id) : 0)
  const branchCount = $derived(curSiblings.length)
  const pendingRemove = $derived(pendingRemoveId ? nodes[pendingRemoveId] ?? null : null)

  const agentStatus = $derived.by<AgentStatusState>(() => {
    const approvalCount = visibleApprovals.length
    const terminal = current ? agentTerminals[current.id] : null
    const currentCoreTurnId = current
      ? nodeTurnIdRef.current[current.id] || (activeTurnIdRef.current === current.id ? view.turn?.turn_id : undefined) || current.id
      : null
    const foldedTerminal = view.lastTurnTerminal?.turn_id === currentCoreTurnId
      ? view.lastTurnTerminal
      : null
    const failureDetail = foldedTerminal?.phase === 'failed'
      ? foldedTerminal.error?.trim() || (current ? agentFailureDetails[current.id] : undefined)
      : current ? agentFailureDetails[current.id] : undefined
    if (responding && agentRunning) {
      if (view.status === 'error') return { kind: 'failed', label: 'Failed', detail: failureDetail, failedAt: foldedTerminal?.failed_at ?? current?.respondedAt ?? undefined }
      if (approvalCount > 0) {
        return {
          kind: 'waiting_for_approval',
          label: approvalCount === 1 ? 'Waiting for tool approval' : `Waiting for ${approvalCount} tool approvals`,
          detail: 'Agent is paused until you decide',
        }
      }
      const rateLimitWait = streaming.rateLimitWait
      if (rateLimitWait) {
        return {
          kind: 'routing',
          label: 'Rate limited — waiting to retry…',
          detail: rateLimitWait.recoverySeconds > 0
            ? `~${rateLimitWait.recoverySeconds}s · ${ipLabelOf(ips, rateLimitWait.ipName)}`
            : undefined,
        }
      }
      const t = view.turn
      if (t?.phase === 'pending') return { kind: 'starting', label: 'Starting agent…' }
      if (t?.phase === 'routing') return { kind: 'routing', label: t.ip_name ? `Routing to ${ipLabelOf(ips, t.ip_name)}…` : 'Routing to provider…', detail: t.attempt > 0 ? `attempt ${t.attempt + 1}` : undefined }
      if (t?.phase === 'awaiting_tools') return { kind: 'tool_running', label: 'Waiting for tools…', detail: 'Awaiting tool results' }
      if (streaming.thinking) return { kind: 'thinking', label: 'Thinking…' }
      if (streaming.text) return { kind: 'streaming', label: 'Responding…' }
      if (t?.phase === 'executing') return { kind: 'running', label: t.ip_name ? `${ipLabelOf(ips, t.ip_name)} is working…` : 'Agent is working…', detail: t.cycles > 0 ? `cycle ${t.cycles + 1}` : undefined }
      if (view.status === 'running') return { kind: 'running', label: 'Agent is working…' }
      return { kind: 'starting', label: 'Starting agent…' }
    }
    if (view.status === 'error' || terminal === 'failed' || foldedTerminal?.phase === 'failed') return { kind: 'failed', label: 'Failed', detail: failureDetail, failedAt: foldedTerminal?.failed_at ?? current?.respondedAt ?? undefined }
    if (terminal === 'cancelled' || foldedTerminal?.phase === 'cancelled') return { kind: 'cancelled', label: 'Canceled' }
    if (terminal === 'completed' || foldedTerminal?.phase === 'completed' || current?.respondedAt != null) return { kind: 'completed', label: 'Completed' }
    return { kind: 'ready', label: 'Ready' }
  })

  // Hotkey repo slots.
  const repoSlots = $derived<RepoSlot[]>(buildRepoSlots(repos, recents))
  const repoByName = $derived(new Map(repos.map((r) => [r.name, r])))

  // ── Reference data load + refresh ───────────────────────────────────────────
  async function refreshReferenceData(opts: { initial?: boolean } = {}) {
    const [r, i, s, pol] = await Promise.all([api.repos(), api.ips(), api.subscriptions(), api.repoRules()])
    ipsRef.current = i
    repos = r
    ips = i
    subs = s
    policy = pol
    const firstSlot = buildRepoSlots(r, [])[0]
    const initial = r.find((repo) => repo.name === firstSlot?.name) || r[0]
    const initialName = initial?.name || ''
    const logged = new Set(s.filter(subLoggedIn).map((x) => x.name))

    if (opts.initial) {
      const requestedSessionId = requestedSessionIdRef.current
      const requestedDraftId = requestedDraftIdRef.current
      const requestedCmdNumber = requestedCmdNumberRef.current
      const requestedEntityURI = requestedEntityURIRef.current
      const lastSessionId = loadElmaLastChatSessionId()
      if (!activeRepo) activeRepo = initialName
      if (!activeRepoPath) activeRepoPath = initial?.path || ''
      if (!currentIp) {
        const nextIp = repoDefaultIp(pol, initial?.path || '', i, logged)
        thinking = defaultThinkingForIp(nextIp, i)
        currentIp = nextIp
      }
      if (!sessionId) sessionId = mkSessionId(initialName)
      if (initialSessionAttachStartedRef.current) return
      if (hasBridge() && requestedEntityURI) {
        requestedEntityURIRef.current = null
        void callNative('app.consumeOpen', { insert_entity_uri: requestedEntityURI }).catch(() => {})
        insertEntityIntoComposer(requestedEntityURI)
      } else if (hasBridge() && requestedDraftId) {
        requestedDraftIdRef.current = null
        void callNative('app.consumeOpen', { draft_id: requestedDraftId }).catch(() => {})
        void openDraftById(requestedDraftId)
      } else if (hasBridge() && requestedSessionId) {
        requestedSessionIdRef.current = null
        // Cold-launch URL payload reached Elma's attach flow; native can now
        // clear the durable handoff if this is still the latest card click.
        void attachSessionById(requestedSessionId, requestedSearchTargetRef.current, restoreDraftRequested(openQuery.restore_draft)).then((ok) => {
          if (ok && sessionOpenId) {
            const identity = { session_id: requestedSessionId, session_open_id: sessionOpenId }
            openHandoffGuard.markHandled(identity)
            acknowledgeSessionOpen(requestedSessionId, sessionOpenId)
          }
        })
      } else if (hasBridge() && requestedCmdNumber) {
        // applied once repoSlots is computed (effect below)
      } else if (hasBridge() && lastSessionId) {
        // This is the normal reopen path. Restore the remembered session's
        // composer too; `attachSavedSession` is only the fallback path.
        void attachSessionById(lastSessionId).then((ok) => {
          if (!ok) {
            clearElmaLastChatSessionId()
            if (initialName) void attachSavedSession(initialName)
          }
        })
      } else if (!hasBridge()) {
        const t = seedTree()
        const saved = loadBranchView(initialName)
        if (saved) {
          const ac: ActiveChild = {}
          for (const k in saved.activeChild) if (t.nodes[k]) ac[k] = saved.activeChild[k]
          t.activeChild = { ...t.activeChild, ...ac }
          if (saved.currentId && t.nodes[saved.currentId]) {
            const p = TREE.activePath(t.nodes, t.rootId, t.activeChild)
            const vi = p.indexOf(saved.currentId)
            if (vi >= 0) t.viewIndex = vi
          }
        }
        nodes = t.nodes
        rootId = t.rootId
        activeChild = t.activeChild
        viewIndex = t.viewIndex
      } else if (initialName) {
        void attachSavedSession(initialName)
      }
      return
    }

    const repoPath = activeRepoPathRef.current
    const hasAttachedSession = Boolean(sessionRef.current?.id || coreSessionIdRef.current)
    if (!hasAttachedSession && !ipExplicitRef.current && repoPath) {
      const nextIp = repoDefaultIp(pol, repoPath, i, logged)
      // A reference-data refresh must not discard the effort the user picked.
      // Only apply an IP's configured default when policy actually changes IP.
      if (nextIp !== currentIpRef.current) {
        currentIp = nextIp
        thinking = defaultThinkingForIp(nextIp, i)
      }
    }
  }

  onMount(() => {
    const requestedSessionId = requestedSessionIdRef.current
    if (hasBridge() && requestedSessionId) {
      initialSessionAttachStartedRef.current = true
      requestedSessionIdRef.current = null
      const openId = typeof openQuery.session_open_id === 'string' && openQuery.session_open_id
        ? openQuery.session_open_id : crypto.randomUUID()
      sessionOpenId = openId
      sessionOpenStartedRef.current = performance.now()
      bridgeDiagnostic({ stage: 'handoff_received', session_id: requestedSessionId, session_open_id: openId, elapsed_ms: 0 })
      void attachSessionById(requestedSessionId, requestedSearchTargetRef.current, restoreDraftRequested(openQuery.restore_draft)).then((ok) => {
        if (ok && sessionOpenId) {
          const identity = { session_id: requestedSessionId, session_open_id: sessionOpenId }
          openHandoffGuard.markHandled(identity)
          acknowledgeSessionOpen(requestedSessionId, sessionOpenId)
        }
      })
      deferUntilSessionPaint('reference-data:initial', () => refreshReferenceData({ initial: true }))
    } else {
      refreshReferenceData({ initial: true }).catch((e) => console.error('Elma reference load failed', e))
    }
  })

  // Start disabled until Core confirms the toggle. Refresh independently of
  // transcript paint so disabling scans cannot depend on a stalled chat open.
  onMount(() => {
    if (!hasBridge()) return
    let generation = 0
    const refresh = async () => {
      const request = ++generation
      try {
        const result = await api.featureToggles()
        if (request !== generation) return
        changeWalkthroughEnabled = result.features.some((feature) =>
          feature.key === 'elma.change_walkthrough' && feature.enabled)
        if (!changeWalkthroughEnabled) elmaPage = 'chat'
      } catch {
        if (request !== generation) return
        changeWalkthroughEnabled = false
        elmaPage = 'chat'
      }
    }
    const onFocus = () => { void refresh() }
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const offReconnect = elmaBridge.onCoreReconnect(onFocus)
    return () => {
      ++generation
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      offReconnect()
    }
  })

  // Seqoya Lab edits happen out-of-band: refresh on focus + Core reconnect.
  onMount(() => {
    if (!hasBridge()) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const refreshSoon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const refresh = () => refreshReferenceData().catch((e) => console.error('Elma reference refresh failed', e))
        if (coreSessionIdRef.current && paintedSessionId !== coreSessionIdRef.current) deferUntilSessionPaint('reference-data:refresh', refresh)
        else void refresh()
      }, 120)
    }
    const onFocus = () => refreshSoon()
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshSoon() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const offReconnect = elmaBridge.onCoreReconnect(refreshSoon)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      offReconnect()
    }
  })

  // Persist + apply theme / font scales.
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(ELMA_THEME_KEY, theme)
  })
  $effect(() => {
    localStorage.setItem(ELMA_UI_SCALE_KEY, String(uiScale))
    document.documentElement.style.setProperty('--arbol-font-scale', String(uiScale))
  })
  $effect(() => {
    localStorage.setItem(ELMA_CONTENT_SCALE_KEY, String(contentScale))
    document.documentElement.style.setProperty('--arbol-content-font-scale', String(contentScale))
  })
  $effect(() => {
    localStorage.setItem(ELMA_CHAT_WIDTH_KEY, String(chatWidth))
    document.documentElement.style.setProperty('--arbol-text-area-max-width', `${chatWidth}px`)
    document.documentElement.style.setProperty('--arbol-max-chat-area-width', `${chatWidth + 100}px`)
  })

  // Persist the active conversation branch on the Chat Session itself. The
  // leaf uniquely identifies all choices from root to leaf; unlike the legacy
  // repo-keyed localStorage value, it cannot leak between sessions in one repo.
  $effect(() => {
    if (!rootId || pendingLandRef.current) return
    void nodeTurnIdRevision
    const localActiveTurnId = path[path.length - 1] || null
    const activeTurnId = localActiveTurnId
      ? (nodeTurnIdRef.current[localActiveTurnId] || null)
      : null
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (!hasBridge() || !sid || !activeTurnId) {
      // Keep standalone prototype behavior where Core is unavailable.
      saveBranchView(activeRepo, { activeChild, currentId: path[viewIndex] || null })
      return
    }
    const key = `${sid}:${activeTurnId}`
    if (lastSavedActiveBranchRef.current === key) return
    lastSavedActiveBranchRef.current = key
    activeBranchSaveChainRef.current = activeBranchSaveChainRef.current
      .catch(() => {})
      .then(() => api.session.setActiveBranch(sid, activeTurnId))
      .then(() => undefined)
      .catch((err: unknown) => {
        // "turn not found or removed" is permanent for this turn id — keeping
        // the ref set stops the effect from re-sending it on every rerender
        // (observed as a 900+ request storm against Core). Only transient
        // failures clear the ref so the save is retried.
        if (/turn not found or removed/.test(String(err))) return
        if (lastSavedActiveBranchRef.current === key) lastSavedActiveBranchRef.current = ''
      })
  })

  // ResponseView owns opening and live-follow positioning. Do not reset the DOM
  // scroller from this parent when full-history hydration changes `viewIndex`:
  // that update can describe the same latest Turn and would overwrite the final-
  // answer separator position selected by ResponseView.

  $effect(() => {
    activeRepoPathRef.current = activeRepoPath
    if (tagCatalogRepoPathRef.current === activeRepoPath) return
    tagCatalogRepoPathRef.current = activeRepoPath
    // Never show the previous Repo's catalog while the selected Repo loads.
    knownTags = []
    tagDefinitions = []
    if (activeRepoPath) void refreshKnownTags(activeRepoPath)
  })
  $effect(() => { ipExplicitRef.current = ipExplicit })
  $effect(() => { currentIpRef.current = currentIp })
  $effect(() => { ipsRef.current = ips })

  // Publish the selected repository + theme for the process-wide Cmd+G Repo
  // Artifacts search. The shared app-group store lets whichever Arbol process
  // owns the global hotkey use Elma's current context.
  $effect(() => {
    if (!hasBridge() || !activeRepoPath) return
    void callNative('repoArtifacts.setContext', { repo_path: activeRepoPath, repo_name: activeRepo, theme }).catch(() => {})
  })

  // ── Font scaling ─────────────────────────────────────────────────────────
  const incFont = () => {
    if (uiScale < UI_MAX) { const n = Math.min(UI_MAX, round2(uiScale + FONT_STEP)); uiScale = n; contentScale = n }
    else contentScale = Math.min(CONTENT_MAX, round2(contentScale + FONT_STEP))
  }
  const decFont = () => {
    if (contentScale > uiScale) contentScale = Math.max(uiScale, round2(contentScale - FONT_STEP))
    else { const n = Math.max(SCALE_MIN, round2(uiScale - FONT_STEP)); uiScale = n; contentScale = n }
  }
  const fontCtl = $derived({
    onInc: incFont,
    onDec: decFont,
    canInc: uiScale < UI_MAX || contentScale < CONTENT_MAX,
    canDec: contentScale > uiScale || uiScale > SCALE_MIN,
    title: `Text size — UI ${Math.round(uiScale * 100)}% · Response ${Math.round(contentScale * 100)}%`,
  })
  const widthCtl = $derived({
    onInc: () => (chatWidth = clampChatWidth(chatWidth + CHAT_WIDTH_STEP)),
    onDec: () => (chatWidth = clampChatWidth(chatWidth - CHAT_WIDTH_STEP)),
    canInc: chatWidth < MAX_CHAT_WIDTH,
    canDec: chatWidth > MIN_CHAT_WIDTH,
    title: `Chat width — ${chatWidth}px`,
  })

  // ── Compose helpers ─────────────────────────────────────────────────────────
  // Clearing the DOM and discarding a draft are deliberately separate actions.
  // Navigation, fold hydration, and opening a collapsed composer are UI
  // transitions — none of them is permission to delete what the user typed.
  const clearComposerLocally = () => {
    draftRef.current = ''
    attachmentsRef.current = []
    draftChatNotes = []
    // Composer is uncontrolled. Clear and detach the live element immediately,
    // rather than waiting for Svelte to unmount it: a window blur can run in
    // that gap and otherwise copy the stale, just-sent DOM value back into the
    // draft ref/cache. Composer's own mount effect installs the next element.
    if (composerRef.current) composerRef.current.value = ''
    composerRef.current = null
    composerNonce += 1
  }
  const discardComposerDraft = () => {
    scheduleDraftStatus(false, 'explicit-composer-cancel')
    clearComposerLocally()
  }
  const currentDraftCacheIdentity = () => draftCacheIdentity(currentDraftSessionId(), activeRepoPathRef.current, activeRepo)
  const currentDraftId = () => activeDraftIdRef.current || draftIdForComposer(localStorage, currentDraftCacheIdentity())
  const snapshotAndClearComposer = (submissionId: string, text: string, attachments: ImageAttachment[]) => {
    // Sending and Draft persistence are separate. Flush the editor snapshot, then
    // submit source-neutral content; Draft cleanup happens only after acceptance.
    flushDraftForCurrentSessionBeforeDetach()
    pendingDraftRestoreRef.current = null
    const composerIdentity = currentDraftCacheIdentity()
    const composerToken = composerNonce
    const cached = loadCachedComposerDraft(localStorage, composerIdentity)
    pendingComposerSendRef.current = {
      submissionId, text, attachments: [...attachments], chatNotes: [...draftChatNotes], composerIdentity, composerToken,
      draftId: currentDraftId(), chatSessionId: currentDraftSessionId(), cacheSnapshotId: cached?.snapshotId,
    }
    clearComposerLocally()
  }
  const syncComposerRefFromDom = (acceptEmpty = true) => {
    // The composer is intentionally uncontrolled. Read the live DOM value at a
    // persistence boundary too, so an input/composition event that lands in the
    // same run-loop turn as a macOS app switch cannot leave `draftRef` behind.
    // On focus, however, an empty DOM node may be a newly recreated WebKit view;
    // never let that erase a non-empty ref before its shadow is restored.
    const live = composerRef.current?.value
    if (typeof live === 'string' && (acceptEmpty || live.length > 0) && live !== draftRef.current) draftRef.current = live
  }
  const cacheCurrentComposerSnapshot = () => {
    syncComposerRefFromDom()
    const identity = currentDraftCacheIdentity()
    return saveCachedComposerDraft(localStorage, identity, {
      text: draftRef.current,
      attachments: [...attachmentsRef.current],
      chatNotes: [...draftChatNotes],
    })
  }
  const cachedComposerDraft = (sid: string | null, repoPath = activeRepoPathRef.current, repoName = activeRepo) =>
    loadCachedComposerDraft(localStorage, draftCacheIdentity(sid, repoPath, repoName))
  const clearCachedComposerDraft = (sid: string | null, repoPath = activeRepoPathRef.current, repoName = activeRepo) =>
    discardCachedComposerDraft(localStorage, draftCacheIdentity(sid, repoPath, repoName))

  function insertEntityIntoComposer(uri: string) {
    const entityURI = uri.trim()
    if (!entityURI) return
    const live = composerRef.current as (HTMLTextAreaElement & { insertText?: (text: string) => boolean | void }) | null
    if (live?.insertText?.(entityURI) === true) {
      live.focus()
      return
    }

    // A collapsed composer has no live editor/caret. Preserve its draft and
    // append at the only unambiguous insertion point; EntityComposerInput will
    // project the canonical URI into a Chip when it mounts.
    const current = draftRef.current
    draftRef.current = `${current}${current && !/\s$/.test(current) ? ' ' : ''}${entityURI}`
    composing = true
    composerNonce += 1
    scheduleDraftStatus(true)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const restoreComposerDraft = (text: string, attachments: ImageAttachment[], chatNotes: string[] = [], cache = true) => {
    draftRef.current = text
    attachmentsRef.current = attachments
    draftChatNotes = [...chatNotes]
    // A previous session's uncontrolled textarea may still be mounted until the
    // keyed composer rerenders. Do not call cacheCurrentComposerSnapshot here:
    // it reads that live DOM node and used to replace the just-restored text with
    // its stale empty value, then autosave the empty value back to Core.
    if (composerRef.current) composerRef.current.value = text
    if (cache && (text.trim() || attachments.length)) {
      saveCachedComposerDraft(localStorage, currentDraftCacheIdentity(), {
        text,
        attachments: [...attachments],
        chatNotes: [...chatNotes],
      })
    }
    composeMode = 'new'
    branchFromId = null
    editId = null
    overlayOpen = false
    quickOpen = false
    composing = true
    scheduleDraftStatus(Boolean(text.trim() || attachments.length || chatNotes.length))
    composerNonce += 1
    requestAnimationFrame(() => composerRef.current?.focus())
  }
  const stageComposerDraftRestore = (sid: string, text: string, attachments: ImageAttachment[]) => {
    pendingDraftRestoreRef.current = { sessionId: sid, text, attachments }
    restoreComposerDraft(text, attachments)
  }
  const exitCompose = () => { composing = false; composeMode = 'new'; branchFromId = null; editId = null }
  const flashToast = (msg: string) => {
    toast = msg
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => (toast = null), 2200)
  }

  async function stopAgent(force = false) {
    const tid = activeTurnIdRef.current
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    const foldRunning = viewRef.current.status === 'running'
    const foldedTurnId = viewRef.current.turn?.turn_id || ''
    if (!tid && !force && !(hasBridge() && sid && foldRunning)) return
    if (respondTimer.current) { clearTimeout(respondTimer.current); respondTimer.current = null }
    const cancel = hasBridge() && sid ? api.session.cancel(sid).catch(() => {}) : Promise.resolve()
    if (tid) {
      finishActive([...(liveBlocksRef.current.length ? liveBlocksRef.current : parseMarkdown(liveTextRef.current)), { t: 'p', v: '⏹ Stopped' }], 'cancelled')
    } else {
      const stopId = (foldedTurnId && nodesRef.current[foldedTurnId] ? foldedTurnId : '') || (current && current.respondedAt === null ? current.id : '')
      if (stopId && nodesRef.current[stopId] && nodesRef.current[stopId].respondedAt === null) {
        const stamp = Date.now()
        const stoppedBlocks = [...(nodesRef.current[stopId].answer || []), { t: 'p', v: '⏹ Stopped' } as AnswerBlock]
        nodesRef.current = { ...nodesRef.current, [stopId]: { ...nodesRef.current[stopId], answer: stoppedBlocks, thinking: undefined, respondedAt: stamp } }
        if (nodes[stopId] && nodes[stopId].respondedAt === null) nodes = { ...nodes, [stopId]: { ...nodes[stopId], answer: stoppedBlocks, thinking: undefined, respondedAt: stamp } }
        agentTerminals = { ...agentTerminals, [stopId]: 'cancelled' }
      }
    }
    await cancel
  }

  function teardownSession() {
    if (hasBridge() && currentDraftSessionId()) {
      // A repo/session switch is a detach, not an explicit draft cancellation.
      // Persist the current snapshot before clearing the local composer.
      flushDraftForCurrentSessionBeforeDetach()
      // Detaching the UI must not cancel an in-flight agent turn. The session
      // continues in Core and can be reattached from history/recent sessions.
    }
    attachTokenRef.current++
    postPaintScheduler.cancel()
    sessionRef.current = null
    coreSessionId = null
    sessionOnGoing = false
    parentChatSession = null
    ongoingSaving = false
    chatTags = []
    tokenUsage = null
    // `knownTags` and `tagDefinitions` belong to the selected Repo, not this
    // Chat Session. Keep them warm when a session ends; the Repo-selection
    // effect replaces them immediately if navigation selects another Repo.
    tagEditing = null
    tagDialogOpen = false
    tagSaving = false
    agentTerminals = {}
    agentFailureDetails = {}
    nodeTurnIdRef.current = {}
    setActiveTurnId('')
    awaitRef.current = false
    sawRunningRef.current = false
    liveTextRef.current = ''
    liveBlocksRef.current = []
    liveCyclesRef.current = []
    durableCycleCountRef.current = 0
    prevLiveThinkingActiveRef.current = false
    prevLiveThinkingValueRef.current = ''
    prevLiveTextValueRef.current = ''
    afterToolBoundaryRef.current = false
    seenNativeToolBoundariesRef.current = new Set()
    thinkingStreamStartRef.current = null
    textStreamStartRef.current = null
    boundaryOrderRef.current = null
    prevTurnPhaseRef.current = null
    lastDisplayRef.current = ''
    draftStatusRef.current = false
    mutatedRef.current = false
    followLeafRef.current = true
    pendingLandRef.current = null
    lastSavedActiveBranchRef.current = ''
  }

  async function attachSavedSession(repo: string) {
    if (!hasBridge()) return
    const token = ++attachTokenRef.current
    beginSessionPaintGate()
    const saved = loadSessionId(repo)
    if (!saved) {
      const identity = draftCacheIdentity(null, activeRepoPathRef.current, repo)
      const cached = cachedComposerDraft(null, activeRepoPathRef.current, repo)
      let durable: { text: string; attachments: ImageAttachment[]; updatedAt: number } | null = null
      try {
        const draftId = draftIdForComposer(localStorage, identity)
        const dr = (await api.draft.get(draftId)).draft
        if (dr?.revision) draftRevisionRef.current[draftId] = dr.revision
        durable = dr && (dr.text || dr.attachments?.length || dr.chat_notes?.length)
          ? { text: dr.text || '', attachments: await draftToComposerAttachments(dr.attachments || []), chatNotes: dr.chat_notes || [], updatedAt: dr.updated_at || 0 }
          : null
      } catch {}
      const restored = newestComposerDraft(durable, cached)
      if (restored && (restored.text.trim() || restored.attachments.length || (restored.chatNotes?.length || 0))) restoreComposerDraft(restored.text, restored.attachments, restored.chatNotes || [])
      return
    }
    let sess: { ip_name?: string; title?: string; model?: string; thinking_level?: string; fast_mode?: boolean; active_branch_turn_id?: string | null; metadata?: { tags?: ChatTag[] }; onGoing?: boolean; last_usage?: SessionTokenUsage | null } | null = null
    // Session metadata and its draft are independent reads. Start hydration now
    // so opening a drafted station does not pay two RPC round trips in series.
    // Session hydration is owner-authoritative. Never fall back to a renderer
    // binding: an old/corrupt binding may point at a standalone new-chat Draft,
    // and restoring it here would place that content in this Chat Session.
    const draftRead = api.draft.getForSession(saved)
      .then((r) => ({ resolved: true, draft: r.draft }))
      .catch(() => ({ resolved: false, draft: null }))
    try { const r = await api.session.get(saved, true); sess = r?.chat_session ?? null } catch { sess = null }
    if (attachTokenRef.current !== token) return
    if (!sess) { saveSessionId(repo, null); return }
    if (sessionOpenId) bridgeDiagnostic({ stage: 'session_metadata_ready', session_id: saved, session_open_id: sessionOpenId, elapsed_ms: sessionOpenStartedRef.current == null ? undefined : performance.now() - sessionOpenStartedRef.current })
    deferUntilSessionPaint(`unread:${saved}`, () => api.session.setUnread(saved, false).then(() => undefined))
    const attachedIp = sess.ip_name || currentIp
    sessionRef.current = { id: saved, repo, ip: attachedIp }
    currentIp = attachedIp
    model = sess.model || DEFAULT_MODEL
    thinking = THINKING_LEVELS.includes(sess.thinking_level as ThinkingLevel)
      ? (sess.thinking_level as ThinkingLevel)
      : defaultThinkingForIp(attachedIp)
    fastMode = Boolean(sess.fast_mode)
    draftStatusRef.current = false
    mutatedRef.current = false
    followLeafRef.current = true
    pendingLandRef.current = sess.active_branch_turn_id ?? null
    // Seed before transcript hydration selects this Turn and wakes the reactive
    // persistence effect. Metadata already represents Core's persisted value.
    lastSavedActiveBranchRef.current = persistedActiveBranchKey(saved, sess.active_branch_turn_id)
    activeChild = {}
    sessionId = saved
    chatTitle = sess.title || `Elma · ${repo}`
    parentChatSession = sess.parent_chat_session ?? null
    sessionOnGoing = Boolean(parentChatSession?.onGoing ?? sess.onGoing)
    chatTags = (sess.metadata?.tags ?? []).map((tag) => ({ ...tag }))
    tokenUsage = sess.last_usage ?? null
    // Repository tag metadata is small and drives cross-session VIP visibility.
    // Do not hold it behind transcript paint: a newly opened session must load
    // the catalog even when no later invalidation arrives.
    void refreshKnownTags(activeRepoPath)
    coreSessionId = saved
    // A normal app/window reopen attaches the remembered session without a
    // Willo restore flag. Hydrate its durable draft here as well, otherwise a
    // successfully saved draft appears to have vanished until opened via Willo.
    const draftResult = await draftRead
    if (attachTokenRef.current !== token) return
    const dr = draftResult.draft
    const attachedIdentity = draftCacheIdentity(saved, activeRepoPathRef.current, repo)
    // A successful owner lookup with no Draft invalidates any renderer-only
    // binding for this session. Generate the session's own deterministic ID on
    // its next save instead of retrying a stale standalone Draft ID forever.
    if (draftResult.resolved && !dr) forgetComposerDraftBinding(localStorage, attachedIdentity)
    const attachedDraftId = dr?.draft_id || draftIdForComposer(localStorage, attachedIdentity)
    if (dr?.draft_id) bindDraftToComposer(localStorage, attachedIdentity, dr.draft_id)
    if (dr?.revision) draftRevisionRef.current[attachedDraftId] = dr.revision
    const durable = dr && (dr.text || (dr.attachments && dr.attachments.length) || (dr.chat_notes && dr.chat_notes.length))
      ? { text: dr.text || '', attachments: await draftToComposerAttachments(dr.attachments || []), chatNotes: dr.chat_notes || [], updatedAt: dr.updated_at || 0 }
      : null
    if (attachTokenRef.current !== token) return
    const cached = cachedComposerDraft(saved)
    const restored = newestComposerDraft(durable, cached)
    if (restored && (restored.text.trim() || restored.attachments.length || (restored.chatNotes?.length || 0))) {
      stageComposerDraftRestore(saved, restored.text, restored.attachments)
      draftStatusRef.current = true
    }
  }

  function prepareExternalSessionAttach(id: string, target: ElmaSearchTarget | null = null, restoreDraft = false) {
    flushDraftForCurrentSessionBeforeDetach()
    activeDraftIdRef.current = null
    attachingSessionIdRef.current = id
    sessionRef.current = null
    coreSessionId = null
    nodes = {}
    rootId = null
    activeChild = {}
    viewIndex = 0
    overlayOpen = false
    quickOpen = false
    pendingRemoveId = null
    pendingStopSend = null
    titleEditing = false
    sessionOnGoing = false
    parentChatSession = null
    ongoingSaving = false
    agentTerminals = {}
    agentFailureDetails = {}
    nodeTurnIdRef.current = {}
    setActiveTurnId('')
    awaitRef.current = false
    sawRunningRef.current = false
    liveTextRef.current = ''
    liveBlocksRef.current = []
    liveCyclesRef.current = []
    durableCycleCountRef.current = 0
    prevLiveThinkingActiveRef.current = false
    prevLiveThinkingValueRef.current = ''
    prevLiveTextValueRef.current = ''
    prevTurnPhaseRef.current = null
    afterToolBoundaryRef.current = false
    seenNativeToolBoundariesRef.current = new Set()
    thinkingStreamStartRef.current = null
    textStreamStartRef.current = null
    boundaryOrderRef.current = null
    lastDisplayRef.current = ''
    draftStatusRef.current = false
    mutatedRef.current = false
    followLeafRef.current = true
    pendingLandRef.current = target?.turnId ?? null
    searchTarget = target
    // The previous composer was already snapshotted above. Detach and clear its
    // live DOM synchronously before awaiting target-session metadata: a native
    // focus/visibility callback in that gap must not read the outgoing text back
    // into shared refs and later save it as the target session's own Draft.
    // This is UI-only cleanup; unlike `discardComposerDraft`, it schedules no
    // empty write and therefore cannot delete the target's durable Draft.
    exitCompose()
    pendingDraftStateRef.current = null
    clearComposerLocally()
  }

  async function openDraftById(draftId: string): Promise<boolean> {
    if (!hasBridge() || !draftId) return false
    const token = ++openDraftTokenRef.current
    try {
      const draft = (await api.draft.get(draftId)).draft
      if (draft?.revision) draftRevisionRef.current[draftId] = draft.revision
      if (draft.chat_session_id) {
        // A reply Draft is not a portable content card. Always reopen its owner
        // Chat Session so it cannot be rebound to an empty or unrelated composer.
        if (openDraftTokenRef.current !== token) return false
        return attachSessionById(draft.chat_session_id, null, true)
      }
      const attachments = await draftToComposerAttachments(draft.attachments || [])
      if (openDraftTokenRef.current !== token) return false
      // A standalone/new-chat Draft card opens a neutral composer. It must not
      // silently become a reply to whichever Chat Session happened to be active.
      flushDraftForCurrentSessionBeforeDetach()
      sessionRef.current = null
      coreSessionId = null
      sessionOnGoing = false
      parentChatSession = null
      nodes = {}
      rootId = null
      activeChild = {}
      viewIndex = 0
      sessionId = mkSessionId(activeRepo)
      chatTitle = ''
      publishElmaActiveChatSessionId(null)
      exitCompose()
      clearComposerLocally()
      // A Draft remains content-only. The binding merely tells this neutral Elma
      // composer which opaque Draft to keep saving; no destination is persisted.
      const identity = currentDraftCacheIdentity()
      activeDraftIdRef.current = draftId
      bindDraftToComposer(localStorage, identity, draftId)
      restoreComposerDraft(draft.text || '', attachments, draft.chat_notes || [])
      draftStatusRef.current = true
      return true
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not restore Draft')
      return false
    }
  }

  async function attachSessionById(id: string, target: ElmaSearchTarget | null = null, restoreDraft = false): Promise<boolean> {
    if (!hasBridge() || !id) return false
    const token = ++attachTokenRef.current
    beginSessionPaintGate()
    prepareExternalSessionAttach(id, target, restoreDraft)
    let sess: { ip_name?: string; title?: string; model?: string; thinking_level?: string; fast_mode?: boolean; active_branch_turn_id?: string | null; metadata?: { tags?: ChatTag[] }; workspace_dirs?: string[]; worktree_path?: string | null; onGoing?: boolean; hasDraft?: boolean; draftText?: string; draftAttachments?: ImageAttachment[]; draftAttachmentsJson?: string; last_usage?: SessionTokenUsage | null } | null = null
    // Start the draft read beside the lightweight session read. Willo already
    // knows this card is drafted; serial reads made composer restore visibly lag
    // behind the Elma handoff on higher-latency Core connections.
    // Core's session lookup is the ownership boundary. Renderer bindings are
    // recovery hints for the same composer, never authority for moving Draft
    // content from a standalone/new-chat composer into this session.
    const draftRead = api.draft.getForSession(id)
      .then((r) => ({ resolved: true, draft: r.draft }))
      .catch(() => ({ resolved: false, draft: null }))
    // Core can be briefly held or disconnected while a deployment activates.
    // Keep the durable native handoff unacknowledged and retry the lightweight
    // metadata read instead of turning a valid card click into a lost open.
    for (let attempt = 0; attempt < 45 && attachTokenRef.current === token; attempt += 1) {
      const requestId = crypto.randomUUID()
      const metadataStarted = performance.now()
      if (sessionOpenId) bridgeDiagnostic({
        stage: 'session_metadata_requested', session_id: id, session_open_id: sessionOpenId,
        request_id: requestId, attempt: attempt + 1,
      })
      try {
        const r = await api.session.get(id, true, { sessionOpenId, requestId })
        sess = r?.chat_session ?? null
        if (sess) break
        if (sessionOpenId) bridgeDiagnostic({
          stage: 'session_metadata_empty', session_id: id, session_open_id: sessionOpenId,
          request_id: requestId, attempt: attempt + 1, duration_ms: performance.now() - metadataStarted,
        })
      } catch (error) {
        sess = null
        if (sessionOpenId) bridgeDiagnostic({
          stage: 'session_metadata_failed', session_id: id, session_open_id: sessionOpenId,
          request_id: requestId, attempt: attempt + 1, duration_ms: performance.now() - metadataStarted,
          detail: (error instanceof Error ? error.message : String(error)).slice(0, 2048),
        })
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 250 * (attempt + 1))))
    }
    if (attachTokenRef.current !== token) return false
    if (!sess) {
      if (attachingSessionIdRef.current === id) attachingSessionIdRef.current = null
      return false
    }
    if (sessionOpenId) bridgeDiagnostic({ stage: 'session_metadata_ready', session_id: id, session_open_id: sessionOpenId, elapsed_ms: sessionOpenStartedRef.current == null ? undefined : performance.now() - sessionOpenStartedRef.current })
    deferUntilSessionPaint(`unread:${id}`, () => api.session.setUnread(id, false).then(() => undefined))
    const repoPath = sess.workspace_dirs?.[0] || ''
    const owningRepo = repoForWorkspacePath(repos, repoPath)
    const repoName = owningRepo?.name
      || repoPath.split('/').filter(Boolean).pop()
      || (sess.title || 'Session').replace(/^Elma ·\s*/, '') || 'Session'
    activeRepo = repoName
    activeRepoPath = repoPath
    worktreePath = sess.worktree_path || null
    if (repoPath) recents = withRecent(recents, { name: repoName, path: repoPath })
    saveSessionId(repoName, id)
    const attachedIp = sess.ip_name || currentIpRef.current
    currentIp = attachedIp
    model = sess.model || DEFAULT_MODEL
    thinking = THINKING_LEVELS.includes(sess.thinking_level as ThinkingLevel)
      ? (sess.thinking_level as ThinkingLevel)
      : defaultThinkingForIp(attachedIp)
    fastMode = Boolean(sess.fast_mode)
    ipExplicit = false
    ipExplicitForNewChat = false
    sessionId = id
    chatTitle = sess.title || `Elma · ${repoName}`
    parentChatSession = sess.parent_chat_session ?? null
    sessionOnGoing = Boolean(parentChatSession?.onGoing ?? sess.onGoing)
    chatTags = (sess.metadata?.tags ?? []).map((tag) => ({ ...tag }))
    tokenUsage = sess.last_usage ?? null
    // Load the repository catalog immediately. Surface invalidations are hints,
    // not replayable state, so relying on a future event can leave this session
    // without VIP definitions indefinitely.
    void refreshKnownTags(repoPath)
    sessionRef.current = { id, repo: repoName, ip: attachedIp }
    nodeTurnIdRef.current = {}
    draftStatusRef.current = false
    mutatedRef.current = false
    followLeafRef.current = true
    pendingLandRef.current = target?.turnId ?? sess.active_branch_turn_id ?? null
    // Deduplicate only Core's persisted value. A different explicit target is a
    // real user navigation and remains eligible for persistence after hydration.
    lastSavedActiveBranchRef.current = persistedActiveBranchKey(id, sess.active_branch_turn_id)
    searchTarget = target
    attachingSessionIdRef.current = null
    // Publish the Chat Session before awaiting any optional composer work.
    // `coreSessionId` starts the bounded transcript projection; keeping it
    // behind Draft/blob hydration let unrelated renderer/native-bridge traffic
    // postpone the first transcript request for more than a minute even though
    // session metadata had already arrived.
    coreSessionId = id
    // Elma owns the composer-to-Draft binding. Hydrate the Draft bound to
    // this composer on every attach (history, Willo, cold launch, or normal reopen),
    // rather than requiring a special `restore_draft` handoff flag.
    const draftResult = await draftRead
    if (attachTokenRef.current !== token) return false
    const dr = draftResult.draft
    const attachedIdentity = draftCacheIdentity(id, activeRepoPathRef.current, activeRepo)
    if (draftResult.resolved && !dr) forgetComposerDraftBinding(localStorage, attachedIdentity)
    const attachedDraftId = dr?.draft_id || draftIdForComposer(localStorage, attachedIdentity)
    if (dr?.draft_id) bindDraftToComposer(localStorage, attachedIdentity, dr.draft_id)
    if (dr?.revision) draftRevisionRef.current[attachedDraftId] = dr.revision
    const durable = dr && (dr.text || (dr.attachments && dr.attachments.length) || (dr.chat_notes && dr.chat_notes.length))
      ? { text: dr.text || '', attachments: await draftToComposerAttachments(dr.attachments || []), chatNotes: dr.chat_notes || [], updatedAt: dr.updated_at || 0 }
      : null
    if (attachTokenRef.current !== token) return false
    const cached = cachedComposerDraft(id, repoPath, repoName)
    const restored = newestComposerDraft(durable, cached)
    if (restored && (restored.text.trim() || restored.attachments.length || (restored.chatNotes?.length || 0))) {
      stageComposerDraftRestore(id, restored.text, restored.attachments)
      draftStatusRef.current = true
    }
    deferUntilSessionPaint(`worktrees:${id}`, () => refreshWorktrees(repoPath, id))
    return true
  }

  function persistThinkingForCurrentSession(level: ThinkingLevel) {
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (!hasBridge() || !sid) return
    // Keep rapid ⌃Tab cycles ordered so an earlier RPC cannot arrive last and
    // overwrite the final effort selected for this session.
    thinkingSaveChainRef.current = thinkingSaveChainRef.current
      .catch(() => {})
      .then(() => api.session.setThinkingLevel(sid, level))
      .then(() => undefined)
  }

  const selectIp = (name: string) => {
    currentIp = name
    thinking = defaultThinkingForIp(name)
    const selected = ips.find((ip) => ip.name === name)
    if ((selected?.provider || '').toLowerCase() === 'codex') {
      if (!sessionRef.current?.id && !coreSessionIdRef.current && activeRepoPathRef.current) {
        void restoreRepoFastMode(activeRepoPathRef.current)
      }
    } else {
      fastMode = false
    }
    ipExplicit = true
    ipExplicitForNewChat = !sessionRef.current?.id && !coreSessionIdRef.current
    persistThinkingForCurrentSession(thinking)
  }

  async function restoreRepoFastMode(repoPath: string) {
    if (!hasBridge() || !repoPath) { fastMode = false; return }
    try {
      const preference = await api.session.getRepoFastMode(repoPath)
      // Re-check the provider after the await: the user may have switched to a
      // non-Codex subscription while the preference was in flight.
      if (activeRepoPathRef.current === repoPath && !sessionRef.current?.id && !coreSessionIdRef.current) {
        fastMode = fastModeAvailable && Boolean(preference.fast_mode)
      }
    } catch {
      if (activeRepoPathRef.current === repoPath && !sessionRef.current?.id && !coreSessionIdRef.current) fastMode = false
    }
  }

  function openRepo(name: string, path_: string) {
    // Capture a pre-session composer under the repository it belongs to before
    // changing activeRepoPath. (Session-backed drafts use the session identity.)
    flushDraftForCurrentSessionBeforeDetach()
    activeDraftIdRef.current = null
    activeRepo = name
    activeRepoPath = path_
    fastMode = false
    void restoreRepoFastMode(path_)
    worktreeSupported = false
    worktreePath = null
    worktrees = []
    recents = withRecent(recents, { name, path: path_ })
    const nextIp = repoDefaultIp(policy, path_, ips, loggedInSubs)
    currentIp = nextIp
    thinking = defaultThinkingForIp(nextIp)
    ipExplicit = false
    ipExplicitForNewChat = false
    model = DEFAULT_MODEL
    nodes = {}
    rootId = null
    activeChild = {}
    viewIndex = 0
    overlayOpen = false
    quickOpen = false
    pendingRemoveId = null
    pendingStopSend = null
    sessionId = mkSessionId(name)
    chatTitle = ''
    sessionOnGoing = false
    parentChatSession = null
    ongoingSaving = false
    titleEditing = false
    if (respondTimer.current) clearTimeout(respondTimer.current)
    teardownSession()
    void refreshWorktrees(path_, null)
    exitCompose()
    // The old repository draft was persisted above. Clear only this view; do
    // not emit a discard for either the old or newly selected repository.
    clearComposerLocally()
  }

  async function changeCurrentSessionRepo(name: string, path_: string) {
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (!hasBridge() || !sid) { openRepo(name, path_); return }
    if (responding || viewRef.current.status === 'running') {
      flashToast('Wait for the current turn to finish before changing Repo')
      return
    }
    // This is an in-place workspace mutation: the Chat Session and Composer
    // stay attached. Do not run the detach persistence boundary here; doing so
    // can race an in-flight input event and make the visible draft disappear.
    // Session-scoped autosave remains valid across the repository change.
    try {
      await api.session.setWorkspaces(sid, [path_])
      const previousRepo = activeRepo
      activeRepo = name
      activeRepoPath = path_
      sessionRef.current = { ...(sessionRef.current || { id: sid, ip: currentIp }), repo: name }
      saveSessionId(previousRepo, null)
      saveSessionId(name, sid)
      recents = withRecent(recents, { name, path: path_ })
      worktreeSupported = false
      worktreePath = null
      worktrees = []
      await refreshWorktrees(path_, sid)
      flashToast(`Repo changed to ${name}`)
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not change Repo')
    }
  }

  function clickRepo(name: string, path_: string) {
    const hasCurrentSession = Boolean(sessionRef.current?.id || coreSessionIdRef.current)
    if (repoNavigationAction('mouse', hasCurrentSession).kind === 'change-current-session') {
      void changeCurrentSessionRepo(name, path_)
    } else {
      openRepo(name, path_)
    }
  }

  async function openOther(source: 'mouse' | 'hotkey' = 'mouse') {
    const picked = await chooseFolder(activeRepoPath || undefined)
    if (!picked) return
    const hasCurrentSession = Boolean(sessionRef.current?.id || coreSessionIdRef.current)
    if (repoNavigationAction(source, hasCurrentSession).kind === 'change-current-session') {
      await changeCurrentSessionRepo(picked.name, picked.path)
    } else {
      openRepo(picked.name, picked.path)
    }
  }

  function runCmdNumberHotkey(key: string) {
    if (!/^[0-9]$/.test(key)) return
    // Cmd+number starts a fresh Chat Session. The Chat view stays mounted behind
    // Change Walkthrough, so make it visible before resetting the chat state.
    if (key === '0') {
      elmaPage = 'chat'
      void openOther('hotkey')
      return
    }
    const slot = repoSlots[parseInt(key, 10) - 1]
    if (!slot?.path) return
    elmaPage = 'chat'
    openRepo(slot.name, slot.path)
  }

  // Initial app.open handoff for Cmd+number launch (once repoSlots ready).
  $effect(() => {
    const key = requestedCmdNumberRef.current
    if (!key) return
    if (key !== '0') { const slot = repoSlots[parseInt(key, 10) - 1]; if (!slot?.path) return }
    requestedCmdNumberRef.current = null
    runCmdNumberHotkey(key)
  })

  // Runtime handoff when Elma is already open.
  onMount(() => {
    const handleOpenPayload = (detail: ElmaOpenPayload | undefined | null) => {
      if (!detail) return
      if (detail.stop_current_agent) {
        void stopAgent(true)
        return
      }
      if (detail.archive_current_session) {
        requestArchiveSession()
        return
      }
      if (detail.page === 'chat' || detail.page === 'change-walkthrough') {
        if (detail.page === 'chat') elmaPage = 'chat'
        else openChangeWalkthrough()
        if (hasBridge()) void callNative('app.consumeOpen', { page: detail.page }).catch(() => {})
        return
      }
      if (detail.draft_id && hasBridge()) {
        void callNative('app.consumeOpen', { draft_id: detail.draft_id }).catch(() => {})
        void openDraftById(detail.draft_id)
        return
      }
      if (detail.insert_entity_uri) {
        if (hasBridge()) {
          void callNative('app.consumeOpen', { insert_entity_uri: detail.insert_entity_uri }).catch(() => {})
        }
        insertEntityIntoComposer(detail.insert_entity_uri)
        return
      }
      if (detail.session_id) {
        const sid = detail.session_id
        const openId = detail.session_open_id || crypto.randomUUID()
        const openIdentity = { session_id: sid, session_open_id: detail.session_open_id }
        if (!openHandoffGuard.accept(openIdentity)) {
          if (detail.session_open_id && openHandoffGuard.isHandled(openIdentity)) acknowledgeSessionOpen(sid, detail.session_open_id)
          return
        }
        sessionOpenId = openId
        sessionOpenStartedRef.current = performance.now()
        paintedSessionOpenRef.current = ''
        bridgeDiagnostic({ stage: 'handoff_received', session_id: sid, session_open_id: openId, elapsed_ms: 0 })
        const target = searchTargetFromOpenPayload(detail)
        if (sid !== (sessionRef.current?.id || coreSessionIdRef.current || '')) {
          void attachSessionById(sid, target, restoreDraftRequested(detail.restore_draft)).then((ok) => {
            if (ok) {
              openHandoffGuard.markHandled(openIdentity)
              acknowledgeSessionOpen(sid, openId)
            } else openHandoffGuard.forget(openIdentity)
          }).catch(() => openHandoffGuard.forget(openIdentity))
        } else if (target) {
          searchTarget = target
          openHandoffGuard.markHandled(openIdentity)
          acknowledgeSessionOpen(sid, openId)
        } else if (restoreDraftRequested(detail.restore_draft)) {
          openHandoffGuard.markHandled(openIdentity)
          acknowledgeSessionOpen(sid, openId)
          const identity = draftCacheIdentity(sid, activeRepoPathRef.current, activeRepo)
          void api.draft.getForSession(sid).then((r) => r.draft).then(async (dr) => {
            const restoredDraftId = dr?.draft_id || draftIdForComposer(localStorage, identity)
            if (dr?.draft_id) bindDraftToComposer(localStorage, identity, dr.draft_id)
            if (dr?.revision) draftRevisionRef.current[restoredDraftId] = dr.revision
            const durable = dr && (dr.text || (dr.attachments && dr.attachments.length) || (dr.chat_notes && dr.chat_notes.length))
              ? { text: dr.text || '', attachments: await draftToComposerAttachments(dr.attachments || []), chatNotes: dr.chat_notes || [], updatedAt: dr.updated_at || 0 }
              : null
            const restored = newestComposerDraft(durable, cachedComposerDraft(sid))
            if (restored && (restored.text.trim() || restored.attachments.length || (restored.chatNotes?.length || 0))) {
              stageComposerDraftRestore(sid, restored.text, restored.attachments)
              draftStatusRef.current = true
            }
          }).catch(() => {})
        } else {
          openHandoffGuard.markHandled(openIdentity)
          acknowledgeSessionOpen(sid, openId)
        }
        return
      }
      if (detail.cmd_number) runCmdNumberHotkey(detail.cmd_number)
    }
    // A throw in the handoff handler runs AFTER app.consumeOpen has already
    // acknowledged the click to native, so it silently eats the open (seen as
    // "session won't open" with the only evidence in chat-render.log). Report
    // and swallow instead of letting it escape the event dispatch.
    const safeHandleOpenPayload = (detail: ElmaOpenPayload | undefined | null) => {
      try {
        handleOpenPayload(detail)
      } catch (error) {
        openHandoffGuard.forget(detail || {})
        reportRendererError('open_handoff', error, { app: 'elma' })
      }
    }
    const consumeStickyPendingOpen = () => {
      const pending = (window as Window & { __arbolPendingOpen?: ElmaOpenPayload }).__arbolPendingOpen
      if (!pending) return
      delete (window as Window & { __arbolPendingOpen?: ElmaOpenPayload }).__arbolPendingOpen
      safeHandleOpenPayload(pending)
    }
    const attachActiveSessionId = (sid: unknown) => {
      if (typeof sid !== 'string' || !sid) return
      if (sid === (sessionRef.current?.id || coreSessionIdRef.current || '')) return
      void attachSessionById(sid)
    }
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ElmaOpenPayload>).detail
      delete (window as Window & { __arbolPendingOpen?: ElmaOpenPayload }).__arbolPendingOpen
      safeHandleOpenPayload(detail)
    }
    const onStorage = (e: StorageEvent) => { if (e.key === ELMA_ACTIVE_CHAT_SESSION_KEY) attachActiveSessionId(e.newValue) }
    const onFocusOrVisible = () => consumeStickyPendingOpen()
    window.addEventListener('arbol-open', onOpen as EventListener)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    let channel: BroadcastChannel | null = null
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(ELMA_ACTIVE_CHAT_SESSION_CHANNEL)
      channel.addEventListener('message', (event) => attachActiveSessionId(event.data?.sessionId))
    }
    consumeStickyPendingOpen()
    return () => {
      window.removeEventListener('arbol-open', onOpen as EventListener)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
      channel?.close()
    }
  })

  const failTurn = (msg: string) => {
    finishActive([...(liveBlocksRef.current.length ? liveBlocksRef.current : parseMarkdown(liveTextRef.current)), { t: 'p', v: `⚠︎ ${msg}` }], 'failed', msg)
  }

  const defaultNewChatTitle = () => `Elma · ${activeRepo}`

  async function refreshWorktrees(
    repoPath = activeRepoPath,
    sessionId: string | null = coreSessionIdRef.current,
    { silent = false }: { silent?: boolean } = {},
  ) {
    if (!hasBridge() || (!repoPath && !sessionId)) return
    if (!silent) worktreeBusy = true
    try {
      const result = await api.session.worktrees(sessionId
        ? { id: sessionId }
        : { repoPath })
      // The selection belongs to the chat session, not to the picker. Ignore a
      // delayed response after the user has moved to a different chat/repo.
      if (sessionId
        ? coreSessionIdRef.current !== sessionId
        : activeRepoPathRef.current !== repoPath || coreSessionIdRef.current) return
      const previousPath = worktreePath
      worktreeSupported = result.supported
      worktrees = result.worktrees
      worktreePath = result.selected_path
      // The native tray is hosted by any Arbol UI process, so publish the
      // status-bar choice through its shared app-support state. Native validates
      // that this belongs to the Arbol container; another repo resets to main.
      void callNative('app.setActiveWorktree', { path: worktreePath }).catch(() => {})
      if (previousPath !== worktreePath) void refreshWorktreeStats(worktreePath)
    } catch (error) {
      // Background reconciliation must not turn a transient Core failure into a
      // user-facing toast every few seconds.
      if (!silent) flashToast(error instanceof Error ? error.message : String(error))
    } finally {
      if (!silent) worktreeBusy = false
    }
  }

  // An agent can change the selected worktree while its turn is running
  // (for example after creating or attaching a worktree). The status bar is a
  // view of Chat Session state, so reconcile it from Core rather than retaining
  // the picker selection captured when the chat was opened.
  $effect(() => {
    const sessionId = coreSessionId
    const running = agentRunning
    if (!hasBridge() || !sessionId) return
    if (paintedSessionId !== sessionId) {
      deferUntilSessionPaint(`worktrees:${sessionId}`, () => refreshWorktrees(activeRepoPathRef.current, sessionId, { silent: true }))
      return
    }
    let disposed = false
    const reconcile = () => {
      if (!disposed) void refreshWorktrees(activeRepoPathRef.current, sessionId, { silent: true })
    }
    reconcile()
    if (!running) return () => { disposed = true }
    const timer = window.setInterval(reconcile, 1_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  })

  async function embedOverlayChunks() {
    const path = worktreePath
    if (!path || overlayEmbedRunning) return
    try {
      const result = await api.knowledge.embedOverlay(path)
      if (result.started) {
        overlayEmbedRunning = true
      } else {
        flashToast('An embedding pass is already running — try again when it finishes')
      }
      void refreshWorktreeStats(path)
    } catch (error) {
      flashToast(error instanceof Error ? error.message : String(error))
    }
  }

  // NOTE: Elma has no eager Chat Session creation path. A Chat Session is
  // materialized by `turn.submit` (`chatSessionCreation`) when the first
  // message exists, so an abandoned composer never leaves a durable, empty
  // Chat Session behind. Side-actions on an empty composer (rename, ongoing)
  // guard on an existing session instead of creating one.

  const currentDraftSessionId = () => sessionRef.current?.id || coreSessionIdRef.current || null

  function enqueueDraftWrite(write: () => Promise<void>): Promise<void> {
    const queued = draftSaveChainRef.current.catch(() => {}).then(write)
    // Keep the chain usable after a transient RPC failure while still returning
    // the real promise to callers that want to observe the failure.
    draftSaveChainRef.current = queued.catch(() => {})
    return queued
  }

  const newDraftSyncId = (seq: number) => `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  async function syncDraftStatus(hasDraft: boolean, seq: number, targetSid: string | null, draftId: string, textSnapshot: string, attachmentsSnapshot: ImageAttachment[], chatNotesSnapshot: string[], changeReason: string) {
    if (!hasBridge() || draftSyncSeqRef.current !== seq) {
      return
    }
    const syncId = newDraftSyncId(seq)
    if (hasDraft) {
      const atts = await composerToDraftAttachments(attachmentsSnapshot)
      if (draftSyncSeqRef.current !== seq) {
        return
      }
      const saved = await api.draft.upsert({ draftId, chatSessionId: targetSid, text: textSnapshot, attachments: atts, chatNotes: chatNotesSnapshot, syncId, saveReason: 'debounce' })
      if (saved.draft?.revision) draftRevisionRef.current[draftId] = saved.draft.revision
    } else {
      await api.draft.discard(draftId, { chatSessionId: targetSid, syncId, discardReason: changeReason })
    }
    if (draftSyncSeqRef.current === seq && targetSid === currentDraftSessionId()) {
      draftStatusRef.current = hasDraft
      pendingDraftStateRef.current = null
    }
  }

  function handleComposerDraftChange(change: { text: string; attachments: ImageAttachment[]; hasDraft: boolean; source: HTMLTextAreaElement | null; composerToken: number }): boolean {
    // Keyed composers can leave a queued input/composition callback behind when
    // session hydration or a UI switch replaces their textarea. That callback
    // belongs to the detached UI, even if it fires after the new session is
    // active. Reject it before it mutates the shared refs or schedules a Core
    // discard for the restored draft.
    if (change.composerToken !== composerNonce || (change.source && change.source !== composerRef.current)) {
      return false
    }
    draftRef.current = change.text
    attachmentsRef.current = [...change.attachments]
    const hasDraft = change.hasDraft || draftChatNotes.length > 0
    scheduleDraftStatus(hasDraft, hasDraft ? 'composer-input' : 'composer-cleared')
    return true
  }

  function scheduleDraftStatus(hasDraft: boolean, changeReason = 'unspecified') {
    const identity = currentDraftCacheIdentity()
    if (hasDraft) cacheCurrentComposerSnapshot()
    else discardCachedComposerDraft(localStorage, identity)
    if (!hasBridge()) return
    const targetSid = currentDraftSessionId()
    const draftId = currentDraftId()
    const textSnapshot = draftRef.current
    const attachmentsSnapshot = [...attachmentsRef.current]
    const chatNotesSnapshot = [...draftChatNotes]
    if (draftTimer.current) clearTimeout(draftTimer.current)
    pendingDraftStateRef.current = hasDraft
    const seq = ++draftSyncSeqRef.current
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null
      void enqueueDraftWrite(() => syncDraftStatus(hasDraft, seq, targetSid, draftId, textSnapshot, attachmentsSnapshot, chatNotesSnapshot, changeReason)).catch(() => {})
    }, hasDraft ? 350 : 0)
  }

  function flushDraftForCurrentSessionBeforeDetach() {
    syncComposerRefFromDom()
    const hasLocalDraft = Boolean(draftRef.current.trim() || attachmentsRef.current.length || draftChatNotes.length)
    if (hasLocalDraft) cacheCurrentComposerSnapshot()
    if (!hasBridge()) return
    // Cancel the debounce before checking for a session. A brand-new composer
    // has no session yet; returning early used to cancel its only pending save
    // during an unmount and lose the draft.
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
    ++draftSyncSeqRef.current
    const sidSnapshot = currentDraftSessionId()
    const draftIdSnapshot = currentDraftId()
    const textSnapshot = draftRef.current
    const attachmentsSnapshot = [...attachmentsRef.current]
    const chatNotesSnapshot = [...draftChatNotes]
    const hasDraft = Boolean(textSnapshot.trim() || attachmentsSnapshot.length || chatNotesSnapshot.length)
    const pendingState = pendingDraftStateRef.current
    // An empty composer is not evidence that a durable draft should be deleted:
    // it may simply still be hydrating. Only discard when an input/reset event
    // explicitly scheduled the empty state.
    if (!hasDraft && pendingState !== false) return
    if (!sidSnapshot && !hasDraft) return
    const flushSeq = draftSyncSeqRef.current
    const syncId = newDraftSyncId(flushSeq)
    void enqueueDraftWrite(async () => {
      const draftId = draftIdSnapshot
      if (hasDraft) {
        const atts = await composerToDraftAttachments(attachmentsSnapshot)
        const saved = await api.draft.upsert({ draftId, chatSessionId: sidSnapshot, text: textSnapshot, attachments: atts, chatNotes: chatNotesSnapshot, syncId, saveReason: 'persistence-boundary' })
        if (saved.draft?.revision) draftRevisionRef.current[draftId] = saved.draft.revision
      } else {
        await api.draft.discard(draftId, { chatSessionId: sidSnapshot, syncId, discardReason: 'persistence-boundary-clear' })
      }
      if (draftSyncSeqRef.current === flushSeq) pendingDraftStateRef.current = null
    }).catch(() => {
      // Fire-and-forget flush; a failure surfaces on the next explicit sync.
    })
    draftStatusRef.current = hasDraft
  }

  async function finishSuccessfulComposerSend(submissionId: string | undefined, sentSid: string) {
    const pending = pendingComposerSendRef.current
    if (!submissionId || pending?.submissionId !== submissionId) return
    // A new-chat submission can be accepted after the user has opened another
    // Chat Session. The process-wide refs now describe that destination, not
    // the composer which was submitted. Cleanup the submitted Draft below, but
    // never cancel the destination's debounce, clear its uncontrolled DOM, or
    // invalidate its queued writes.
    // `clearComposerLocally` advances the token once. Any later remount/input
    // transition means this identity has acquired a fresh composer and must not
    // be cleared by the earlier send's completion.
    const ownsCurrentComposer = pending.composerIdentity === currentDraftCacheIdentity()
      && composerNonce === pending.composerToken + 1
    if (ownsCurrentComposer) {
      if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null }
      ++draftSyncSeqRef.current
      pendingDraftStateRef.current = null
      pendingDraftRestoreRef.current = null
      draftStatusRef.current = false
      clearComposerLocally()
    }
    // Another Elma window can edit the same composer while this send is in
    // flight. Remove only the exact synchronous shadow that was submitted.
    if (pending.cacheSnapshotId) {
      discardCachedComposerDraftIfUnchanged(
        localStorage, pending.composerIdentity, pending.cacheSnapshotId,
      )
    }
    let safeToForgetBinding = false
    try {
      await enqueueDraftWrite(async () => {
        const expectedRevision = draftRevisionRef.current[pending.draftId]
        if (!expectedRevision) return
        const result = await api.draft.discard(pending.draftId, {
          chatSessionId: pending.chatSessionId,
          syncId: newDraftSyncId(draftSyncSeqRef.current),
          discardReason: 'accepted-send',
          expectedRevision,
        })
        if (result.discarded) {
          safeToForgetBinding = true
          delete draftRevisionRef.current[pending.draftId]
          return
        }
        // `false` can also mean an idempotent retry after an earlier delete.
        // Preserve the binding only when a newer durable Draft really exists.
        try { await api.draft.get(pending.draftId) }
        catch { safeToForgetBinding = true }
      })
    } catch {
      // Keep the binding and local shadow. A later edit can retry persistence;
      // deleting without the observed revision would risk another window's text.
    } finally {
      if (safeToForgetBinding) {
        forgetComposerDraftBinding(localStorage, pending.composerIdentity, pending.draftId)
        if (activeDraftIdRef.current === pending.draftId) activeDraftIdRef.current = null
      }
      if (pendingComposerSendRef.current?.submissionId === submissionId) pendingComposerSendRef.current = null
    }
  }

  function finishFailedComposerSend(submissionId: string | undefined) {
    const pending = pendingComposerSendRef.current
    if (!submissionId || pending?.submissionId !== submissionId) return
    // Core did not accept this send. Put the snapshot back immediately only if
    // this window is still displaying the submitted composer. A later session
    // handoff owns the shared refs/DOM and must not receive the failed send's text.
    pendingComposerSendRef.current = null
    if (pending.composerIdentity === currentDraftCacheIdentity()
      && composerNonce === pending.composerToken + 1) {
      restoreComposerDraft(pending.text, pending.attachments, pending.chatNotes)
    }
  }

  async function runRealTurn(text: string, opts: { parentTurnId?: string; editTurnId?: string; submissionId?: string; attachments?: Turn['attachments']; title?: string; chatNotes?: string[] } = {}) {
    const localId = activeTurnIdRef.current
    try {
      if (!hasBridge()) return
      const existingSid = sessionRef.current?.id || coreSessionIdRef.current
      if (opts.editTurnId) {
        if (!existingSid) throw new Error('Cannot edit before a Chat Session exists')
        const reply = await api.session.editTurn(existingSid, opts.editTurnId, text, opts.submissionId || newSubmissionId(), model, opts.attachments, activeRepoPath || undefined, activeRepoPath ? [activeRepoPath] : undefined)
        if (reply?.replacement_turn_id && localId) {
          const adopted = adoptEditReplacement({
            selectedTurnId: opts.editTurnId,
            composerParentTurnId: opts.editTurnId,
            persistedBranchKey: lastSavedActiveBranchRef.current || null,
            pendingNavigationTurnId: pendingLandRef.current,
            cachedSubmissionParentTurnId: opts.editTurnId,
          }, reply)
          nodeTurnIdRef.current[localId] = reply.replacement_turn_id
          activeTurnId = localId
          activeTurnIdRef.current = localId
          pendingLandRef.current = adopted.pendingNavigationTurnId
          lastSavedActiveBranchRef.current = adopted.persistedBranchKey || ''
          nodeTurnIdRevision += 1
        }
        await finishSuccessfulComposerSend(opts.submissionId, existingSid)
        return
      }
      const repoPath = activeRepoPath || repoByName.get(activeRepo)?.path || ''
      const workspaceDirs = repoPath ? [repoPath] : []
      const creating = !existingSid
      const createIp = creating
        ? newChatIp(policy, repoPath, ips, loggedInSubs, currentIp, ipExplicitForNewChat)
        : ''
      const createProvider = creating ? providerOf(ips, createIp) : ''
      if (existingSid && sessionRef.current) {
        if (currentIp && sessionRef.current.ip !== currentIp) {
          await api.session.pin(existingSid, currentIp)
          sessionRef.current.ip = currentIp
        }
        try { await thinkingSaveChainRef.current }
        catch { await api.session.setThinkingLevel(existingSid, thinking) }
      }
      const reply = await api.session.submitTurn({
        ...(existingSid ? { chatSessionId: existingSid } : {
          chatSessionCreation: {
            workspaceDirs,
            title: opts.title?.trim() || defaultNewChatTitle(),
            providerPreference: createProvider,
            ipName: createIp || undefined,
            thinkingLevel: thinking,
            // Fast mode is a Codex-only capability; a stale repo preference or
            // an in-flight restore must never reach a non-Codex creation.
            fastMode: createProvider.toLowerCase() === 'codex' && fastMode,
            worktreePath,
          },
        }),
        text,
        submissionId: opts.submissionId || newSubmissionId(),
        model,
        parentTurnId: opts.parentTurnId,
        attachments: opts.attachments,
        chatNotes: opts.chatNotes,
        primaryRepository: repoPath || undefined,
        workspaceDirs,
      })
      const sid = reply.chat_session_id
      if (creating) {
        // The RPC can resolve after a native/history handoff selected another
        // session. The new Chat Session exists in Core, but accepting it must
        // not steal the active composer from the session the user opened while
        // the send was in flight.
        const canAttachCreatedSession = !sessionRef.current && !coreSessionIdRef.current && !attachingSessionIdRef.current
        if (canAttachCreatedSession) {
          sessionRef.current = { id: sid, repo: activeRepo, ip: reply.ip_name || createIp }
          currentIp = reply.ip_name || createIp
          sessionId = sid
          coreSessionId = sid
          chatTitle = opts.title?.trim() || defaultNewChatTitle()
          worktreePath = reply.worktree_path || worktreePath
          saveSessionId(activeRepo, sid)
          ipExplicitForNewChat = false
        }
      }
      // Only the owning session may acquire the active turn state. Otherwise a
      // delayed response would make an unrelated attached session look running
      // or write the submitted turn ID into that session's local conversation.
      const submissionStillOwnsActiveSession = currentDraftSessionId() === sid
      if (submissionStillOwnsActiveSession) sessionOnGoing = true
      if (submissionStillOwnsActiveSession && reply?.turn_id && localId) {
        nodeTurnIdRef.current[localId] = reply.turn_id
        nodeTurnIdRevision += 1
      }
      await finishSuccessfulComposerSend(opts.submissionId, sid)
    } catch (e) {
      finishFailedComposerSend(opts.submissionId)
      failTurn(e instanceof Error ? e.message : String(e))
    }
  }

  function scheduleRespond(id: string, text: string) {
    if (respondTimer.current) clearTimeout(respondTimer.current)
    respondTimer.current = setTimeout(() => {
      if (nodes[id]) nodes = { ...nodes, [id]: { ...nodes[id], answer: mockAnswer(activeRepo, text), respondedAt: Date.now() } }
      agentTerminals = { ...agentTerminals, [id]: 'completed' }
      setActiveTurnId('')
    }, 3500)
  }

  function beginRespond(id: string, text: string, opts: { parentTurnId?: string; editTurnId?: string; submissionId?: string; attachments?: Turn['attachments']; title?: string; chatNotes?: string[] } = {}) {
    setActiveTurnId(id)
    if (agentTerminals[id]) { const next = { ...agentTerminals }; delete next[id]; agentTerminals = next }
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    if (!hasBridge()) { scheduleRespond(id, text); return }
    awaitRef.current = true
    sawRunningRef.current = false
    liveTextRef.current = ''
    liveBlocksRef.current = []
    liveCyclesRef.current = []
    durableCycleCountRef.current = 0
    prevLiveThinkingActiveRef.current = false
    prevLiveThinkingValueRef.current = ''
    prevLiveTextValueRef.current = ''
    afterToolBoundaryRef.current = false
    seenNativeToolBoundariesRef.current = new Set()
    thinkingStreamStartRef.current = null
    textStreamStartRef.current = null
    boundaryOrderRef.current = null
    prevTurnPhaseRef.current = null
    lastDisplayRef.current = ''
    void runRealTurn(text, opts)
  }

  // Re-apply a Willo draft handoff after the durable session fold hydrates.
  $effect(() => {
    void phase; void rootId; void coreSessionId
    const pending = pendingDraftRestoreRef.current
    if (!pending) return
    const currentId = sessionRef.current?.id || coreSessionIdRef.current || ''
    if (pending.sessionId && pending.sessionId !== currentId) return
    if (phase !== 'active') return
    pendingDraftRestoreRef.current = null
    const currentAttachments = attachmentsRef.current || []
    const pendingAttachmentsJson = JSON.stringify(pending.attachments || [])
    const currentAttachmentsJson = JSON.stringify(currentAttachments)
    const text = draftRef.current === pending.text ? pending.text : draftRef.current
    const attachments = currentAttachmentsJson === pendingAttachmentsJson ? pending.attachments : currentAttachments
    restoreComposerDraft(text, attachments, draftChatNotes)
    draftStatusRef.current = true
  })

  // ── Conversation mutations (all via TREE) ─────────────────────────────────
  function collectPendingSend() {
    const pastedImages = [...attachmentsRef.current]
    const parsed = parseLeadingTitleBlock(draftRef.current || '')
    // Whitespace is composer content. In particular, Quick Text may deliberately
    // begin or end with spaces/newlines, so only use trim to decide whether the
    // draft is empty—never to alter the text that is sent.
    const text = parsed.text.trim()
      ? parsed.text
      : (pastedImages.length ? 'Please look at the attached image.' : '')
    if (!text && !pastedImages.length) return null
    return { text, chatTitle: parsed.title, attachments: pastedImages, composeMode, branchFromId, editId }
  }

  function chatMarkedRunning() {
    return chatMarkedRunningState({
      hasBridge: hasBridge(),
      attachedSessionId: sessionRef.current?.id || coreSessionIdRef.current,
      foldSessionId: viewRef.current.chat_session_id,
      foldStatus: viewRef.current.status,
      activeTurnId: activeTurnIdRef.current,
      responding,
    })
  }

  function reportSendGuardBlocked() {
    // Living topic "chat sessions state mismatch": the "Stop current response?"
    // popup has fired on idle chats. Journal the UI's exact view of "running"
    // beside Core's authoritative state (chat_session.send_guard_blocked in the
    // Log Journal) so the next phantom occurrence is diagnosable after the
    // fact. Fire-and-forget: must never delay or block the send flow.
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    const terminal = viewRef.current.lastTurnTerminal
    const snapshot = {
      localActiveTurnId: activeTurnIdRef.current,
      foldStatus: viewRef.current.status,
      foldTurnId: viewRef.current.turn?.turn_id || '',
      lastTurnTerminal: terminal ? { turn_id: terminal.turn_id, phase: terminal.phase } : null,
      responding,
    }
    console.warn('[Elma send-guard] send blocked: chat marked running', { sessionId: sid, ...snapshot })
    if (hasBridge() && sid) void api.session.reportSendGuard({ id: sid, ...snapshot }).catch(() => {})
  }

  function performSend(
    pending: NonNullable<ReturnType<typeof collectPendingSend>>,
    opts: { preserveComposer?: boolean } = {},
  ) {
    const { text, chatTitle: pendingChatTitle, attachments: pastedImages, composeMode: pendingMode, branchFromId: pendingBranchFromId, editId: pendingEditId } = pending
    if (pendingMode === 'edit' && pendingEditId) {
      if (pendingChatTitle && hasBridge() && sessionRef.current) {
        api.session.rename(sessionRef.current.id, pendingChatTitle).then((updated) => { chatTitle = updated.chat_session?.title || pendingChatTitle }).catch(() => (chatTitle = pendingChatTitle))
      }
      applyEdit(pendingEditId, text, pastedImages)
      return
    }
    mutatedRef.current = true
    const baseNodes = nodesRef.current
    const baseRoot = rootIdRef.current
    const baseActive = activeChildRef.current
    const baseView = viewIndexRef.current
    const basePath = TREE.activePath(baseNodes, baseRoot, baseActive)
    const now = Date.now()
    const id = `t-${now}`
    const turn: Turn = { id, parentId: null, message: text, submissionId: newSubmissionId(), attachments: pastedImages, answer: [], sentAt: now, startedAt: now, respondedAt: null, children: [] }
    let nextNodes: TurnMap
    let nextRoot = baseRoot
    let nextActive = baseActive
    let nextView = baseView
    if (!baseRoot) {
      nextNodes = { [id]: turn }
      nextRoot = id
      nextActive = {}
      nextView = 0
    } else {
      const parentId = pendingMode === 'branch' && pendingBranchFromId ? pendingBranchFromId : basePath[basePath.length - 1]
      if (!parentId || !baseNodes[parentId]) return
      turn.parentId = parentId
      nextNodes = { ...baseNodes, [id]: turn, [parentId]: { ...baseNodes[parentId], children: [...baseNodes[parentId].children, id] } }
      nextActive = { ...baseActive, ...TREE.activeChildFor(nextNodes, id) }
      nextView = TREE.activePath(nextNodes, nextRoot, nextActive).indexOf(id)
    }
    nodesRef.current = nextNodes
    rootIdRef.current = nextRoot
    activeChildRef.current = nextActive
    viewIndexRef.current = nextView
    nodes = nextNodes
    rootId = nextRoot
    activeChild = nextActive
    viewIndex = nextView
    if (!opts.preserveComposer) {
      overlayOpen = false
      exitCompose()
      snapshotAndClearComposer(turn.submissionId || '', text, pastedImages)
    }
    beginRespond(id, text, {
      parentTurnId: turn.parentId ? nodeTurnIdRef.current[turn.parentId] : undefined,
      submissionId: turn.submissionId,
      attachments: pastedImages,
      chatNotes: opts.preserveComposer ? [] : [...(pendingComposerSendRef.current?.chatNotes || [])],
      title: pendingChatTitle || undefined,
    })
  }

  function removeDraftChatNote(index: number) {
    if (index < 0 || index >= draftChatNotes.length) return
    draftChatNotes = draftChatNotes.filter((_, noteIndex) => noteIndex !== index)
    const hasDraft = Boolean(draftRef.current.trim() || attachmentsRef.current.length || draftChatNotes.length)
    scheduleDraftStatus(hasDraft, 'chat-note-remove')
    flashToast('Chat Note removed from Draft')
  }

  function pasteChatNote(content: string) {
    if (!content.trim()) {
      flashToast('The pasted Chat Note is empty')
      return
    }
    // Before Turn submission, Chat Notes are Draft content. Pasting must not
    // create or mutate a Chat Session; the notes are materialized atomically
    // beside USER_SENT_MESSAGE when the user eventually submits the Turn.
    draftChatNotes = [...draftChatNotes, content]
    scheduleDraftStatus(true, 'chat-note-paste')
    flashToast('Chat Note added to Draft')
  }

  function send() {
    if (pendingStopSend || sendInFlightRef.current) return
    sendInFlightRef.current = true
    try {
      const pending = collectPendingSend()
      if (!pending) return
      if (chatMarkedRunning()) { pendingStopSend = pending; reportSendGuardBlocked(); return }
      performSend(pending)
    } finally {
      sendInFlightRef.current = false
    }
  }

  function confirmStopAndSend() {
    const pending = pendingStopSend
    if (!pending) return
    pendingStopSend = null
    mutatedRef.current = true
    void (async () => { await stopAgent(true); performSend(pending) })()
  }

  function continueFromFailurePoint() {
    const node = current
    if (!node || node.respondedAt === null || agentStatus.kind !== 'failed' || chatMarkedRunning()) return
    // This is intentionally a normal follow-up Turn rather than a retry: the
    // provider keeps the failed Turn's durable context and receives the simple
    // user instruction requested by this recovery action.
    performSend({
      text: 'proceed',
      chatTitle: null,
      attachments: [],
      composeMode: 'branch',
      branchFromId: node.id,
      editId: null,
    }, { preserveComposer: true })
  }

  function retryCurrentTurn() {
    const node = current
    if (!node || node.respondedAt === null || agentStatus.kind !== 'failed') return
    mutatedRef.current = true
    const now = Date.now()
    const editTurnId = nodeTurnIdRef.current[node.id]
    const parentTurnId = node.parentId ? nodeTurnIdRef.current[node.parentId] : undefined
    if (nodes[node.id]) nodes = { ...nodes, [node.id]: { ...nodes[node.id], answer: [], thinking: undefined, startedAt: now, respondedAt: null } }
    if (agentTerminals[node.id]) { const next = { ...agentTerminals }; delete next[node.id]; agentTerminals = next }
    if (agentFailureDetails[node.id]) { const next = { ...agentFailureDetails }; delete next[node.id]; agentFailureDetails = next }
    // A known Core turn is an accepted terminal Turn and editTurn creates a
    // new semantic command. Without a Core turn identity, acceptance was
    // uncertain, so retry the transport with the original submission ID.
    beginRespond(node.id, node.message, editTurnId ? { editTurnId, submissionId: newSubmissionId(), attachments: node.attachments } : { parentTurnId, submissionId: node.submissionId || newSubmissionId(), attachments: node.attachments })
  }

  function applyEdit(nodeId: string, text: string, attachments: ImageAttachment[] = []) {
    if (!nodes[nodeId]) return
    mutatedRef.current = true
    const now = Date.now()
    const editTurnId = nodeTurnIdRef.current[nodeId]
    const parentTurnId = nodes[nodeId].parentId ? nodeTurnIdRef.current[nodes[nodeId].parentId!] : undefined
    const dead = TREE.descendants(nodes, nodeId)
    dead.delete(nodeId)
    for (const k of dead) delete nodeTurnIdRef.current[k]
    const nextNodes: TurnMap = {}
    for (const k in nodes) if (!dead.has(k)) nextNodes[k] = nodes[k]
    nextNodes[nodeId] = { ...nodes[nodeId], message: text, submissionId: newSubmissionId(), attachments, answer: [], sentAt: now, startedAt: now, respondedAt: null, children: [] }
    const nextActive: ActiveChild = {}
    for (const k in activeChild) if (nextNodes[k]) nextActive[k] = activeChild[k]
    Object.assign(nextActive, TREE.activeChildFor(nextNodes, nodeId))
    nodes = nextNodes
    activeChild = nextActive
    viewIndex = Math.max(0, TREE.activePath(nextNodes, rootId, nextActive).indexOf(nodeId))
    overlayOpen = false
    exitCompose()
    snapshotAndClearComposer(nextNodes[nodeId].submissionId || '', text, attachments)
    beginRespond(nodeId, text, editTurnId ? { editTurnId, submissionId: nextNodes[nodeId].submissionId, attachments } : { parentTurnId, submissionId: nextNodes[nodeId].submissionId, attachments })
  }

  function removeNode(nodeId: string) {
    const n = nodes[nodeId]
    pendingRemoveId = null
    if (!n) return
    mutatedRef.current = true
    const dead = TREE.descendants(nodes, nodeId)
    const removedTurnId = nodeTurnIdRef.current[nodeId]
    if (hasBridge() && sessionRef.current && removedTurnId) api.session.removeTurn(sessionRef.current.id, removedTurnId).catch(() => {})
    for (const k of dead) delete nodeTurnIdRef.current[k]
    if (activeTurnIdRef.current && dead.has(activeTurnIdRef.current)) {
      if (respondTimer.current) { clearTimeout(respondTimer.current); respondTimer.current = null }
      if (hasBridge() && sessionRef.current) api.session.cancel(sessionRef.current.id).catch(() => {})
      setActiveTurnId('')
      awaitRef.current = false
      sawRunningRef.current = false
      liveTextRef.current = ''
      liveBlocksRef.current = []
      liveCyclesRef.current = []
      durableCycleCountRef.current = 0
      prevLiveThinkingActiveRef.current = false
      prevLiveThinkingValueRef.current = ''
      prevLiveTextValueRef.current = ''
      afterToolBoundaryRef.current = false
      seenNativeToolBoundariesRef.current = new Set()
      thinkingStreamStartRef.current = null
      textStreamStartRef.current = null
      boundaryOrderRef.current = null
      prevTurnPhaseRef.current = null
      lastDisplayRef.current = ''
    }
    if (!n.parentId || !nodes[n.parentId]) {
      nodes = {}
      rootId = null
      activeChild = {}
      viewIndex = 0
      exitCompose()
      return
    }
    const parentId = n.parentId
    const nextNodes: TurnMap = {}
    for (const k in nodes) if (!dead.has(k)) nextNodes[k] = nodes[k]
    const remaining = nodes[parentId].children.filter((c) => c !== nodeId)
    nextNodes[parentId] = { ...nodes[parentId], children: remaining }
    const nextActive: ActiveChild = {}
    for (const k in activeChild) if (nextNodes[k]) nextActive[k] = activeChild[k]
    let landId: string
    if (remaining.length) {
      const idx = Math.min(nodes[parentId].children.indexOf(nodeId), remaining.length - 1)
      nextActive[parentId] = idx
      landId = remaining[idx]
    } else {
      delete nextActive[parentId]
      landId = parentId
    }
    Object.assign(nextActive, TREE.activeChildFor(nextNodes, landId))
    nodes = nextNodes
    activeChild = nextActive
    viewIndex = Math.max(0, TREE.activePath(nextNodes, rootId, nextActive).indexOf(landId))
    if (current && current.id === nodeId) exitCompose()
  }

  function takeCursor() { followLeafRef.current = false; pendingLandRef.current = null }

  function jumpToNode(nodeId: string) {
    if (!nodes[nodeId]) return
    takeCursor()
    const nextActive = { ...activeChild, ...TREE.activeChildFor(nodes, nodeId) }
    activeChild = nextActive
    viewIndex = Math.max(0, TREE.activePath(nodes, rootId, nextActive).indexOf(nodeId))
    overlayOpen = false
  }

  $effect(() => {
    if ((!searchTarget?.query && !searchTarget?.turnId) || !rootId) return
    if (searchTarget.turnId && nodes[searchTarget.turnId]) {
      const pathToTarget = TREE.activePath(nodes, rootId, { ...activeChild, ...TREE.activeChildFor(nodes, searchTarget.turnId) })
      if (pathToTarget[viewIndex] !== searchTarget.turnId) jumpToNode(searchTarget.turnId)
      return
    }
    if (!searchTarget.turnId) {
      const q = searchTarget.query.toLowerCase()
      const found = Object.values(nodes).find((n) => n.message.toLowerCase().includes(q) || n.answer.some((b) => ('v' in b ? (Array.isArray(b.v) ? b.v.join(' ').toLowerCase().includes(q) : String(b.v).toLowerCase().includes(q)) : false)))
      if (found) jumpToNode(found.id)
    }
  })

  function switchBranch(delta: number) {
    if (!current) return
    const sib = TREE.siblings(nodes, rootId, current.id)
    const j = sib.indexOf(current.id) + delta
    if (j < 0 || j >= sib.length) return
    jumpToNode(sib[j])
  }

  const goOlder = () => {
    takeCursor()
    if (viewIndex > 0) { viewIndex -= 1; return }
    if (hasMoreSessionHistory && !loadingOlderSessionHistory) {
      const currentTurnId = current?.id || null
      // The fold-to-tree effect rebuilds reactive nodes after the page arrives.
      // Restore selection in a microtask after that effect has propagated.
      void loadOlderSessionHistory().then(() => queueMicrotask(() => {
        if (!currentTurnId) return
        const nextPath = TREE.activePath(nodes, rootId, activeChild)
        const nextIndex = nextPath.indexOf(currentTurnId)
        if (nextIndex >= 0) viewIndex = nextIndex
      }))
    }
  }
  const goNewer = () => { takeCursor(); viewIndex = Math.min(path.length - 1, viewIndex + 1) }

  const expandComposer = () => {
    // Expanding is not an explicit clear. In particular, a restored draft may
    // have survived while the uncontrolled composer was temporarily collapsed.
    composeMode = 'new'; branchFromId = null; editId = null; composing = true; composerNonce += 1
  }
  const startBranch = (nodeId: string) => {
    // Preserve existing text when changing compose mode; only send/cancel may
    // consume or explicitly discard it.
    composeMode = 'branch'; branchFromId = nodeId; editId = null; composing = true; composerNonce += 1; overlayOpen = false
  }
  const startEdit = (nodeId: string) => {
    draftRef.current = nodes[nodeId] ? nodes[nodeId].message : ''
    scheduleDraftStatus(Boolean(draftRef.current.trim()))
    composeMode = 'edit'
    editId = nodeId
    branchFromId = null
    composing = true
    composerNonce += 1
    overlayOpen = false
  }
  const cancelComposer = () => {
    pendingStopSend = null
    const shouldDiscard = composeMode !== 'new'
    exitCompose()
    // Esc only collapses the normal reply composer. The draft belongs to the
    // existing Chat Session and must still be there when the user expands the
    // composer again. Branch/edit cancellation is different: those modes stage
    // temporary or prefilled text, so cancelling them explicitly discards it.
    if (shouldDiscard) discardComposerDraft()
  }

  const cycleThinking = () => {
    thinking = hotkeyThinkingLevels[(hotkeyThinkingLevels.indexOf(thinking) + 1) % hotkeyThinkingLevels.length]
    persistThinkingForCurrentSession(thinking)
  }
  const toggleFastMode = () => {
    if (!fastModeAvailable) return
    const previous = fastMode
    fastMode = !fastMode
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (!hasBridge()) return
    const update = sid
      ? api.session.setFastMode(sid, fastMode)
      : activeRepoPathRef.current
        ? api.session.setRepoFastMode(activeRepoPathRef.current, fastMode)
        : Promise.resolve({ fast_mode: fastMode })
    void update.catch(() => {
      fastMode = previous
      flashToast('Could not update Fast mode')
    })
  }
  function persistModelForCurrentSession(selectedModel: ModelId) {
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (!hasBridge() || !sid) return
    // The model belongs to this Chat Session. Serialize rapid Ctrl+M cycles so
    // an older response cannot overwrite the user's final selection.
    modelSaveChainRef.current = modelSaveChainRef.current
      .catch(() => {})
      .then(() => api.session.setModel(sid, selectedModel))
      .then(() => undefined)
  }
  const cycleModel = () => {
    // Cycle from what the UI currently shows. `model` can be empty when the
    // provider default is implicit; cycling from that empty value would select
    // the already-visible first model and make the shortcut appear to do nothing.
    const next = nextModelSelection(currentModelForDisplay, hotkeyModels)
    model = next
    persistModelForCurrentSession(next)
  }
  // Navigate between semantic reading stops: activity, final answer, and end.
  const scrollTop = () => scrollResponse(scrollRef.current, 'up')
  const scrollBottom = () => scrollResponse(scrollRef.current, 'down')

  let previewLoadId = 0

  function loadPreviewEntry(entry: PreviewEntry) {
    const { path, anchor, line } = entry
    const loadId = ++previewLoadId
    filePreviewEditing = false
    const name = path.split('/').filter(Boolean).pop() || path
    // Update the chrome immediately. The native read may take longer for a
    // directory, but the path row must always describe the requested entry.
    filePreview = { ok: true, path, name, content: '', line, anchor }
    filePreviewLoading = true
    void readLocalFile(path)
      .then((preview) => {
        if (loadId !== previewLoadId) return
        // Use the native response's standardized path for the chrome. Parent
        // navigation can produce paths containing `..`; keeping the requested
        // spelling made the header show the old/deep path while the body was
        // already listing its canonical parent. `loadId` above protects us from
        // genuinely stale responses.
        const resolvedPath = preview.path || path
        // Keep the chrome and the rendered payload atomic. A malformed/stale
        // response must never combine one request's path with another folder's
        // name and listing (the visible failure was title `chains`, path
        // `/.../Arbol`, and the contents of `chains`).
        const responseName = preview.name || ''
        const responseBase = resolvedPath.split('/').filter(Boolean).pop() || resolvedPath
        if (responseName && responseBase !== responseName) return
        filePreview = { ...preview, path: resolvedPath, line, anchor }
        if (resolvedPath !== path) {
          const index = previewHistory.index
          const current = previewHistory.items[index]
          if (current && sameEntry(current, entry)) {
            const items = [...previewHistory.items]
            items[index] = { ...current, path: resolvedPath }
            previewHistory = { items, index }
          }
        }
      })
      .catch((e) => {
        if (loadId !== previewLoadId) return
        filePreview = { ok: false, path, error: e instanceof Error ? e.message : String(e), line, anchor }
      })
      .finally(() => {
        if (loadId === previewLoadId) filePreviewLoading = false
      })
  }

  // Shared link surface dispatches every file click here, including paths in
  // tool JSON/output and plain preformatted text, so Elma always uses column 2.
  $effect(() => {
    const onOpenFile = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) openLocalFilePreview(path)
    }
    window.addEventListener('arbol-open-file', onOpenFile)
    return () => window.removeEventListener('arbol-open-file', onOpenFile)
  })

  function openLocalFilePreview(rawPath: string) {
    threadInspectorOpen = false
    const { path, line, anchor } = parseFileLocator(rawPath)
    const entry: PreviewEntry = { path, anchor, line }
    if (sameEntry(previewHistory.items[previewHistory.items.length - 1], entry)) {
      previewHistory = { items: previewHistory.items, index: previewHistory.items.length - 1 }
    } else {
      const items = [...previewHistory.items, entry]
      previewHistory = { items, index: items.length - 1 }
    }
    void appendDocHistory({ path, anchor: anchor ?? null, line: line ?? null, chat_session_id: sessionId || null })
    if (filePreview?.ok && filePreview.path === path && filePreview.content !== undefined) {
      filePreview = { ...filePreview, line, anchor }
      return
    }
    loadPreviewEntry(entry)
  }

  function navigatePreview(dir: -1 | 1) {
    if (!filePreview && !filePreviewLoading) {
      const cur = previewHistory.items[previewHistory.index]
      if (cur) loadPreviewEntry(cur)
      return
    }
    const ni = previewHistory.index + dir
    if (ni < 0 || ni >= previewHistory.items.length) return
    previewHistory = { ...previewHistory, index: ni }
    loadPreviewEntry(previewHistory.items[ni])
  }

  function closeFilePreview() {
    // Invalidate an outstanding read so closing the panel cannot let its result
    // re-open the old path after a subsequent navigation.
    previewLoadId += 1
    viewFullscreen = false
    filePreviewEditing = false
    filePreview = null
    filePreviewLoading = false
  }

  // Keep the open document preview live.
  $effect(() => {
    if (!filePreview?.path || filePreviewLoading || filePreviewEditing || filePreview.isDirectory) return
    let cancelled = false
    let inFlight = false
    const path = filePreview.path
    const anchor = filePreview.anchor
    const line = filePreview.line
    const currentContent = filePreview.content
    const currentSize = filePreview.size
    const currentOk = filePreview.ok
    const currentError = filePreview.error
    const currentTruncated = filePreview.truncated
    const refreshLoadId = previewLoadId
    const refresh = () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      void readLocalFile(path)
        .then((next) => {
          if (cancelled || refreshLoadId !== previewLoadId || filePreview?.path !== path) return
          const changed = next.ok !== currentOk || next.content !== currentContent || next.size !== currentSize || next.error !== currentError || next.truncated !== currentTruncated
          if (changed) filePreview = { ...next, path, line, anchor }
        })
        .catch((e) => { if (!cancelled) filePreview = { ok: false, path, error: e instanceof Error ? e.message : String(e), line, anchor } })
        .finally(() => { inFlight = false })
    }
    const onFocusOrVisible = () => refresh()
    const timer = window.setInterval(refresh, 1500)
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  })

  // Hydrate the global page-view history on mount.
  onMount(() => {
    void listDocHistory().then((rows) => {
      const items: PreviewEntry[] = rows.map((e) => ({ path: e.path, anchor: e.anchor || undefined, line: e.line ?? undefined }))
      previewHistory = { items, index: items.length - 1 }
    })
  })

  const openHistory = () => { if (path.length) overlayOpen = true }

  function openChangeWalkthrough(options: { chatSessionId?: string | null; worktreePath?: string | null; diffMode?: WorktreeDiffMode } = {}) {
    if (!changeWalkthroughEnabled) {
      flashToast('Change Walkthrough is disabled in Seqoya → Feature Toggles')
      return
    }
    walkthroughInitialized = true
    if ('chatSessionId' in options || 'worktreePath' in options) {
      walkthroughLaunchChatSessionId = options.chatSessionId ?? null
      walkthroughLaunchWorktreePath = options.worktreePath ?? null
      walkthroughLaunchDiffMode = options.diffMode ?? null
      walkthroughLaunchToken += 1
    }
    elmaPage = 'change-walkthrough'
    quickOpen = false
  }

  function toggleElmaPage() {
    if (elmaPage === 'change-walkthrough') { elmaPage = 'chat'; return }
    if (!changeWalkthroughEnabled) return
    if (!walkthroughInitialized) {
      walkthroughLaunchChatSessionId = null
      walkthroughLaunchWorktreePath = null
      walkthroughLaunchDiffMode = null
    }
    else walkthroughRefreshToken += 1
    walkthroughInitialized = true
    elmaPage = 'change-walkthrough'
  }

  async function handoffWalkthroughSelection(chatSessionId: string, block: string) {
    const attached = coreSessionIdRef.current === chatSessionId || await attachSessionById(chatSessionId)
    if (!attached) { flashToast('Could not open the launch Chat Session'); return }
    restoreComposerDraft(appendToDraft(draftRef.current, block), attachmentsRef.current, draftChatNotes)
    elmaPage = 'chat'
  }

  function openThreadInspector() {
    // The Right Panel is a single contextual surface. Opening the Inspector
    // replaces a file preview without changing its independent history.
    previewLoadId += 1
    filePreview = null
    filePreviewLoading = false
    filePreviewEditing = false
    viewFullscreen = false
    threadInspectorOpen = true
    quickOpen = false
  }

  // ── Quick Actions ──────────────────────────────────────────────────────────
  async function investigateSession() {
    const sourceSessionId = coreSessionIdRef.current || sessionRef.current?.id
    // A missing assistant response is itself useful diagnostic context. Do not
    // require Core to have projected the Turn as failed before investigation.
    if (!hasBridge() || !sourceSessionId) return

    // Snapshot the parent execution context before creating anything. In
    // particular, do not call openRepo()/send(): that mutates the mounted
    // composer and can race back into the failed Chat Session.
    const parentRepoPath = activeRepoPath || repoByName.get(activeRepo)?.path || ''
    const parentIp = currentIp
    const parentModel = model
    if (!parentRepoPath || !parentIp) {
      flashToast('Could not resolve the failed Chat Session context')
      return
    }

    const sourceSessionTitle = chatTitle || 'Untitled Chat Session'
    const sourceSessionUri = formatEntityUri({
      repo: 'Arbol',
      kind: 'chat',
      entityId: sourceSessionId,
      title: sourceSessionTitle,
    })
    const prompt = `${sourceSessionUri}\n\nInvestigate what went wrong with this Chat Session, identify the root cause, and propose fixes.`
    const diagnosisTitle = `What’s wrong? · ${sourceSessionTitle}`
    quickOpen = false

    try {
      // Submit explicitly to a NEW destination and pin creation to the parent's
      // Repo and IP. The top-level model is persisted on that new Chat Session
      // and used for its first Turn.
      const created = await api.session.submitTurn({
        chatSessionCreation: {
          workspaceDirs: [parentRepoPath],
          title: diagnosisTitle,
          providerPreference: providerOf(ips, parentIp),
          ipName: parentIp,
          thinkingLevel: thinking,
        },
        text: prompt,
        submissionId: newSubmissionId(),
        model: parentModel,
        primaryRepository: parentRepoPath,
        workspaceDirs: [parentRepoPath],
      })
      const opened = await attachSessionById(created.chat_session_id)
      if (!opened) throw new Error('The diagnosis Chat Session was created but could not be opened')
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not start diagnosis Chat Session')
    }
  }

  const runQuick = (fn: () => void) => { quickOpen = false; fn() }
  const finalizeSession = () => flashToast('Chat session finalized')
  function requestArchiveSession() {
    const sid = coreSessionIdRef.current || sessionRef.current?.id
    // Always offer confirmation for an attached session. In particular, the
    // hotkey is commonly pressed while the current response is still running;
    // silently ignoring it made Cmd+Backspace appear broken.
    if (!sid) return
    quickOpen = false
    pendingArchive = true
  }

  async function archiveSession() {
    const sid = coreSessionIdRef.current || sessionRef.current?.id
    if (!sid) return
    quickOpen = false
    pendingArchive = false
    try {
      // Core deliberately refuses to archive a running Chat Session. A user's
      // confirmation authorizes stopping that response first, then archiving.
      if (responding || viewRef.current.status === 'running' || Boolean(activeTurnIdRef.current)) {
        await stopAgent(true)
      }
      await api.session.archive(sid)
      // The archived session no longer exists in the live DB. Remove every local
      // pointer that could make Elma try to attach it again, then open a clean
      // composer for the same repository.
      clearCachedComposerDraft(sid)
      saveSessionId(activeRepo, null)
      clearElmaLastChatSessionId()
      publishElmaActiveChatSessionId(null)
      if (respondTimer.current) { clearTimeout(respondTimer.current); respondTimer.current = null }
      nodes = {}
      rootId = null
      activeChild = {}
      viewIndex = 0
      overlayOpen = false
      pendingRemoveId = null
      pendingArchive = false
      pendingStopSend = null
      sessionId = mkSessionId(activeRepo)
      chatTitle = ''
      titleEditing = false
      chatTags = []
      // Keep the selected Repo's tag catalog available for the next session.
      tagEditing = null
      tagDialogOpen = false
      // Clear identity first so teardown cannot persist a draft back into the
      // just-removed live session.
      sessionRef.current = null
      coreSessionId = null
      teardownSession()
      exitCompose()
      clearComposerLocally()
      flashToast('Chat session archived')
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not archive chat session')
    }
  }
  const copySessionId = () => {
    try { const p = navigator.clipboard && navigator.clipboard.writeText(sessionId); if (p && p.catch) p.catch(() => {}) } catch {}
    flashToast('Session ID copied')
  }
  async function refreshKnownTags(repoPath = activeRepoPath) {
    if (!hasBridge() || !repoPath) return
    try {
      const response = await api.session.tagSuggestions(repoPath)
      // Ignore a response that crossed a repository switch.
      if (activeRepoPath === repoPath) {
        knownTags = response.tags
        tagDefinitions = response.definitions ?? []
      }
    } catch {
      // Suggestions are optional; arbitrary tags remain usable offline.
    }
  }

  async function openTagDialog(editTag: ChatTag | null = null) {
    const sid = coreSessionIdRef.current || sessionRef.current?.id
    if (!sid) return
    quickOpen = false
    tagEditing = editTag
    tagDialogOpen = true
    await refreshKnownTags()
  }

  async function applyChatTags(tags: ChatTag[]) {
    const sid = coreSessionIdRef.current || sessionRef.current?.id
    if (!sid || tagSaving) return
    tagSaving = true
    try {
      const result = await api.session.setTags(sid, tags)
      chatTags = (result.chat_session.metadata?.tags ?? tags).map((tag) => ({ ...tag }))
      // Make newly introduced names available without waiting for stream delivery.
      knownTags = Array.from(new Set([...knownTags, ...chatTags.map((tag) => tag.name)]))
        .sort((a, b) => a.localeCompare(b))
      tagDialogOpen = false
      tagEditing = null
      await refreshKnownTags()
      flashToast(chatTags.length ? 'Chat tags applied' : 'Chat tags cleared')
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not apply chat tags')
    } finally {
      tagSaving = false
    }
  }

  async function toggleCockpitTag(tag: ChatTag, active: boolean) {
    await applyChatTags(active ? removeTag(chatTags, tag.name) : addOrReplaceTag(chatTags, tag))
  }

  async function toggleTagVip(name: string, vip: boolean) {
    const repoPath = activeRepoPath
    if (!repoPath) return
    try {
      const symbol = chatTags.find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.symbol
      const response = await api.session.setTagVip(repoPath, name, vip, symbol)
      knownTags = response.tags
      tagDefinitions = response.definitions
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not update VIP tag')
    }
  }

  const quickActions = $derived.by<QuickAction[]>(() => {
    const hasSession = Boolean(coreSessionId || sessionRef.current?.id)
    return [
      { key: '?', label: 'What’s wrong?', desc: 'Start another Chat Session to investigate this session and propose fixes', icon: quickIconWhatsWrong, disabled: !hasSession, onRun: () => void investigateSession() },
      { key: 'F', label: 'Finalize chat session', desc: 'Mark this session as finalized', icon: quickIconCheck, disabled: !hasSession, onRun: () => runQuick(finalizeSession) },
      { key: 'A', label: 'Archive', desc: 'Move this Chat Session to arbol-archive', icon: quickIconCheck, disabled: !hasSession, danger: true, onRun: requestArchiveSession },
      { key: 'C', label: 'Copy session ID', desc: sessionId, icon: quickIconCopy, disabled: !hasSession, onRun: () => runQuick(copySessionId) },
      { key: 'R', label: 'Rename chat session', desc: 'Edit the session name shown in the header', icon: quickIconRename, disabled: !hasSession, onRun: () => runQuick(beginTitleEdit) },
      { key: 'T', label: 'Tag Chat', desc: 'Add names or name=value metadata to this Chat Session', disabled: !hasSession, onRun: () => void openTagDialog() },
      { key: 'B', label: 'Branch from current point', desc: 'Fork a new conversation branch here', icon: quickIconBranch, disabled: !current, onRun: () => runQuick(() => current && startBranch(current.id)) },
      ...(changeWalkthroughEnabled ? [{ key: 'W', label: 'Walk through changes…', desc: 'Review this Chat Session’s repository changes', icon: quickIconCheck, disabled: !coreSessionId, onRun: () => runQuick(() => openChangeWalkthrough({ chatSessionId: coreSessionId })) }] : []),
      { key: 'I', label: 'Thread Inspector', desc: 'Inspect this Conversation Thread lifecycle', onRun: openThreadInspector },
    ]
  })

  // Losing the Elma window is a persistence boundary. WebKit may throttle the
  // 350 ms autosave timer as soon as another app/window becomes active, and an
  // Arbol UI can replace or hide this WebView before that timer runs. Snapshot
  // on blur/hidden/pagehide while the native bridge is still available.
  onMount(() => {
    let tagSurfaceUnsubscribe: null | (() => void) = null
    const subscribeToTagChanges = () => {
      tagSurfaceUnsubscribe?.()
      tagSurfaceUnsubscribe = elmaBridge.subscribe('chat_session.surface.events', {}, (event) => {
        if (event.kind === 'error') return
        // The ready event closes the subscribe-vs-update race. Invalidations are
        // intentionally non-durable, so a VIP change published just before this
        // window subscribes is represented only by the current catalog read.
        if (event.event === 'chat_session.surface.ready') {
          void refreshKnownTags()
          void refreshParentChatSession()
          return
        }
        if (event.event !== 'chat_session.surface.changed') return
        const data = event.data as { change?: string; repo_path?: string; chat_session_id?: string } | undefined
        if (parentChatSession && (!data?.chat_session_id
            || data.chat_session_id === parentChatSession.id
            || data.chat_session_id === parentChatSession.ongoing_chat_session_id)) {
          void refreshParentChatSession()
        }
        if (data?.change === 'chat_session_tags_changed' || data?.change === 'chat_session_tag_catalog_changed') {
          void refreshKnownTags()
        }
      })
    }
    subscribeToTagChanges()
    const offTagReconnect = elmaBridge.onCoreReconnect(subscribeToTagChanges)

    const flushOnBlur = () => {
      if (pendingComposerSendRef.current) return
      flushDraftForCurrentSessionBeforeDetach()
    }
    const restoreLocalShadow = () => {
      // There is deliberately no active composer identity while an external
      // Chat Session attach is awaiting metadata. Restoring the repo/new-chat
      // shadow in that gap would copy it into the incoming session once attach
      // completes. The attach path hydrates the target's exact Draft itself.
      if (attachingSessionIdRef.current) return
      // The empty composer is intentional while Core is accepting/cleaning up a
      // submitted message. Restoring the shadow here was the source of the sent
      // text reappearing and of a new Draft being written after a successful send.
      if (pendingComposerSendRef.current) return
      // If WebKit recreated/reset or collapsed the uncontrolled textarea while
      // Elma was not key, restore the synchronous shadow before any focus refresh
      // can treat the empty UI as intentional.
      syncComposerRefFromDom(false)
      if (draftRef.current.trim() || attachmentsRef.current.length) {
        cacheCurrentComposerSnapshot()
        if (phase === 'active' && !composing) {
          composing = true
          composerNonce += 1
        }
        return
      }
      const sid = currentDraftSessionId()
      // Restore only the Draft bound to this exact composer. A pre-session
      // Draft is independent editor content; using it as a fallback while an
      // existing Chat Session is active leaks new-chat text into that session's
      // reply composer. Cross-identity moves must be explicit submission/UI
      // transitions, never an implicit focus fallback.
      const cached = loadCachedDraftForComposer(
        localStorage, sid, activeRepoPathRef.current, activeRepo,
      )
      if (cached && (cached.text.trim() || cached.attachments.length || (cached.chatNotes?.length || 0))) {
        restoreComposerDraft(cached.text, cached.attachments, cached.chatNotes || [])
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushDraftForCurrentSessionBeforeDetach()
      else restoreLocalShadow()
    }
    window.addEventListener('blur', flushOnBlur)
    window.addEventListener('focus', restoreLocalShadow)
    window.addEventListener('pagehide', flushOnBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', flushOnBlur)
      window.removeEventListener('focus', restoreLocalShadow)
      window.removeEventListener('pagehide', flushOnBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      offTagReconnect()
      tagSurfaceUnsubscribe?.()
      tagSurfaceUnsubscribe = null
    }
  })

  // Clean up pending timers on unmount.
  onMount(() => () => {
    if (respondTimer.current) clearTimeout(respondTimer.current)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    // Closing the window inside the debounce interval must not lose the last
    // keystrokes. This snapshots synchronously, then drains through the ordered
    // write chain while the bridge is still available.
    if (!pendingComposerSendRef.current) flushDraftForCurrentSessionBeforeDetach()
    if (draftTimer.current) clearTimeout(draftTimer.current)
  })

  // ── Global hotkeys ──────────────────────────────────────────────────────────
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName || ''
      const inField = /^(TEXTAREA|INPUT)$/.test(tag)
      const meta = e.metaKey || e.ctrlKey
      // `key` depends on the active keyboard layout and can be a symbol even
      // for Cmd+number. `code` identifies the physical number-row key.
      const digit = /^Digit([0-9])$/.exec(e.code)?.[1] || (/^[0-9]$/.test(e.key) ? e.key : '')
      // Repo/new-chat switching belongs to Elma as a whole, not only its Chat
      // page. Handle it before the retained Change Walkthrough shortcut guard.
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && digit) {
        e.preventDefault(); e.stopPropagation(); runCmdNumberHotkey(digit); return
      }
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === 'Tab') { e.preventDefault(); toggleElmaPage(); return }
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation(); void stopAgent(true); return
      }
      // Chat remains mounted while hidden. Do not let its other global shortcuts
      // act on retained Chat state while the sibling Walkthrough page is active.
      if (elmaPage === 'change-walkthrough') return
      if (isArchiveSessionHotkey(e)) {
        if (coreSessionIdRef.current || sessionRef.current?.id) {
          e.preventDefault(); e.stopPropagation(); requestArchiveSession()
        }
        return
      }
      // Use `code` because Option can change the character produced by `key` on macOS.
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'Digit0') {
        e.preventDefault(); void toggleOnGoing(); return
      }
      if (e.key === 'Escape' && viewFullscreen) { e.preventDefault(); viewFullscreen = false; return }
      if (e.key === 'Escape' && overlayOpen) { e.preventDefault(); overlayOpen = false; return }
      if (tagDialogOpen) return
      if (e.metaKey && e.shiftKey && e.altKey && !e.ctrlKey && (e.code === 'Digit5' || e.code === 'Digit6') && !inField && previewHistory.items.length > 0) {
        e.preventDefault(); navigatePreview(e.code === 'Digit5' ? -1 : 1); return
      }
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); quickOpen = !quickOpen
        return
      }
      if (e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); if (path.length) overlayOpen = !overlayOpen; return
      }
      if (e.metaKey && !e.ctrlKey && !e.altKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault(); if (phase === 'active') (e.key === '[' ? goOlder : goNewer)(); return
      }
      if (e.ctrlKey && !e.metaKey && !e.altKey && digit) {
        const idx = parseInt(digit, 10) - 1
        const ip = ips[idx]
        if (ip && enabledIpNames.has(ip.name) && !prohibitedIpNames.has(ip.name)) { e.preventDefault(); selectIp(ip.name) }
        return
      }
      if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); cycleThinking(); return }
      if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); cycleModel(); return }
      if (e.metaKey && e.shiftKey && e.altKey && !e.ctrlKey && e.code === 'Digit8') { e.preventDefault(); scrollTop(); return }
      if (e.metaKey && e.shiftKey && e.altKey && !e.ctrlKey && e.code === 'Digit7') { e.preventDefault(); scrollBottom(); return }
      if (e.key === 'Enter' && !meta && !e.shiftKey && !inField && phase === 'active' && !composing && !overlayOpen && !quickOpen) { e.preventDefault(); expandComposer(); return }
      if (e.key === 'Escape' && composing) { cancelComposer(); return }
      if (e.key === 'Escape' && (filePreview || filePreviewLoading)) { e.preventDefault(); closeFilePreview(); return }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  function beginTitleEdit() {
    if (hasBridge() && !(sessionRef.current?.id || coreSessionIdRef.current)) { flashToast('Start a chat before renaming'); return }
    titleEditing = true
  }

  function startTitleEdit(e: MouseEvent) {
    if (!e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    beginTitleEdit()
  }

  async function saveChatTitle(title: string) {
    const trimmed = title.trim()
    if (!trimmed || titleSaving) return
    const sid = sessionRef.current?.id || coreSessionIdRef.current
    if (hasBridge() && !sid) { flashToast('Start a chat before renaming'); titleEditing = false; return }
    titleSaving = true
    try {
      if (sid) { const updated = await api.session.rename(sid, trimmed); chatTitle = updated.chat_session?.title || trimmed }
      else chatTitle = trimmed
      titleEditing = false
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'Could not rename chat')
    } finally {
      titleSaving = false
    }
  }

  let parentRefreshGeneration = 0
  async function refreshParentChatSession() {
    const id = coreSessionIdRef.current
    if (!id || !parentChatSession) return
    const generation = ++parentRefreshGeneration
    try {
      const result = await api.session.get(id, true)
      if (coreSessionIdRef.current !== id || generation !== parentRefreshGeneration) return
      parentChatSession = result.chat_session?.parent_chat_session ?? null
      sessionOnGoing = Boolean(parentChatSession?.onGoing ?? result.chat_session?.onGoing)
    } catch { /* Reconnect/next surface invalidation retries this read. */ }
  }

  async function toggleOnGoing() {
    if (ongoingSaving) return
    ongoingSaving = true
    const next = !sessionOnGoing
    const prev = sessionOnGoing
    sessionOnGoing = next
    try {
      // Never materialize a Chat Session just to carry this flag. A Chat
      // Session is created by `turn.submit` when there is a first message;
      // forcing one here left contentless sessions in the list, titled like
      // real conversations, that open to a blank transcript (and read as a
      // lost chat). Same guard the rename path already uses. Sending marks
      // the session ongoing anyway, so nothing is lost by waiting.
      const sid = sessionRef.current?.id || coreSessionIdRef.current || (hasBridge() ? null : sessionId)
      if (!sid) throw new Error('Start a chat before marking ongoing')
      ++parentRefreshGeneration
      const updated = await api.session.setOnGoing(sid, next)
      ++parentRefreshGeneration
      if (coreSessionIdRef.current && coreSessionIdRef.current !== sid) return
      parentChatSession = updated.chat_session?.parent_chat_session ?? parentChatSession
      sessionOnGoing = Boolean(parentChatSession?.onGoing ?? updated.chat_session?.onGoing ?? next)
      flashToast(next ? 'Marked ongoing' : 'Cleared ongoing')
    } catch (e) {
      sessionOnGoing = prev
      flashToast(e instanceof Error ? e.message : 'Could not update ongoing flag')
    } finally {
      ongoingSaving = false
    }
  }

  const headerRunning = $derived(agentRunning)
  const errResetKey = $derived(`${activeRepo}:${coreSessionId ?? ''}:${viewIndex}`)
</script>

{#snippet quickIconWhatsWrong()}<WhatsWrongIcon size={16} />{/snippet}
{#snippet quickIconCheck()}<CheckCircleIcon size={16} />{/snippet}
{#snippet quickIconCopy()}<CopyIcon size={16} />{/snippet}
{#snippet quickIconRename()}<PencilIcon size={16} />{/snippet}
{#snippet quickIconBranch()}<BranchIcon size={16} />{/snippet}

{#snippet headerGlyph()}<ElmaChatGlyph />{/snippet}

{#snippet headerTitle()}
  {#if elmaPage === 'change-walkthrough'}
    <span style="font-weight:650">Change Walkthrough</span>
  {:else}
    <ElmaHeaderTitle
      title={chatTitle}
      editing={titleEditing}
      busy={titleSaving}
      onStartEdit={startTitleEdit}
      onSave={(t) => void saveChatTitle(t)}
      onCancel={() => (titleEditing = false)}
    />
  {/if}
{/snippet}

{#snippet status()}
  {#if elmaPage === 'change-walkthrough'}
    <span>Repository changes</span><span style="opacity:.5">·</span><span>Repo → unified diff</span>
  {:else}
    <ElmaStatusBar
      {changeWalkthroughEnabled}
      {activeRepo}
      worktreeBranch={worktreeDiffSummary?.branch || ''}
      {worktrees}
      {worktreeBusy}
      onOpenWalkthrough={() => {
        if (worktreePath) openChangeWalkthrough({ worktreePath, diffMode: worktreeDiffMode })
      }}
      {ipLabel}
      modelLabel={currentModelLabel}
      {thinking}
      {fastMode}
      {fastModeAvailable}
      onToggleFastMode={toggleFastMode}
      {affectedFiles}
      {affectedLines}
      worktreeStatsError={worktreeStatsError}
      worktreeStatsLoading={worktreeStatsLoading}
      onRetryWorktreeStats={() => void refreshWorktreeStats(worktreePath)}
      diffMode={worktreeDiffMode}
      parentBranch={worktreeDiffSummary?.parent_branch ?? null}
      parentAvailable={worktreeDiffSummary?.parent_available ?? false}
      masterBranch={primaryBranch}
      masterAvailable={Boolean(primaryBranch)}
      masterIsCurrent={primaryIsCurrent}
      onDiffModeChange={(mode) => { worktreeDiffMode = mode; void refreshWorktreeStats(worktreePath) }}
      embedPending={overlayEmbedPending}
      embedRunning={overlayEmbedRunning}
      onEmbed={() => void embedOverlayChunks()}
    />
  {/if}
{/snippet}

{#snippet headerActions()}
  {#if elmaPage === 'change-walkthrough'}
  <button onclick={toggleElmaPage} title="Return to Chat (⌥Tab)"
    style="border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);border-radius:7px;padding:5px 9px;cursor:pointer;font:600 11px/1 var(--arbol-font-ui)">
    Chat <span style="opacity:.55;margin-left:4px">⌥Tab</span>
  </button>
  {/if}
  {#if elmaPage === 'chat'}<ChatWidthControl {...widthCtl} />{/if}
  <FontSizeControl {...fontCtl} />
{/snippet}

{#snippet errFallback(error: Error, reset: () => void)}
  <RenderErrorCard
    {error}
    onRetry={reset}
    title="Couldn't render this conversation"
    details={{ session: coreSessionId ?? '(none)', status: view.status ?? '(unknown)', turn: view.turn?.turn_id ?? current?.id ?? '(none)', messages: view.messages.length }}
  />
{/snippet}

<UIShell
  title={headerTitle}
  {headerGlyph}
  {headerRunning}
  enableSharedCmdNumberHotkeys={false}
  {theme}
  onTheme={(id) => (theme = id)}
  {status}
  {headerActions}
>
  <div style="height:100%;min-height:0">
    <div style:display={elmaPage === 'change-walkthrough' ? 'block' : 'none'} style="height:100%;min-height:0">
      {#if changeWalkthroughEnabled && walkthroughInitialized}
        <ChangeWalkthroughPage
          active={elmaPage === 'change-walkthrough'}
          launchChatSessionId={walkthroughLaunchChatSessionId}
          launchWorktreePath={walkthroughLaunchWorktreePath}
          launchDiffMode={walkthroughLaunchDiffMode}
          refreshToken={walkthroughRefreshToken}
          launchToken={walkthroughLaunchToken}
          onAskAgent={(sid, block) => void handoffWalkthroughSelection(sid, block)}
        />
      {/if}
    </div>
    <div
      style:display={elmaPage === 'chat' ? 'grid' : 'none'}
      style="grid-template-columns:{viewFullscreen ? '1fr' : 'var(--arbol-navigation-panel-width) 1fr'};height:100%"
      use:entityLinkTarget={coreSessionId ? { repo: activeRepo || 'Any', kind: 'chat', entityId: coreSessionId, title: chatTitle || 'Untitled Chat Session' } : null}
    >
    {#if !viewFullscreen}
      <NavigationPanel
        {repoSlots}
        {activeRepo}
        {chatTitle}
        {phase}
        onOpenRepo={clickRepo}
        onOther={() => void openOther('mouse')}
        {ips}
        {enabledIpNames}
        {prohibitedIpNames}
        {prohibitedRepoPaths}
        {currentIp}
        onSelectIp={selectIp}
        {thinking}
        {model}
        modelLabel={currentModelLabel}
        onCycleModel={cycleModel}
        turnCount={path.length}
        turnNumber={viewIndex + 1}
        onOlder={goOlder}
        onNewer={goNewer}
        onHistory={openHistory}
        onChangeWalkthrough={toggleElmaPage}
        {changeWalkthroughEnabled}
        {sessionOnGoing}
        {parentChatSession}
        {ongoingSaving}
        onToggleOnGoing={() => void toggleOnGoing()}
        onQuick={() => (quickOpen = true)}
        {chatTags}
        {tagDefinitions}
        tokenUsage={cockpitTokenUsage}
        tokenUsageActive={responding || view.status === 'running'}
        {tagSaving}
        onToggleTag={(tag, active) => void toggleCockpitTag(tag, active)}
        onEditTag={(tag) => void openTagDialog(tag)}
        onRemoveTag={(tag) => void applyChatTags(removeTag(chatTags, tag.name))}
        onAddTag={() => void openTagDialog()}
        onToggleTagVip={(name, vip) => void toggleTagVip(name, vip)}
        {tagDialogOpen}
        {knownTags}
        {tagEditing}
        onApplyTags={(tags) => void applyChatTags(tags)}
        onCloseTagDialog={() => { tagDialogOpen = false; tagEditing = null }}
      />
    {/if}
    <div style="min-width:0;min-height:0;overflow:hidden">
      <ErrorBoundary resetKey={errResetKey} fallback={errFallback}>
        {#snippet children()}
          <ElmaPage
            composerKey={composerNonce}
            sessionDir={worktreePath || activeRepoPath}
            sessionId={coreSessionId}
            historyHydrated={sessionHistoryHydrated}
            {phase}
            {activeRepo}
            {ipLabel}
            {thinking}
            modelLabel={currentModelLabel}
            {draftRef}
            {attachmentsRef}
            {composerRef}
            {scrollRef}
            onSend={send}
            onDraftChange={handleComposerDraftChange}
            onPasteChatNote={pasteChatNote}
            onRemoveDraftChatNote={removeDraftChatNote}
            draftChatNotes={draftChatNotes}
            {chatNotes}
            turns={pathNodes}
            {viewIndex}
            {current}
            {responding}
            {agentStatus}
            {agentRunning}
            {toolOutputPreviews}
            nativeToolCalls={currentNativeToolCalls}
            workingDirectoryChanges={view.workingDirectoryChanges}
            onOlder={goOlder}
            onNewer={goNewer}
            onJump={jumpToNode}
            onOpenHistory={openHistory}
            {overlayOpen}
            onCloseOverlay={() => (overlayOpen = false)}
            {composing}
            {composeMode}
            onExpandComposer={expandComposer}
            onScrollTop={scrollTop}
            onScrollBottom={scrollBottom}
            onRetryTurn={retryCurrentTurn}
            onContinueFromFailure={continueFromFailurePoint}
            onEsc={cancelComposer}
            {branchIndex}
            {branchCount}
            onBranchPrev={() => switchBranch(-1)}
            onBranchNext={() => switchBranch(1)}
            onStartEdit={() => current && startEdit(current.id)}
            onRequestRemove={() => current && (pendingRemoveId = current.id)}
            {pendingRemove}
            onConfirmRemove={() => pendingRemoveId && removeNode(pendingRemoveId)}
            onCancelRemove={() => (pendingRemoveId = null)}
            {pendingArchive}
            onConfirmArchive={() => void archiveSession()}
            onCancelArchive={() => (pendingArchive = false)}
            pendingStopSend={!!pendingStopSend}
            onConfirmStopSend={confirmStopAndSend}
            onCancelStopSend={() => (pendingStopSend = null)}
            {quickOpen}
            {quickActions}
            onCloseQuick={() => (quickOpen = false)}
            {tagDialogOpen}
            {chatTags}
            {knownTags}
            {tagSaving}
            {tagEditing}
            onApplyTags={(tags) => void applyChatTags(tags)}
            onCloseTagDialog={() => { tagDialogOpen = false; tagEditing = null }}
            {toast}
            approvals={visibleApprovals}
            {approvalBusy}
            onApprove={(rid, details) => decideApproval(rid, (sid, r) => api.session.clickRun(sid, r, undefined, details))}
            onApproveAlways={(rid, details) => decideApproval(rid, (sid, r) => api.session.clickRunAlways(sid, r, details))}
            onRejectApproval={(rid, details) => decideApproval(rid, (sid, r) => api.session.clickReject(sid, r, undefined, details))}
            onSubmitAnswers={(rid, answers) => decideApproval(rid, (sid, r) => api.session.clickRun(sid, r, answers))}
            onCancelApproval={(rid) => {
              // AskUserQuestion's Cancel means stop the response, not reject the
              // question and let the agent continue with an empty answer.
              dismissApproval(rid)
              void stopAgent(true)
            }}
            {nodes}
            {rootId}
            {activeChild}
            {path}
            searchHighlight={searchTarget?.query && current && (!searchTarget.turnId || searchTarget.turnId === current.id) ? { query: searchTarget.query, role: searchTarget.role, targetIndex: searchTarget.occurrenceIndex } : null}
            {filePreview}
            {filePreviewLoading}
            onOpenLocalFile={openLocalFilePreview}
            onCloseFilePreview={closeFilePreview}
            onFilePreviewEditingChange={(editing) => (filePreviewEditing = editing)}
            {viewFullscreen}
            onToggleViewFullscreen={() => (viewFullscreen = !viewFullscreen)}
            previewNav={{ canBack: previewHistory.index > 0, canForward: previewHistory.index < previewHistory.items.length - 1, onBack: () => navigatePreview(-1), onForward: () => navigatePreview(1) }}
            {threadInspectorOpen}
            onCloseThreadInspector={() => (threadInspectorOpen = false)}
            threadInspectorContext={{ repo: activeRepo, ip: ipLabel, model: currentModelLabel, worktree: worktreePath }}
          />
        {/snippet}
      </ErrorBoundary>
    </div>
    </div>
  </div>
</UIShell>
