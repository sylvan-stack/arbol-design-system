<script lang="ts">
  /* Elma > Viewport > Elma Page — the chat surface (Svelte 5 port). The chat area
   * only ever shows ONE turn: the message pinned at top, its answer in the scroll
   * region below, the composer collapsed at the bottom. The rest of the
   * conversation is reached without spending screen space via the in-bar
   * TurnStepper (‹ Turn n / N ›), the BranchSwitcher (‹ Branch k / m ›, only at a
   * fork), and the ⌘P HistoryOverlay. Branch/edit compose state shows a warning
   * banner above the composer; Remove is guarded by a ConfirmDialog; ⇧⏎ opens
   * Quick Actions.
   *
   * States:
   *   [empty]  one centered, auto-growing composer (min 10 rows). No buttons.
   *   [active] pinned message + switcher/stepper, the answer scroll region, the
   *            collapsed composer ("Press Enter to start new message"). */
  import { KbdHint } from '@arbol/design-system'
  import type { NativeToolCallView, WorkingDirectoryChangeView } from '@arbol/events'
  import type { ActiveChild, ImageAttachment, Turn, TurnMap } from '../constants'
  import type { LocalFilePreview } from '../api'
  import type { ComposeMode } from './ElmaPage.types'
  import Composer from '../chat/Composer.svelte'
  import type { ChatTag } from '../chat/sessionTags'
  import ContextStrip from '../chat/ContextStrip.svelte'
  import PinnedMessage from '../chat/PinnedMessage.svelte'
  import AttachedContext from '../chat/AttachedContext.svelte'
  import TurnStepper from '../chat/TurnStepper.svelte'
  import ResponseView from '../chat/ResponseView.svelte'
  import AnswerBeacon from '../chat/AnswerBeacon.svelte'
  import type { ToolOutputPreviewMap } from '../chat/ResponseView.types'
  import type { AgentStatusState } from '../chat/AgentStatusBar.types'
  import ApprovalDock from '../chat/ApprovalDock.svelte'
  import type { PendingApproval } from '../chat/usePendingApprovals'
  import HistoryOverlay from '../chat/HistoryOverlay.svelte'
  import SidePanel from '../chat/SidePanel.svelte'
  import ThreadInspector from '../chat/ThreadInspector.svelte'
  import SplitColumns from '../chat/SplitColumns.svelte'
  import BranchComposeBanner from '../chat/branching/BranchComposeBanner.svelte'
  import BranchSwitcher from '../chat/branching/BranchSwitcher.svelte'
  import ConfirmDialog from '../chat/branching/ConfirmDialog.svelte'
  import QuickActions from '../quick/QuickActions.svelte'
  import Toast from '../quick/Toast.svelte'
  import type { QuickAction } from '../quick/QuickActions.types'
  import { firstLine } from '../chat/util'

  type Ref<T> = { current: T }
  type ChatNoteView = { id: string; content: string; ts: number; turnId: string }

  let {
    phase,
    activeRepo,
    sessionDir,
    sessionId,
    historyHydrated,
    ipLabel,
    thinking,
    modelLabel,
    draftRef,
    attachmentsRef,
    composerRef,
    scrollRef,
    composerKey,
    onSend,
    onDraftChange,
    onPasteChatNote,
    onRemoveDraftChatNote,
    chatNotes,
    draftChatNotes,
    turns,
    viewIndex,
    current,
    agentStatus,
    agentRunning = false,
    toolOutputPreviews,
    nativeToolCalls,
    workingDirectoryChanges,
    onOlder,
    onNewer,
    onJump,
    onOpenHistory,
    overlayOpen,
    onCloseOverlay,
    composing,
    composeMode,
    onExpandComposer,
    onScrollTop,
    onScrollBottom,
    onRetryTurn,
    onContinueFromFailure,
    onEsc,
    branchIndex,
    branchCount,
    onBranchPrev,
    onBranchNext,
    onStartEdit,
    onRequestRemove,
    pendingRemove,
    onConfirmRemove,
    onCancelRemove,
    pendingArchive,
    onConfirmArchive,
    onCancelArchive,
    pendingStopSend,
    onConfirmStopSend,
    onCancelStopSend,
    quickOpen,
    quickActions,
    onCloseQuick,
    tagDialogOpen,
    chatTags,
    knownTags,
    tagSaving,
    tagEditing,
    onApplyTags,
    onCloseTagDialog,
    toast,
    approvals,
    approvalBusy,
    onApprove,
    onApproveAlways,
    onRejectApproval,
    onSubmitAnswers,
    onCancelApproval,
    nodes,
    rootId,
    activeChild,
    path,
    searchHighlight,
    filePreview,
    filePreviewLoading,
    onOpenLocalFile,
    onCloseFilePreview,
    onFilePreviewEditingChange,
    viewFullscreen,
    onToggleViewFullscreen,
    previewNav,
    threadInspectorOpen,
    onCloseThreadInspector,
    threadInspectorContext,
  }: {
    phase: 'empty' | 'active'
    activeRepo: string
    sessionDir?: string
    sessionId?: string | null
    historyHydrated?: boolean
    ipLabel: string
    thinking: string
    modelLabel: string
    draftRef: Ref<string>
    attachmentsRef: Ref<ImageAttachment[]>
    composerRef: Ref<HTMLTextAreaElement | null>
    scrollRef: Ref<HTMLDivElement | null>
    composerKey: number
    onSend: () => void
    onDraftChange?: (change: { text: string; attachments: ImageAttachment[]; hasDraft: boolean; source: HTMLTextAreaElement | null; composerToken: number }) => boolean | void
    onPasteChatNote?: (content: string) => void
    onRemoveDraftChatNote?: (index: number) => void
    chatNotes?: ChatNoteView[]
    draftChatNotes?: string[]
    turns: Turn[]
    viewIndex: number
    current: Turn | null
    agentStatus: AgentStatusState
    agentRunning?: boolean
    toolOutputPreviews?: ToolOutputPreviewMap
    nativeToolCalls?: NativeToolCallView[]
    workingDirectoryChanges?: WorkingDirectoryChangeView[]
    onOlder: () => void
    onNewer: () => void
    onJump: (id: string) => void
    onOpenHistory: () => void
    overlayOpen: boolean
    onCloseOverlay: () => void
    composing: boolean
    composeMode: ComposeMode
    onExpandComposer: () => void
    onScrollTop: () => void
    onScrollBottom: () => void
    onRetryTurn?: () => void
    onContinueFromFailure?: () => void
    onEsc: () => void
    branchIndex: number
    branchCount: number
    onBranchPrev: () => void
    onBranchNext: () => void
    onStartEdit: () => void
    onRequestRemove: () => void
    pendingRemove: Turn | null
    onConfirmRemove: () => void
    onCancelRemove: () => void
    pendingArchive: boolean
    onConfirmArchive: () => void
    onCancelArchive: () => void
    pendingStopSend: boolean
    onConfirmStopSend: () => void
    onCancelStopSend: () => void
    quickOpen: boolean
    quickActions: QuickAction[]
    onCloseQuick: () => void
    tagDialogOpen: boolean
    chatTags: ChatTag[]
    knownTags: string[]
    tagSaving?: boolean
    tagEditing?: ChatTag | null
    onApplyTags: (tags: ChatTag[]) => void
    onCloseTagDialog: () => void
    toast: string | null
    approvals: PendingApproval[]
    approvalBusy?: Set<string>
    onApprove: (requestId: string, details?: string) => void
    onApproveAlways: (requestId: string, details?: string) => void
    onRejectApproval: (requestId: string, details?: string) => void
    onSubmitAnswers: (requestId: string, answers: Record<string, string>) => void
    onCancelApproval: (requestId: string) => void
    nodes: TurnMap
    rootId: string | null
    activeChild: ActiveChild
    path: string[]
    searchHighlight?: { query: string; role?: 'user' | 'assistant'; targetIndex?: number } | null
    filePreview?: LocalFilePreview | null
    filePreviewLoading?: boolean
    onOpenLocalFile?: (path: string) => void
    onCloseFilePreview?: () => void
    onFilePreviewEditingChange?: (editing: boolean) => void
    viewFullscreen?: boolean
    onToggleViewFullscreen?: () => void
    previewNav?: { canBack: boolean; canForward: boolean; onBack: () => void; onForward: () => void }
    threadInspectorOpen?: boolean
    onCloseThreadInspector?: () => void
    threadInspectorContext?: { repo?: string; ip?: string; model?: string; worktree?: string | null }
  } = $props()

  const multi = $derived(turns.length > 1)
  const composerHint = $derived(
    composeMode === 'branch'
      ? '⌘⏎ to create branch  ·  Esc to cancel'
      : composeMode === 'edit'
        ? '⌘⏎ to replace  ·  Esc to cancel'
        : '⌘⏎ to Send  ·  Esc to collapse',
  )
  const showRightPanel = $derived(Boolean(threadInspectorOpen || filePreview || filePreviewLoading))
  const attachedContext = $derived.by(() => {
    if (!current) return []
    const anchor = current.parentId ?? ''
    return (chatNotes ?? []).filter((note) => note.turnId === anchor && note.ts <= current.sentAt)
  })
  const pendingContext = $derived.by(() => {
    const anchor = current?.id ?? ''
    const after = current?.sentAt ?? 0
    const sessionNotes = (chatNotes ?? []).filter((note) =>
      note.turnId === anchor
      && note.ts > after
      && !turns.some((turn) => turn.parentId === anchor && turn.sentAt >= note.ts),
    )
    const draftNotes = (draftChatNotes ?? []).map((content, index) => ({
      id: `draft-chat-note-${index}`, content, ts: Number.MAX_SAFE_INTEGER, turnId: anchor, removable: true,
    }))
    return [...sessionNotes, ...draftNotes]
  })

  function removePendingChatNote(id: string) {
    const match = /^draft-chat-note-(\d+)$/.exec(id)
    if (match) onRemoveDraftChatNote?.(Number(match[1]))
  }

  const collapsedScrollButtonStyle =
    'all:unset;box-sizing:border-box;cursor:pointer;padding:var(--arbol-space-2) var(--arbol-space-3);' +
    'border-radius:var(--arbol-radius-s);border:1px solid var(--arbol-color-border);' +
    'background:var(--arbol-color-surface);color:var(--arbol-color-text-muted);' +
    'font:600 calc(var(--arbol-type-label) * 0.92)/1 var(--arbol-font-ui);white-space:nowrap'
