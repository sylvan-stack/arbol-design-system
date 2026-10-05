<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { entityLinkTarget, openEntityRelationshipSearch } from '@arbol/design-system'
  import EmailContextMenu from './EmailContextMenu.svelte'
  import IgnoreEmailConfirmModal from './IgnoreEmailConfirmModal.svelte'
  import IgnoreEmailStringModal from './IgnoreEmailStringModal.svelte'
  import EmailSignalRuleModal from './EmailSignalRuleModal.svelte'
  import EmailParserTestModal from './EmailParserTestModal.svelte'
  import IgnoredEmailSourcesModal from './IgnoredEmailSourcesModal.svelte'
  import SignalRulesManagerModal from './SignalRulesManagerModal.svelte'
  import { emailSyncStatusText, reconcileRemovedMessages } from './emailAutomationState'
  import { emailPageLinks, paginateEmails } from './emailPagination'
  import {
    MailSyncError,
    mailApi,
    mailMessageKey,
    mailSyncProgressLabel,
    messagePreview,
    senderAddress,
    senderName,
    type EmailIgnoreKind,
    type EmailIgnorePreview,
    type EmailAutomationPreview,
    type EmailSourceContent,
    type MailAccount,
    type MailMessage,
    type MailMessageSummary,
    type MailStatus,
    type MailSyncProgress,
  } from './mailApi'

  const PINNED_KEY = 'arbol-willo-mail-pinned'
  const LIST_LIMIT = 2000
  let status = $state<MailStatus | null>(null)
  let accounts = $state<MailAccount[]>([])
  let selectedAccountId = $state<string | null>(null)
  let messages = $state<MailMessageSummary[]>([])
  let selectedKey = $state<string | null>(null)
  let selectedMessage = $state<MailMessage | null>(null)
  let detailCache: Record<string, MailMessage> = {}
  let sourceContentCache: Record<string, EmailSourceContent[]> = {}
  let selectedSourceContents = $state<EmailSourceContent[]>([])
  let selectedSourceItemId = $state<string | null>(null)
  let expandedThreadKeys = $state<string[]>([])
  let threadContents: Record<string, EmailSourceContent[]> = $state({})
  let loadingThreadKeys = $state<string[]>([])
  let pinnedKeys = $state<string[]>(readPins())
  let query = $state('')
  let currentPage = $state(1)
  let loading = $state(true)
  let syncNotice = $state<string | null>(null)
  let captureWindowOpening = $state(false)
  let automaticSyncStarting = $state(false)
  let automaticSyncProgress = $state<MailSyncProgress | null>(null)
  let automaticSyncTimer: ReturnType<typeof setTimeout> | null = null
  let detailLoading = $state(false)
  let error = $state<string | null>(null)
  let contextMenu = $state<{ message: MailMessageSummary; source: EmailSourceContent | null; x: number; y: number } | null>(null)
  let ignoreTarget = $state<{ message: MailMessageSummary; preview: EmailIgnorePreview } | null>(null)
  let ignoreStringTarget = $state<MailMessageSummary | null>(null)
  let ignoreLoading = $state(false)
  let ignoreSaving = $state(false)
  let automationMenuOpen = $state(false)
  let ignoredManagerOpen = $state(false)
  let signalRulesManagerOpen = $state(false)
  let signalNotice = $state<string | null>(null)
  let ruleEditor = $state<{ message: MailMessageSummary; preview: EmailAutomationPreview } | null>(null)
  let parserTestTarget = $state<{ message: MailMessageSummary; source: EmailSourceContent | null } | null>(null)
  let ruleEditorEnriching = $state(false)
  let requestGeneration = 0
  let messageListElement = $state<HTMLDivElement | null>(null)
  let mailBodyElement = $state<HTMLDivElement | null>(null)
  let emailRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let emailRefreshRunning = false
  let emailRefreshPending = false

  const filteredMessages = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? messages.filter((message) => [
      senderName(message.sender), senderAddress(message.sender), message.subject,
      message.preview, message.account_name, message.account_email,
    ].some((value) => value.toLocaleLowerCase().includes(needle))) : messages
  })
  const emailPagination = $derived(paginateEmails(filteredMessages, pinnedKeys, currentPage))
  const visibleMessages = $derived(emailPagination.messages)
  const visibleMessageGroups = $derived(emailPagination.groups)
  const pageLinks = $derived(emailPageLinks(emailPagination.page, emailPagination.pageCount))
  const threadCount = $derived(messages.length)
  const emailCount = $derived(messages.reduce((total, message) => total + threadMessageCount(message), 0))
  const pinnedCount = $derived(messages.filter((message) => pinnedKeys.includes(mailMessageKey(message))).length)
  const unreadCount = $derived(messages.filter((message) => !message.is_read).length)
  const incompleteCount = $derived(messages.filter((message) =>
    message.content_state === 'partial' || message.content_state === 'preview'
  ).length)
  const gmailAccessSuspended = $derived(status?.gmail_access_suspended === true)
  const disconnected = $derived(status !== null && !gmailAccessSuspended && (status.sync.status === 'needs_login' || !status.logged_in))
  // A disconnected Gmail session prevents future synchronization, but it does
  // not invalidate the durable email snapshot. Only replace the list with the
  // login prompt when there is no saved email to show.
  const showLoginPrompt = $derived(disconnected && messages.length === 0)

  function readPins(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch { return [] }
  }

  function persistPins(next: string[]) {
    pinnedKeys = next
    localStorage.setItem(PINNED_KEY, JSON.stringify(next))
  }

  function errorText(value: unknown): string {
    return value instanceof Error ? value.message : String(value)
  }

  function rendererErrorKind(value: unknown): 'none' | 'mail_sync_error' | 'error' | 'unknown' {
    if (value == null) return 'none'
    if (value instanceof MailSyncError) return 'mail_sync_error'
    if (value instanceof Error) return 'error'
    return 'unknown'
  }

  async function traceListBoundary(
    stage: 'load_started' | 'list_received' | 'render_observed' | 'load_failed' | 'window_error' | 'unhandled_rejection',
    generation: number,
    caught: unknown = null,
  ) {
    try {
      await mailApi.rendererListTrace({
        stage,
        generation,
        account_selection_kind: selectedAccountId === null ? 'default' : 'specific',
        account_count: accounts.length,
        query_empty: query.trim().length === 0,
        returned_count: messages.length,
        visible_count: visibleMessages.length,
        rendered_count: messageListElement?.querySelectorAll('.mail-list-thread').length || 0,
        loading,
        request_current: generation === requestGeneration,
        error_kind: rendererErrorKind(caught),
      })
    } catch { /* Diagnostic transport must never affect the Emails page. */ }
  }

  async function traceAfterRender(generation: number) {
    await tick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await traceListBoundary('render_observed', generation)
  }

  async function loadSnapshot(options: { initial?: boolean; preserveSelection?: boolean } = {}) {
    const generation = ++requestGeneration
    if (options.initial) loading = true
    error = null
    void traceListBoundary('load_started', generation)
    try {
      const [nextStatus, nextAccounts] = await Promise.all([mailApi.status(), mailApi.accounts()])
      if (generation !== requestGeneration) return
      status = nextStatus
      accounts = nextAccounts
      if (selectedAccountId && !accounts.some((account) => account.id === selectedAccountId)) selectedAccountId = null
      const nextMessages = await mailApi.messages(selectedAccountId, LIST_LIMIT)
      if (generation !== requestGeneration) return
      messages = nextMessages
      void traceListBoundary('list_received', generation)
      const selectedSummary = selectedKey ? messages.find((message) => mailMessageKey(message) === selectedKey) : null
      if (!options.preserveSelection || !selectedSummary) {
        selectedKey = null
        selectedMessage = null
        selectedSourceContents = []
        selectedSourceItemId = null
      } else if (selectedMessage) {
        selectedMessage = { ...selectedMessage, ...selectedSummary }
      }
    } catch (value) {
      if (generation === requestGeneration) {
        error = errorText(value)
        void traceListBoundary('load_failed', generation, value)
      }
    } finally {
      if (generation === requestGeneration) {
        loading = false
        void traceAfterRender(generation)
      }
    }
  }

  async function openUserMediatedCapture() {
    if (captureWindowOpening || gmailAccessSuspended) return
    captureWindowOpening = true
    error = null
    syncNotice = null
    try {
      await mailApi.openUserMediatedCapture()
      syncNotice = 'Gmail opened in a separate visible window. Browse list pages manually, select discovered rows in the adjacent queue, then choose Sync selected.'
      await loadSnapshot({ preserveSelection: true })
    } catch (value) { error = errorText(value) }
    finally { captureWindowOpening = false }
  }

  function scheduleAutomaticSyncPoll(delay = 300) {
    if (automaticSyncTimer !== null) clearTimeout(automaticSyncTimer)
    automaticSyncTimer = setTimeout(() => void pollAutomaticSyncProgress(), delay)
  }

  async function pollAutomaticSyncProgress() {
    try {
      const progress = await mailApi.syncProgress()
      automaticSyncProgress = progress
      if (progress.running) {
        scheduleAutomaticSyncPoll(400)
      } else {
        automaticSyncStarting = false
        if (progress.phase === 'finished') {
          syncNotice = progress.message || 'Automatic email synchronization finished.'
          await refreshAfterEmailChange()
        }
      }
    } catch (value) {
      automaticSyncStarting = false
      automaticSyncProgress = null
      error = errorText(value)
    }
  }

  async function synchroniseAllUnfetched() {
    if (automaticSyncStarting || automaticSyncProgress?.running || gmailAccessSuspended) return
    automaticSyncStarting = true
    automaticSyncProgress = {
      running: true, phase: 'loading_inbox', current: 0, total: 0,
      message: 'Opening Gmail…',
    }
    error = null
    syncNotice = null
    try {
      await mailApi.synchroniseAllUnfetched()
      scheduleAutomaticSyncPoll(100)
    } catch (value) {
      automaticSyncStarting = false
      automaticSyncProgress = null
      error = errorText(value)
    }
  }

  async function refreshAfterEmailChange() {
    if (emailRefreshRunning) {
      emailRefreshPending = true
      return
    }
    emailRefreshRunning = true
    try {
      do {
        emailRefreshPending = false
        const expanded = new Set(expandedThreadKeys)
        const keysBeingReloaded = [...new Set([
          ...expandedThreadKeys,
          ...(selectedKey ? [selectedKey] : []),
        ])]
        detailCache = {}
        sourceContentCache = {}
        threadContents = {}
        loadingThreadKeys = [...new Set([...loadingThreadKeys, ...keysBeingReloaded])]

        await loadSnapshot({ preserveSelection: true })

        const summariesToHydrate = messages.filter((message) => {
          const key = mailMessageKey(message)
          return expanded.has(key) || key === selectedKey
        })
        const hydrated = await Promise.all(summariesToHydrate.map(async (summary) => ({
          summary,
          contents: await mailApi.sourceContents(summary.id),
        })))
        const nextContents: Record<string, EmailSourceContent[]> = {}
        for (const { summary, contents } of hydrated) {
          const key = mailMessageKey(summary)
          nextContents[key] = contents
          if (selectedKey === key) {
            selectedSourceContents = contents
            if (selectedSourceItemId && !contents.some((source) => source.source_item_id === selectedSourceItemId)) {
              selectedSourceItemId = null
            }
          }
        }
        sourceContentCache = { ...sourceContentCache, ...nextContents }
        threadContents = { ...threadContents, ...nextContents }

        const selectedSummary = selectedKey
          ? messages.find((message) => mailMessageKey(message) === selectedKey)
          : null
        if (selectedSummary) {
          const detail = await mailApi.message(selectedSummary.id)
          const key = mailMessageKey(selectedSummary)
          detailCache = { ...detailCache, [key]: detail }
          if (selectedKey === key) selectedMessage = { ...detail, ...selectedSummary }
        }
        loadingThreadKeys = loadingThreadKeys.filter((key) => !keysBeingReloaded.includes(key))
      } while (emailRefreshPending)
    } catch (value) {
      error = errorText(value)
      loadingThreadKeys = []
    } finally {
      emailRefreshRunning = false
    }
  }

  function scheduleEmailRefresh() {
    if (emailRefreshTimer !== null) clearTimeout(emailRefreshTimer)
    emailRefreshTimer = setTimeout(() => {
      emailRefreshTimer = null
      void refreshAfterEmailChange()
    }, 100)
  }

  async function logout() {
    error = null
    try { await mailApi.logout(); await loadSnapshot({ preserveSelection: true }) }
    catch (value) { error = errorText(value) }
  }

  async function chooseAccount(accountId: string | null) {
    if (selectedAccountId === accountId) return
    selectedAccountId = accountId
    selectedKey = null
    selectedMessage = null
    selectedSourceContents = []
    selectedSourceItemId = null
    expandedThreadKeys = []
    currentPage = 1
    await loadSnapshot({ preserveSelection: false })
  }

  async function goToPage(page: number) {
    const next = Math.min(emailPagination.pageCount, Math.max(1, page))
    if (next === emailPagination.page) return
    currentPage = next
    await tick()
    messageListElement?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateQuery(value: string) {
    query = value
    currentPage = 1
  }

  async function loadSourceContents(summary: MailMessageSummary, force = false) {
    const key = mailMessageKey(summary)
    if (!force && sourceContentCache[key]) {
      if (selectedKey === key) selectedSourceContents = sourceContentCache[key]
      return
    }
    const contents = await mailApi.sourceContents(summary.id)
    sourceContentCache = { ...sourceContentCache, [key]: contents }
    if (selectedKey === key) {
      selectedSourceContents = contents
      if (selectedSourceItemId && !contents.some((source) => source.source_item_id === selectedSourceItemId)) {
        selectedSourceItemId = null
      }
    }
  }

  async function scrollToSelectedSource(sourceItemId: string) {
    await tick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (selectedSourceItemId !== sourceItemId || !mailBodyElement) return
    const target = Array.from(mailBodyElement.querySelectorAll<HTMLElement>('[data-source-item-id]'))
      .find((element) => element.dataset.sourceItemId === sourceItemId)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }


  function threadMessageCount(message: MailMessageSummary): number {
    return Math.max(
      1,
      Number(message.thread_message_count) || 0,
      Number(message.thread_message_count_hint) || 0,
    )
  }

  async function toggleThread(event: MouseEvent, summary: MailMessageSummary) {
    event.stopPropagation()
    const key = mailMessageKey(summary)
    if (expandedThreadKeys.includes(key)) {
      expandedThreadKeys = expandedThreadKeys.filter((value) => value !== key)
      return
    }
    expandedThreadKeys = [...expandedThreadKeys, key]
    if (threadContents[key] || loadingThreadKeys.includes(key)) return
    loadingThreadKeys = [...loadingThreadKeys, key]
    try {
      const contents = await mailApi.sourceContents(summary.id)
      threadContents = { ...threadContents, [key]: contents }
      sourceContentCache = { ...sourceContentCache, [key]: contents }
      if (selectedKey === key) selectedSourceContents = contents
    } catch (value) {
      expandedThreadKeys = expandedThreadKeys.filter((value) => value !== key)
      error = errorText(value)
    } finally {
      loadingThreadKeys = loadingThreadKeys.filter((value) => value !== key)
    }
  }

  async function selectMessage(summary: MailMessageSummary, sourceItemId: string | null = null) {
    const key = mailMessageKey(summary)
    const changedThread = selectedKey !== key
    selectedKey = key
    selectedSourceItemId = sourceItemId
    selectedSourceContents = sourceContentCache[key] || []
    if (changedThread) selectedMessage = null
    error = null
    detailLoading = true
    try {
      const detail = detailCache[key] || await mailApi.message(summary.id)
      detailCache = { ...detailCache, [key]: detail }
      if (selectedKey === key) selectedMessage = { ...detail, ...summary }
      await loadSourceContents(summary)
      if (sourceItemId && selectedKey === key && selectedSourceItemId === sourceItemId) {
        await scrollToSelectedSource(sourceItemId)
      }
      if (!summary.is_read) await markRead(summary, true)
    } catch (value) {
      if (selectedKey === key) error = errorText(value)
    } finally {
      if (selectedKey === key) detailLoading = false
    }
  }

  async function selectSourceMessage(summary: MailMessageSummary, source: EmailSourceContent) {
    await selectMessage(summary, source.source_item_id)
  }

  async function markRead(summary: MailMessageSummary, isRead: boolean) {
    const key = mailMessageKey(summary)
    const previous = summary.is_read
    messages = messages.map((message) => mailMessageKey(message) === key ? { ...message, is_read: isRead } : message)
    if (selectedMessage && mailMessageKey(selectedMessage) === key) selectedMessage = { ...selectedMessage, is_read: isRead }
    if (detailCache[key]) detailCache = { ...detailCache, [key]: { ...detailCache[key], is_read: isRead } }
    try { await mailApi.setRead(summary.id, isRead) }
    catch (value) {
      messages = messages.map((message) => mailMessageKey(message) === key ? { ...message, is_read: previous } : message)
      if (selectedMessage && mailMessageKey(selectedMessage) === key) selectedMessage = { ...selectedMessage, is_read: previous }
      error = errorText(value)
    }
  }

  function togglePin(summary: MailMessageSummary) {
    const key = mailMessageKey(summary)
    persistPins(pinnedKeys.includes(key) ? pinnedKeys.filter((value) => value !== key) : [...pinnedKeys, key])
  }

  function openEmailContextMenu(event: MouseEvent, message: MailMessageSummary) {
    event.preventDefault()
    contextMenu = { message, source: null, x: event.clientX, y: event.clientY }
  }

  function linkContextEmail(message: MailMessageSummary) {
    void openEntityRelationshipSearch({
      repo: 'Any', kind: 'email', entityId: message.id, title: message.subject || 'Email',
    }).catch((value) => { error = errorText(value) })
  }

  function openSourceContextMenu(event: MouseEvent, message: MailMessageSummary, source: EmailSourceContent) {
    event.preventDefault()
    event.stopPropagation()
    contextMenu = { message, source, x: event.clientX, y: event.clientY }
  }

  async function beginIgnore(message: MailMessageSummary, kind: EmailIgnoreKind) {
    if (kind === 'body_substring') {
      // Do not use window.prompt here: the native WebKit host does not present
      // JavaScript dialogs, which made the context-menu action appear inert.
      ignoreStringTarget = message
      return
    }
    await previewIgnore(message, kind)
  }

  async function previewIgnore(message: MailMessageSummary, kind: EmailIgnoreKind, value?: string) {
    ignoreLoading = true
    error = null
    try {
      ignoreTarget = { message, preview: await mailApi.previewIgnore(message.id, kind, value) }
      ignoreStringTarget = null
    } catch (caught) { error = errorText(caught) }
    finally { ignoreLoading = false }
  }

  async function confirmIgnore() {
    if (!ignoreTarget || ignoreSaving) return
    ignoreSaving = true
    error = null
    try {
      const result = await mailApi.createIgnoreRule(
        ignoreTarget.message.id, ignoreTarget.preview.kind, ignoreTarget.preview.display_value,
      )
      const reconciled = reconcileRemovedMessages(
        messages, result.removed_message_ids, selectedKey, pinnedKeys, detailCache,
      )
      messages = reconciled.messages
      selectedKey = reconciled.selectedKey
      if (!selectedKey) {
        selectedMessage = null
        selectedSourceItemId = null
      }
      detailCache = reconciled.detailCache as Record<string, MailMessage>
      persistPins(reconciled.pinnedKeys)
      ignoreTarget = null
      await loadSnapshot({ preserveSelection: true })
    } catch (value) { error = errorText(value) }
    finally { ignoreSaving = false }
  }

  async function openSignalFromEmail(message: MailMessageSummary) {
    error = null
    ruleEditorEnriching = false
    try {
      const preview = await mailApi.automationPreview(message.id)
      // Parser/Signal work is local-only. Never start Gmail acquisition as a
      // side effect of opening an automation editor.
      ruleEditor = { message, preview }
      if (preview.source.content_state === 'preview') {
        signalNotice = 'This rule uses the synchronized preview. Capture the conversation explicitly in the visible Gmail window for complete content.'
      }
    } catch (value) { error = errorText(value) }
  }

  function formatTime(timestamp: number | null): string {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
    if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
  }

  function formatFullTime(timestamp: number): string {
    return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)) : ''
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  onMount(() => {
    void (async () => {
      await loadSnapshot({ initial: true })
      if (status?.automatic_sync_running) {
        automaticSyncProgress = {
          running: true, phase: 'discovering', current: 0, total: 0,
          message: 'Resuming email synchronization progress…',
        }
        await pollAutomaticSyncProgress()
      }
    })()
    // Periodic page refresh must remain read-only. Explicit Sync is the only UI
    // action that should mutate Gmail/Surface state.
    const visible = () => {
      if (document.visibilityState === 'visible') void loadSnapshot({ preserveSelection: true })
    }
    const windowError = () => void traceListBoundary('window_error', requestGeneration, new Error())
    const unhandledRejection = () => void traceListBoundary('unhandled_rejection', requestGeneration, new Error())
    const emailSnapshotChanged = () => scheduleEmailRefresh()
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('error', windowError)
    window.addEventListener('unhandledrejection', unhandledRejection)
    window.addEventListener('arbol-email-snapshot-changed', emailSnapshotChanged)
    return () => {
      if (emailRefreshTimer !== null) clearTimeout(emailRefreshTimer)
      if (automaticSyncTimer !== null) clearTimeout(automaticSyncTimer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('error', windowError)
      window.removeEventListener('unhandledrejection', unhandledRejection)
      window.removeEventListener('arbol-email-snapshot-changed', emailSnapshotChanged)
    }
  })
</script>

<div class="mail-page">
  <aside class="mail-list-pane">
    <header class="mail-toolbar">
      <div class="mail-toolbar-top">
        <div>
          <h1>Email threads</h1>
          <p>Supervised selection from a visible, user-operated Gmail window</p>
        </div>
        <div class="mail-toolbar-actions">
          <div class="mail-automation-control">
            <button class="mail-refresh" type="button" aria-haspopup="menu" aria-expanded={automationMenuOpen} onclick={() => (automationMenuOpen = !automationMenuOpen)}>Automation ▾</button>
            {#if automationMenuOpen}
              <div class="mail-automation-menu" role="menu">
                <button type="button" role="menuitem" onclick={() => { signalRulesManagerOpen = true; automationMenuOpen = false }}>Signal Rules…</button>
                <button type="button" role="menuitem" onclick={() => { ignoredManagerOpen = true; automationMenuOpen = false }}>Ignored sources…</button>
              </div>
            {/if}
          </div>
          <button
            class="mail-refresh mail-sync-all-button"
            class:running={automaticSyncStarting || automaticSyncProgress?.running}
            type="button"
            onclick={synchroniseAllUnfetched}
            disabled={gmailAccessSuspended || automaticSyncStarting || automaticSyncProgress?.running}
          >
            {#if automaticSyncStarting || automaticSyncProgress?.running}<span class="mail-spinner"></span>{/if}
            {automaticSyncStarting || automaticSyncProgress?.running ? 'Synchronising…' : 'Sync All'}
          </button>
          <button class="mail-refresh" type="button" onclick={openUserMediatedCapture} disabled={gmailAccessSuspended || captureWindowOpening || automaticSyncProgress?.running}>
            {gmailAccessSuspended ? 'Gmail capture unavailable' : captureWindowOpening ? 'Opening visible Gmail…' : 'Synchronise Emails'}
          </button>
        </div>
      </div>
      {#if gmailAccessSuspended}
        <div class="mail-session-line"><span class="mail-session-dot disconnected"></span>Gmail access suspended for account safety</div>
      {:else if status?.user_mediated_window_open}
        <div class="mail-session-line"><span class="mail-session-dot"></span>Visible Gmail capture window open<button type="button" onclick={logout}>Clear Gmail session</button></div>
      {:else}
        <div class="mail-session-line"><span class="mail-session-dot disconnected"></span>No background Gmail activity</div>
      {/if}
      {#if accounts.length > 1}
        <div class="mail-account-tabs" role="tablist" aria-label="Mail account">
          <button class:active={selectedAccountId === null} onclick={() => chooseAccount(null)}>All inboxes</button>
          {#each accounts as account (account.id)}
            <button class:active={selectedAccountId === account.id} title={account.email} onclick={() => chooseAccount(account.id)}>{account.name || account.email}</button>
          {/each}
        </div>
      {/if}
      <label class="mail-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} oninput={(event) => updateQuery(event.currentTarget.value)} placeholder="Filter synchronized emails…" aria-label="Filter synchronized emails" />
        {#if query}<button type="button" aria-label="Clear filter" onclick={() => updateQuery('')}>×</button>{/if}
      </label>
      <div class="mail-list-meta" aria-label={`${threadCount} email ${threadCount === 1 ? 'thread' : 'threads'} containing ${emailCount} ${emailCount === 1 ? 'email' : 'emails'}`}>
        <span>{threadCount} {threadCount === 1 ? 'thread' : 'threads'}</span>
        <span>{emailCount} {emailCount === 1 ? 'email' : 'emails'}</span>
        <span>{unreadCount} unread</span>
        {#if pinnedCount}<span>{pinnedCount} pinned</span>{/if}
        {#if emailSyncStatusText(status?.sync, formatTime)}
          <time class:is-error={status?.sync.status === 'failed' || status?.sync.status === 'needs_login'} title={status?.sync.error || ''}>{emailSyncStatusText(status?.sync, formatTime)}</time>
        {/if}
      </div>
      {#if automaticSyncProgress?.running}
        <div class="mail-toolbar-sync-progress" role="status" aria-live="polite">
          <div class="mail-toolbar-sync-copy">
            <span>{mailSyncProgressLabel(automaticSyncProgress)}</span>
            {#if automaticSyncProgress.total > 0}<b>{automaticSyncProgress.current} / {automaticSyncProgress.total}</b>{/if}
          </div>
          <progress
            max={Math.max(1, automaticSyncProgress.total)}
            value={automaticSyncProgress.total > 0 ? automaticSyncProgress.current : undefined}
          ></progress>
        </div>
      {/if}
    </header>

    {#if gmailAccessSuspended}<div class="mail-banner error" role="alert">Gmail capture remains unavailable while the account-safety incident is unresolved. Existing synchronized emails remain available locally.</div>{/if}
    {#if error}<div class="mail-banner error">{error}</div>{/if}
    {#if incompleteCount > 0}
      <div class="mail-banner warning" role="status">
        There {incompleteCount === 1 ? 'is' : 'are'} {incompleteCount} incomplete email thread{incompleteCount === 1 ? '' : 's'}. Click Sync All to fetch {incompleteCount === 1 ? 'it' : 'them'}, or use Synchronise Emails for supervised recovery.
      </div>
    {/if}
    {#if syncNotice}<div class="mail-banner warning">{syncNotice}<button type="button" aria-label="Dismiss" onclick={() => (syncNotice = null)}>×</button></div>{/if}
    {#if ignoreLoading}<div class="mail-banner warning">Preparing Ignore Rule impact…</div>{/if}
    {#if signalNotice}<div class="mail-banner warning">{signalNotice}<button type="button" aria-label="Dismiss" onclick={() => (signalNotice = null)}>×</button></div>{/if}
    {#if status?.sync.status === 'failed' && status.sync.error && !error}<div class="mail-banner warning">Last sync: {status.sync.error}</div>{/if}

    <div class="mail-message-list" bind:this={messageListElement}>
      {#if loading}
        <div class="mail-empty"><span class="mail-spinner"></span><b>Loading synchronized email…</b></div>
      {:else if showLoginPrompt}
        <div class="mail-empty mail-login-empty"><div class="mail-envelope">✉</div><b>Synchronise Emails under your supervision</b><p>Open one visible Gmail window, browse list pages yourself, select discovered rows in the adjacent queue, and choose Sync selected. There is no periodic synchronization.</p><button class="mail-login large" type="button" onclick={openUserMediatedCapture}>Synchronise Emails</button></div>
      {:else if filteredMessages.length === 0}
        <div class="mail-empty"><b>{query ? 'No matching emails' : 'No synchronized emails yet'}</b><p>{query ? 'Try another filter.' : 'Use Synchronise Emails to open the visible capture window.'}</p></div>
      {:else if visibleMessages.length === 0}
        <div class="mail-empty"><b>No emails from today or yesterday</b><p>Use the page controls below to browse older synchronized email threads.</p></div>
      {:else}
        {#each visibleMessageGroups as group (group.key)}
          <div class="mail-day-separator"><span>{group.label}</span><b>{group.messages.length}</b></div>
          {#each group.messages as message (mailMessageKey(message))}
          {@const key = mailMessageKey(message)}
          {@const pinned = pinnedKeys.includes(key)}
          {@const threadCount = threadMessageCount(message)}
          {@const expanded = expandedThreadKeys.includes(key)}
          <section class="mail-list-thread" class:expanded>
            <article class="mail-row" class:selected={selectedKey === key} class:unread={!message.is_read} use:entityLinkTarget={{ repo: 'Any', kind: 'email', entityId: message.id, title: message.subject || 'Email' }} data-arbol-entity-custom-context-menu="true" oncontextmenu={(event) => openEmailContextMenu(event, message)}>
              {#if threadCount > 1}
                <button
                  class="mail-row-thread-toggle"
                  type="button"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${threadCount}-email thread`}
                  aria-expanded={expanded}
                  onclick={(event) => toggleThread(event, message)}
                ><span aria-hidden="true">›</span></button>
              {/if}
              <button class="mail-row-main" type="button" onclick={() => selectMessage(message)}>
                <span class="mail-avatar">{senderName(message.sender).slice(0, 1).toUpperCase() || '?'}</span>
                <span class="mail-row-copy">
                  <span class="mail-row-head"><b>{senderName(message.sender)}</b><time>{formatTime(message.date_received)}</time></span>
                  <span class="mail-row-subject">{message.subject || '(no subject)'}</span>
                  <span class="mail-row-preview">{messagePreview(message.preview || senderAddress(message.sender))}</span>
                  <span class="mail-row-badges">
                    {#if message.content_state !== 'complete'}
                      <span class="mail-content-warning" title="The complete email body has not been fetched yet. Capture the conversation manually from the visible Gmail window.">{message.content_state === 'partial' ? 'Partial · manual capture' : 'Preview · manual capture'}</span>
                    {/if}
                    <span class="mail-thread-count">Thread · {threadCount} {threadCount === 1 ? 'email' : 'emails'}</span>
                    {#if selectedAccountId === null && accounts.length > 1}<span>{message.account_name || message.account_email}</span>{/if}
                    {#if message.has_attachments}<span>Attachment</span>{/if}
                    {#if message.is_flagged}<span>Flagged</span>{/if}
                  </span>
                </span>
              </button>
              <div class="mail-row-actions">
                <button type="button" class:active={pinned} title={pinned ? 'Unpin in Willo' : 'Pin in Willo'} onclick={() => togglePin(message)}>{pinned ? '◆' : '◇'}</button>
                <button type="button" title={message.is_read ? 'Mark unread in Arbol' : 'Mark read in Arbol'} onclick={() => markRead(message, !message.is_read)}>{message.is_read ? '○' : '●'}</button>
              </div>
            </article>
            {#if expanded}
              <div class="mail-list-thread-items">
                {#if loadingThreadKeys.includes(key)}
                  <div class="mail-list-thread-loading"><span class="mail-spinner"></span>Loading emails…</div>
                {:else}
                  {#each [...(threadContents[key] || [])].reverse() as source (source.source_item_id)}
                    <button
                      class="mail-list-thread-item"
                      class:selected={selectedKey === key && selectedSourceItemId === source.source_item_id}
                      type="button"
                      aria-current={selectedKey === key && selectedSourceItemId === source.source_item_id ? 'true' : undefined}
                      onclick={() => selectSourceMessage(message, source)}
                      oncontextmenu={(event) => openSourceContextMenu(event, message, source)}
                    >
                      <span class="mail-avatar">{senderName(source.sender).slice(0, 1).toUpperCase() || '?'}</span>
                      <span class="mail-list-thread-copy">
                        <span><b>{senderName(source.sender)}</b><time>{formatTime(source.occurred_at)}</time></span>
                        <span>{messagePreview(source.text || source.sender_address)}</span>
                      </span>
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </section>
          {/each}
        {/each}
      {/if}
    </div>
    {#if !loading && !showLoginPrompt && filteredMessages.length > 0}
      <nav class="mail-pagination" aria-label="Email pages">
        <button type="button" aria-label="Previous email page" onclick={() => goToPage(emailPagination.page - 1)} disabled={emailPagination.page === 1}>‹</button>
        <div class="mail-pagination-pages">
          {#each pageLinks as link, index (`${link}-${index}`)}
            {#if link === 'gap'}
              <span aria-hidden="true">…</span>
            {:else}
              <button
                type="button"
                class:active={link === emailPagination.page}
                aria-current={link === emailPagination.page ? 'page' : undefined}
                aria-label={link === 1 ? 'Recent email from today and yesterday' : `Email page ${link}`}
                onclick={() => goToPage(link)}
              >{link}</button>
            {/if}
          {/each}
        </div>
        <button type="button" aria-label="Next email page" onclick={() => goToPage(emailPagination.page + 1)} disabled={emailPagination.page === emailPagination.pageCount}>›</button>
        <span class="mail-pagination-summary">
          {#if emailPagination.page === 1}
            Today &amp; yesterday · {emailPagination.recentCount} thread{emailPagination.recentCount === 1 ? '' : 's'}
          {:else}
            Page {emailPagination.page} of {emailPagination.pageCount} · {visibleMessages.length} thread{visibleMessages.length === 1 ? '' : 's'}
          {/if}
        </span>
      </nav>
    {/if}
  </aside>

  <main class="mail-detail-pane">
    {#if detailLoading && !selectedMessage}
      <div class="mail-empty"><span class="mail-spinner"></span><b>Loading email…</b></div>
    {:else if selectedMessage}
      <header class="mail-detail-head">
        <div class="mail-detail-title-row">
          <h2>{selectedMessage.subject || '(no subject)'}</h2>
          <div class="mail-detail-actions">
          </div>
        </div>
        <div class="mail-sender-line">
          <span class="mail-avatar large">{senderName(selectedMessage.sender).slice(0, 1).toUpperCase() || '?'}</span>
          <div><b>{senderName(selectedMessage.sender)}</b><span>{senderAddress(selectedMessage.sender)}</span></div>
          <time>{formatFullTime(selectedMessage.date_received)}</time>
        </div>
        <dl class="mail-addresses">
          {#if selectedMessage.to.length}<div><dt>To</dt><dd>{selectedMessage.to.join(', ')}</dd></div>{/if}
          {#if selectedMessage.cc.length}<div><dt>Cc</dt><dd>{selectedMessage.cc.join(', ')}</dd></div>{/if}
          <div><dt>Account</dt><dd>{selectedMessage.account_name}{selectedMessage.account_email ? ` · ${selectedMessage.account_email}` : ''}</dd></div>
        </dl>
        {#if selectedMessage.content_state !== 'complete'}
          <div class="mail-detail-content-warning">⚠ {selectedMessage.content_state === 'partial' ? 'Partial email' : 'Preview only'} — the complete body has not been fetched. Capture the conversation manually from the visible Gmail window.</div>
        {/if}
        {#if selectedMessage.attachments.length}<div class="mail-attachments">{#each selectedMessage.attachments as attachment}<span>{attachment.name}{attachment.file_size ? ` · ${formatBytes(attachment.file_size)}` : ''}</span>{/each}</div>{/if}
      </header>
      <div class="mail-body" bind:this={mailBodyElement}>
        {#if selectedSourceContents.length}
          <div class="mail-thread-messages">
            {#each [...selectedSourceContents].reverse() as source (source.source_item_id)}
              <article
                class="mail-acquired-message"
                class:selected={selectedSourceItemId === source.source_item_id}
                data-source-item-id={source.source_item_id}
                aria-current={selectedSourceItemId === source.source_item_id ? 'true' : undefined}
                oncontextmenu={(event) => openSourceContextMenu(event, selectedMessage!, source)}
              >
                <header><div><b>{senderName(source.sender)}</b><span>{source.sender_address}</span></div><time>{formatFullTime(source.occurred_at)}</time></header>
                <div class="mail-source-state" class:complete={source.content_state === 'rendered_complete' || source.content_state === 'raw_complete'}>{source.content_state.replace('_', ' ')}</div>
                <pre>{source.text || '(No message body was exposed by Gmail.)'}</pre>
                {#if source.content_state === 'partial' || source.content_state === 'preview'}<div class="mail-truncated">This capture is incomplete and is not suitable for Parser testing.</div>{/if}
              </article>
            {/each}
          </div>
        {:else}
          <pre>{selectedMessage.body || selectedMessage.preview || '(No body was available in the synchronized inbox row.)'}</pre>
          {#if selectedMessage.body_truncated}<div class="mail-truncated">Only the inbox preview is stored. Use Synchronise Emails, open this conversation manually in Gmail, and capture it before testing a Parser.</div>{/if}
        {/if}
      </div>
    {:else}
      <div class="mail-detail-empty"><div class="mail-envelope">✉</div><b>Select an email to read</b><p>Arbol shows the latest snapshot synchronized from your private Gmail session.</p></div>
    {/if}
  </main>
</div>


{#if contextMenu}
  <EmailContextMenu
    message={contextMenu.message}
    x={contextMenu.x}
    y={contextMenu.y}
    onForceRefetch={undefined}
    forceRefetching={false}
    onLinkEntity={() => linkContextEmail(contextMenu!.message)}
    onIgnore={contextMenu.source ? undefined : (kind) => beginIgnore(contextMenu!.message, kind)}
    onTestParser={() => (parserTestTarget = { message: contextMenu!.message, source: contextMenu!.source })}
    onSignal={contextMenu.source ? undefined : () => openSignalFromEmail(contextMenu!.message)}
    onClose={() => (contextMenu = null)}
  />
{/if}
{#if ignoreStringTarget}
  <IgnoreEmailStringModal
    message={ignoreStringTarget}
    busy={ignoreLoading}
    onSubmit={(value) => previewIgnore(ignoreStringTarget!, 'body_substring', value)}
    onClose={() => (ignoreStringTarget = null)}
  />
{/if}
{#if ignoreTarget}
  <IgnoreEmailConfirmModal preview={ignoreTarget.preview} busy={ignoreSaving} onConfirm={confirmIgnore} onClose={() => (ignoreTarget = null)} />
{/if}
{#if ignoredManagerOpen}
  <IgnoredEmailSourcesModal onClose={() => (ignoredManagerOpen = false)} onChanged={() => loadSnapshot({ preserveSelection: true })} onError={(message) => (error = message)} />
{/if}
{#if signalRulesManagerOpen}
  <SignalRulesManagerModal onClose={() => (signalRulesManagerOpen = false)} onError={(message) => (error = message)} />
{/if}
{#if parserTestTarget}
  <EmailParserTestModal message={parserTestTarget.message} source={parserTestTarget.source} onClose={() => (parserTestTarget = null)} onError={(message) => (error = message)} />
{/if}
{#if ruleEditor}
  <EmailSignalRuleModal message={ruleEditor.message} preview={ruleEditor.preview} enriching={ruleEditorEnriching} onClose={() => { ruleEditor = null; ruleEditorEnriching = false }} onSaved={() => (signalRulesManagerOpen = true)} onError={(message) => (error = message)} />
{/if}