</script>

{#snippet chatContent()}
  {#if phase === 'empty'}
    <div style="height:100%;display:grid;place-items:center;padding:var(--arbol-space-6);
                background:radial-gradient(120% 80% at 50% 0%, var(--arbol-color-accent-soft), transparent 55%)">
      <div style="width:100%;max-width:var(--arbol-text-area-max-width)">
        <ContextStrip repo={activeRepo} {ipLabel} model={modelLabel} {thinking} />
        {#if pendingContext.length > 0}
          <div style="margin-bottom:var(--arbol-space-3)">
            <AttachedContext items={pendingContext} {onOpenLocalFile} onRemove={removePendingChatNote} baseDir={sessionDir} />
          </div>
        {/if}
        {#key composerKey}
          <Composer
            valueRef={draftRef}
            {attachmentsRef}
            large
            minRows={10}
            placeholder={`Message ${activeRepo}…`}
            hint="⌘⏎ to Send"
            {onSend}
            {onDraftChange}
            {onPasteChatNote}
            autoFocus
            inputRef={composerRef}
            composerToken={composerKey}
          />
        {/key}
      </div>
    </div>
  {:else}
    <div style="height:100%;display:grid;grid-template-rows:auto 1fr auto auto;min-height:0">
      {#key current ? current.id : 'none'}
        <PinnedMessage
          text={current ? current.message : ''}
          attachments={current?.attachments || []}
          contextItems={attachedContext}
          {onOpenLocalFile}
          baseDir={sessionDir}
          onEdit={current ? onStartEdit : undefined}
          onRemove={current ? onRequestRemove : undefined}
          branchSwitcher={current && branchCount > 1 ? branchSwitcherSnippet : undefined}
          stepper={current && multi ? stepperSnippet : undefined}
        />
      {/key}
      <ResponseView
        {scrollRef}
        {sessionId}
        {historyHydrated}
        blocks={current ? current.answer : []}
        thinking={current?.thinking}
        turnId={current?.id}
        sentAt={current?.sentAt}
        startedAt={current?.startedAt}
        respondedAt={current?.respondedAt}
        {agentStatus}
        {agentRunning}
        {toolOutputPreviews}
        {nativeToolCalls}
        {workingDirectoryChanges}
        {searchHighlight}
        {onOpenLocalFile}
        baseDir={sessionDir}
        onRetry={agentStatus.kind === 'failed' ? onRetryTurn : undefined}
        onContinue={agentStatus.kind === 'failed' ? onContinueFromFailure : undefined}
      />
      <ApprovalDock
        {approvals}
        busyIds={approvalBusy}
        onRun={onApprove}
        onRunAlways={onApproveAlways}
        onReject={onRejectApproval}
        {onSubmitAnswers}
        onCancel={onCancelApproval}
      />
      <div style="position:relative;border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-bg);
                  padding:{composing ? 'var(--arbol-space-4) var(--arbol-space-6)' : '0'}">
        <AnswerBeacon {scrollRef} />
        {#if pendingContext.length > 0}
          <div style="padding:{composing ? '0 0 var(--arbol-space-3)' : 'var(--arbol-space-3) var(--arbol-space-4) 0'}">
            <AttachedContext items={pendingContext} {onOpenLocalFile} onRemove={removePendingChatNote} baseDir={sessionDir} compact={!composing} />
          </div>
        {/if}
        {#if composing}
          {#if composeMode !== 'new'}<BranchComposeBanner mode={composeMode} onCancel={onEsc} />{/if}
          {#key composerKey}
            <Composer
              valueRef={draftRef}
              {attachmentsRef}
              minRows={3}
              placeholder={`Message ${activeRepo}…`}
              hint={composerHint}
              {onSend}
              {onEsc}
              {onDraftChange}
              {onPasteChatNote}
              autoFocus
              inputRef={composerRef}
              composerToken={composerKey}
            />
          {/key}
        {:else}
          <div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:var(--arbol-space-3)">
            <button
              type="button"
              onclick={onExpandComposer}
              style="min-width:0;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;
                     background:transparent;border:none;cursor:text;padding:var(--arbol-space-4) var(--arbol-space-6);
                     color:var(--arbol-color-text-muted);font:500 var(--arbol-type-body)/1 var(--arbol-font-ui)"
            >
              Press Enter to start new message
              <KbdHint k="⏎" />
            </button>
            <div style="display:flex;align-items:center;gap:var(--arbol-space-2);padding-right:var(--arbol-space-4)">
              <button type="button" onclick={onScrollTop} title="Jump up  (⌘⇧⌥8)" aria-label="Scroll to top" style={collapsedScrollButtonStyle}>Scroll to top</button>
              <button type="button" onclick={onScrollBottom} title="Jump down  (⌘⇧⌥7)" aria-label="Scroll to bottom" style={collapsedScrollButtonStyle}>Scroll to bottom</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet branchSwitcherSnippet()}
  <BranchSwitcher index={branchIndex} total={branchCount} onPrev={onBranchPrev} onNext={onBranchNext} />
{/snippet}

{#snippet stepperSnippet()}
  <TurnStepper index={viewIndex} total={turns.length} {onOlder} {onNewer} onOpen={onOpenHistory} />
{/snippet}

{#snippet rightPanel()}
  {#if threadInspectorOpen}
    <ThreadInspector
      {sessionId}
      exchangeId={current?.id}
      onClose={() => onCloseThreadInspector?.()}
      repo={threadInspectorContext?.repo}
      ip={threadInspectorContext?.ip}
      model={threadInspectorContext?.model}
      worktree={threadInspectorContext?.worktree}
    />
  {:else}
    <SidePanel
        file={filePreview}
        loading={filePreviewLoading}
        onClose={onCloseFilePreview}
        {onOpenLocalFile}
        onEditingChange={onFilePreviewEditingChange}
        fullscreen={viewFullscreen}
        onToggleFullscreen={onToggleViewFullscreen}
        {previewNav}
        repoName={activeRepo}
        theme={document.documentElement.getAttribute('data-theme') || undefined}
    />
  {/if}
{/snippet}

<div style="position:relative;height:100%;min-height:0">
  {#if showRightPanel}
    {#if viewFullscreen && !threadInspectorOpen}
      {@render rightPanel()}
    {:else}
      <SplitColumns left={chatContent} right={rightPanel} />
    {/if}
  {:else}
    <div style="min-width:0;min-height:0;height:100%;overflow:hidden">{@render chatContent()}</div>
  {/if}

  {#if overlayOpen}
    <HistoryOverlay {nodes} {rootId} {activeChild} {path} {viewIndex} {onJump} onClose={onCloseOverlay} />
  {/if}

  {#if pendingRemove}
    <ConfirmDialog
      title="Remove this turn?"
      body={`“${firstLine(pendingRemove.message)}” and every turn after it on this branch will be permanently removed.`}
      confirmLabel="Remove"
      onConfirm={onConfirmRemove}
      onCancel={onCancelRemove}
    />
  {/if}

  {#if pendingArchive}
    <ConfirmDialog
      title="Archive this Chat Session?"
      body="This Chat Session will be moved to the archive and removed from your active sessions. If a response is running, it will be stopped first."
      confirmLabel="Archive"
      onConfirm={onConfirmArchive}
      onCancel={onCancelArchive}
    />
  {/if}

  {#if pendingStopSend}
    <ConfirmDialog
      title="Stop current response?"
      body="This chat is still marked as running. Stop the current agent response and send your new message?"
      confirmLabel="Confirm"
      onConfirm={onConfirmStopSend}
      onCancel={onCancelStopSend}
    />
  {/if}

  {#if quickOpen}<QuickActions actions={quickActions} onClose={onCloseQuick} />{/if}
  <Toast message={toast} />
</div>
