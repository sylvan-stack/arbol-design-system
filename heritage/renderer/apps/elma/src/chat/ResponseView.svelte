<script lang="ts">
  /* ResponseView — the 1fr scroll region beneath the pinned message. Owns its own
   * scroll container; the inner column is capped at the reading width. Starts with
   * the LifecycleLog, then the rendered AnswerBlocks (thinking, native tool calls, prose). The live agent state shows in the
   * AgentStatusBar below the answer. (Ported from React.) */
  import type { NativeToolCallView, WorkingDirectoryChangeView } from '@arbol/events'
  import type { AnswerBlock } from '../constants'
  import type { AgentStatusState } from './AgentStatusBar.types'
  import AgentStatusBar from './AgentStatusBar.svelte'
  import CopyButton from './CopyButton.svelte'
  import { MarkdownBlocks } from '@arbol/design-system'
  import LifecycleLog from './LifecycleLog.svelte'
  import ThinkingBlock from './ThinkingBlock.svelte'
  import NativeToolCallRow from './NativeToolCallRow.svelte'
  import AnswerThreshold from './AnswerThreshold.svelte'
  import type { TextHighlightSpec } from '@arbol/design-system'
  import type { ToolOutputPreviewMap } from './ResponseView.types'
  import { finalAnswerStartIndex, finalAnswerText, normalizeThinking, mergeNativeFallback, nativeToolOutputPreview, normalizeSettledAnswerOrder } from './responseView'
  import { loadChatScrollPosition, saveChatScrollPosition } from '../app/scroll-cache'
  import { untrack } from 'svelte'
  import { finalAnswerOpeningSpacer, responseIsCompleted, scrolledToBottom, scrolledUp } from './autoscroll'

  let {
    scrollRef,
    sessionId,
    historyHydrated = true,
    blocks,
    thinking,
    turnId,
    sentAt,
    startedAt,
    respondedAt,
    agentStatus,
    agentRunning = false,
    toolOutputPreviews = {},
    nativeToolCalls = [],
    workingDirectoryChanges = [],
    searchHighlight,
    onOpenLocalFile,
    baseDir,
    onRetry,
    onContinue,
  }: {
    scrollRef: { current: HTMLDivElement | null }
    /** Session identity scopes the saved reading position. */
    sessionId?: string | null
    /** The initial bounded transcript page has seeded the render fold. */
    historyHydrated?: boolean
    blocks: AnswerBlock[]
    thinking?: string | string[]
    turnId?: string
    sentAt?: number
    startedAt?: number
    respondedAt?: number | null
    agentStatus?: AgentStatusState
    agentRunning?: boolean
    toolOutputPreviews?: ToolOutputPreviewMap
    /** Native tool executions for THIS turn (the observational track). New folded
     *  transcripts already include these as inline `native` answer blocks; this
     *  prop remains a compatibility fallback for stories/live views that have not
     *  embedded them yet. */
    nativeToolCalls?: NativeToolCallView[]
    workingDirectoryChanges?: WorkingDirectoryChangeView[]
    searchHighlight?: { query: string; role?: 'user' | 'assistant'; targetIndex?: number } | null
    onOpenLocalFile?: (path: string) => void
    /** Working directory of the chat session — relative links in the agent's
     *  response resolve against it. */
    baseDir?: string
    onRetry?: () => void
    onContinue?: () => void
  } = $props()

  // The PARENT owns scrollRef ({current}); populate it from our local DOM node.
  let scrollEl = $state<HTMLDivElement | null>(null)
  $effect(() => {
    const el = scrollEl
    if (scrollRef) scrollRef.current = el
    return () => {
      if (scrollRef?.current === el) scrollRef.current = null
    }
  })

  let openedResponseKey: string | null = null
  let autoscrollResponseKey: string | null = null
  let pendingFinalAnswerResponseKey: string | null = null
  let releasedFinalAnswerResponseKey: string | null = null
  let liveFollowingResponseKey: string | null = null
  let liveFollowing = true
  let finalAnswerOpeningSpacerHeight = $state(0)

  // Keep each chat at its own reading position. ResponseView is removed while a
  // different session hydrates, so cleanup captures the outgoing session and the
  // new instance restores after its response DOM has completed layout. Ignore
  // scroll events during restoration to avoid replacing a saved offset with the
  // browser's temporary zero position. Search navigation intentionally wins over
  // restoration because it has an explicit target.
  $effect(() => {
    const el = scrollEl
    const id = sessionId
    const responseId = turnId
    if (!el || !id || !responseId) return

    // Session identity can change one render before its folded Turn does. Include
    // both values so that stale outgoing response DOM cannot claim the new chat's
    // opening position or allow its cached bottom offset to win hydration.
    const responseKey = `${id}:${responseId}`
    const opening = openedResponseKey !== responseKey
    openedResponseKey = responseKey
    let restoring = !opening
      && pendingFinalAnswerResponseKey !== responseKey
      && responseIsCompleted(untrack(() => respondedAt))
      && !searchHighlight?.query
    let restored = false
    let secondFrame = 0
    const firstFrame = restoring
      ? requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            el.scrollTop = loadChatScrollPosition(localStorage, id)
            restored = true
            restoring = false
          })
        })
      : 0

    const save = () => {
      if (!restoring) saveChatScrollPosition(localStorage, id, el.scrollTop)
    }
    el.addEventListener('scroll', save, { passive: true })

    return () => {
      if (firstFrame) cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
      el.removeEventListener('scroll', save)
      // If restoration ran, or this view was opened for a search target, its
      // current position is authoritative. A view removed before its first layout
      // keeps the previously saved value instead of overwriting it with zero.
      if (restored || !restoring) saveChatScrollPosition(localStorage, id, el.scrollTop)
    }
  })

  // ResponseView is the sole owner of response scrolling. Live responses follow
  // the bottom until the user scrolls up (and resume when the user returns to the
  // bottom). An already-completed response gets a different opening operation:
  // wait for its final-answer separator to render, make that position reachable,
  // and keep it at the viewport top until the user's first deliberate scroll.
  $effect(() => {
    const el = scrollEl
    const responseId = turnId
    const id = sessionId
    const searching = Boolean(searchHighlight?.query)
    const completed = responseIsCompleted(respondedAt)
    const hydrated = historyHydrated
    if (!el || !responseId || !id || searching) return

    const responseKey = `${id}:${responseId}`
    const opening = autoscrollResponseKey !== responseKey
    autoscrollResponseKey = responseKey
    if (opening) {
      // Do not decide from the fast/latest-turn paint. Some sessions briefly
      // expose an in-flight-looking or stale Turn while their full fold hydrates.
      // Keep the opening request pending and decide only from the hydrated Turn.
      pendingFinalAnswerResponseKey = responseKey
      releasedFinalAnswerResponseKey = null
      liveFollowingResponseKey = responseKey
      liveFollowing = true
    }
    if (hydrated && !completed && pendingFinalAnswerResponseKey === responseKey) {
      // This really is a live response, not a completed chat in its loading
      // shell. It should follow the bottom and must not jump to the separator
      // when that same live response eventually completes.
      pendingFinalAnswerResponseKey = null
    }

    // Applying the spacer updates Svelte state. Keep its measurement local and
    // untracked so that update cannot restart this effect and turn a completed
    // response into bottom-follow mode.
    let openingSpacerHeight = opening ? 0 : untrack(() => finalAnswerOpeningSpacerHeight)
    if (opening) finalAnswerOpeningSpacerHeight = 0

    let following = !completed
      && liveFollowingResponseKey === responseKey
      && liveFollowing
    let locatingOpenedFinalAnswer = hydrated
      && completed
      && pendingFinalAnswerResponseKey === responseKey
      && releasedFinalAnswerResponseKey !== responseKey
    let previousTop = el.scrollTop
    let frame = 0

    const scrollToBottom = () => {
      if (!following) return
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      previousTop = el.scrollTop
    }

    const positionOpenedFinalAnswer = () => {
      if (!locatingOpenedFinalAnswer) return
      const target = el.querySelector<HTMLElement>('[data-answer-threshold]')
      if (!target) {
        // A completed session first paints as an empty shell while the latest Turn
        // hydrates. Do not flash the bottom during that interval: the only valid
        // opening destination is the separator that is about to render.
        return
      }

      const desiredTop = Math.max(
        0,
        el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top,
      )
      const requiredSpacer = finalAnswerOpeningSpacer(
        desiredTop,
        el.scrollHeight,
        el.clientHeight,
        openingSpacerHeight,
      )
      if (Math.abs(requiredSpacer - openingSpacerHeight) > 0.5) {
        openingSpacerHeight = requiredSpacer
        finalAnswerOpeningSpacerHeight = requiredSpacer
        // The spacer is rendered after this effect. Retry on a later frame rather
        // than assigning a scrollTop that the browser would clamp to the bottom.
        requestAnimationFrame(scheduleLayoutScroll)
        return
      }

      el.scrollTop = desiredTop
      previousTop = el.scrollTop
      const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top
      if (Math.abs(delta) > 1) requestAnimationFrame(scheduleLayoutScroll)
      // Keep the separator at the top through delayed markdown, image, and font
      // layout. The first deliberate user scroll releases this opening anchor;
      // programmatic scroll events from the assignment above do not release it.
    }

    const scheduleLayoutScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (locatingOpenedFinalAnswer) positionOpenedFinalAnswer()
        else scrollToBottom()
      })
    }

    const onScroll = () => {
      const currentTop = el.scrollTop
      if (following && scrolledUp(previousTop, currentTop)) {
        following = false
        liveFollowing = false
      } else if (!following && !completed && scrolledToBottom(currentTop, el.scrollHeight, el.clientHeight)) {
        following = true
        liveFollowing = true
      }
      previousTop = currentTop
    }
    const releaseOpenedFinalAnswer = () => {
      if (!locatingOpenedFinalAnswer) return
      locatingOpenedFinalAnswer = false
      pendingFinalAnswerResponseKey = null
      releasedFinalAnswerResponseKey = responseKey
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        following = false
        liveFollowing = false
      }
      if (event.deltaY !== 0) releaseOpenedFinalAnswer()
    }
    const onTouchStart = () => { releaseOpenedFinalAnswer() }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === el) releaseOpenedFinalAnswer()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!locatingOpenedFinalAnswer) return
      const scrollKey = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
      const elmaScrollShortcut = event.metaKey && event.altKey && event.shiftKey
        && (event.code === 'Digit7' || event.code === 'Digit8')
      if (scrollKey || elmaScrollShortcut) releaseOpenedFinalAnswer()
    }

    // Mutations cover delayed response hydration; resize covers markdown and font
    // layout as well as every kind of streamed block growth.
    const content = el.firstElementChild
    const resizeObserver = new ResizeObserver(scheduleLayoutScroll)
    const mutationObserver = new MutationObserver(scheduleLayoutScroll)
    resizeObserver.observe(el)
    if (content) {
      resizeObserver.observe(content)
      mutationObserver.observe(content, { childList: true, subtree: true })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('keydown', onKeyDown, true)

    scheduleLayoutScroll()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  })

  const legacyThinking = $derived(blocks.some((b) => b.t === 'thinking') ? [] : normalizeThinking(thinking))
  const baseRenderBlocks = $derived<AnswerBlock[]>(
    legacyThinking.length
      ? [...legacyThinking.map((v) => ({ t: 'thinking' as const, v })), ...blocks]
      : blocks,
  )
  const mergedRenderBlocks = $derived(mergeNativeFallback(baseRenderBlocks, nativeToolCalls, sentAt, startedAt, respondedAt))
  // The native observational track may seal after the provider cycle whose prose
  // used its result. Once the turn is settled, preserve the semantic boundary
  // even if that late durable event sorted after the final answer.
  const renderBlocks = $derived(
    respondedAt === null ? mergedRenderBlocks : normalizeSettledAnswerOrder(mergedRenderBlocks),
  )
  const thinkingTotal = $derived(renderBlocks.reduce((n, b) => n + (b.t === 'thinking' ? 1 : 0), 0))
  // Wait until the turn settles so a later tool cycle cannot make a streaming
  // boundary jump. Historic/mock turns omit respondedAt and are already settled.
  const answerStartIndex = $derived(respondedAt === null ? -1 : finalAnswerStartIndex(renderBlocks))
  const activityBlocks = $derived(answerStartIndex >= 0 ? renderBlocks.slice(0, answerStartIndex) : renderBlocks)
  const finalBlocks = $derived(answerStartIndex >= 0 ? renderBlocks.slice(answerStartIndex) : [])
  // Copy only the final user-facing answer. `renderBlocks` includes the legacy
  // fallback tracks, so this also excludes thinking and native tool calls there.
  const copyableFinalAnswer = $derived(finalAnswerText(finalBlocks))
  const thinkingIndexAt = (idx: number) =>
    renderBlocks.slice(0, idx + 1).reduce((n, b) => n + (b.t === 'thinking' ? 1 : 0), 0)

  // Native calls emitted together have no durable batch id. Invocation events for
  // one parallel CLI batch arrive nearly simultaneously, so use a deliberately
  // narrow window only for the explanatory "N of M running" monitor cue.
  const PARALLEL_NATIVE_WINDOW_MS = 1_000
  const nativeBatchFor = (call: NativeToolCallView): NativeToolCallView[] =>
    renderBlocks
      .filter((b): b is Extract<AnswerBlock, { t: 'native' }> => b.t === 'native')
      .map((b) => b.call)
      .filter((candidate) =>
        candidate.turn_id === call.turn_id &&
        Math.abs(candidate.invoked_ts - call.invoked_ts) <= PARALLEL_NATIVE_WINDOW_MS,
      )

  // A fresh ordinal counter per render pass (React reset highlightCounter.current
  // = 0 on every render). Deriving it from the inputs that drive a re-render gives
  // each HighlightedText a stable, globally-ordered ordinal starting at 0.
  const activeHighlight = $derived.by<TextHighlightSpec | null>(() => {
    void renderBlocks // re-create the counter when the rendered content changes
    void searchHighlight
    return searchHighlight?.query && (!searchHighlight.role || searchHighlight.role === 'assistant')
      ? { query: searchHighlight.query, targetIndex: searchHighlight.targetIndex, counter: { current: 0 } }
      : null
  })

  // Center the active search hit once it has rendered (matches the React effect:
  // re-run on query/targetIndex/turn change).
  $effect(() => {
    void activeHighlight?.query
    void activeHighlight?.targetIndex
    void turnId
    if (!activeHighlight?.query || !scrollEl) return
    const scroller = scrollEl
    const target =
      scroller.querySelector<HTMLElement>('[data-elma-search-hit="target"]') ||
      scroller.querySelector<HTMLElement>('.elma-search-hit')
    if (!target) return
    requestAnimationFrame(() => {
      const top = target.offsetTop - scroller.clientHeight / 2 + target.offsetHeight / 2
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
  })
</script>

<div bind:this={scrollEl} style="min-height:0;overflow:auto">
  <div style="max-width:var(--arbol-text-area-max-width);margin:0 auto;padding:var(--arbol-space-5) var(--arbol-space-6) var(--arbol-space-6)">
    <LifecycleLog {sentAt} {startedAt} {respondedAt} />
    <!-- Render whatever answer/thinking blocks have arrived in stream order;
         live/terminal agent state is centralized in the status bar below. -->
    {#if renderBlocks.length > 0}
      <div style="color:var(--arbol-color-text);font-size:var(--arbol-content-font-size);line-height:1.65">
        <MarkdownBlocks
          blocks={activityBlocks}
          copyableBlocks
          highlight={activeHighlight}
          {onOpenLocalFile}
          {baseDir}
        >
          {#snippet renderThinking(block, i)}
            <ThinkingBlock
              text={block.v}
              responding={respondedAt === null}
              index={thinkingIndexAt(i)}
              total={thinkingTotal}
              highlight={activeHighlight}
            />
          {/snippet}
          {#snippet renderNative(block)}
            {@const batch = nativeBatchFor(block.call)}
            <NativeToolCallRow
              call={block.call}
              chatSessionId={sessionId}
              outputPreview={nativeToolOutputPreview(block.call, toolOutputPreviews)}
              batchSize={batch.length}
              batchPosition={batch.findIndex((candidate) => candidate.tool_use_id === block.call.tool_use_id) + 1}
            />
          {/snippet}
        </MarkdownBlocks>
        {#if answerStartIndex >= 0}
          <!-- The opening target owns both the separator and answer so its top is
               exactly the separator's top, not the first prose line below it. -->
          <div data-final-answer-start>
            <AnswerThreshold />
            <MarkdownBlocks
              blocks={finalBlocks}
              copyableBlocks
              highlight={activeHighlight}
              {onOpenLocalFile}
              {baseDir}
            />
          </div>
        {/if}
      </div>
    {/if}
    {#each workingDirectoryChanges.filter((change) => !turnId || change.turn_id === turnId) as change (`${change.ts}:${change.worktree_path}`)}
      <div class="working-directory-change" role="status">
        <span>Working Dir was changed to <strong>{change.worktree_path}</strong></span>
      </div>
    {/each}
    {#if agentStatus}
      <div style="display:flex;align-items:baseline;gap:var(--arbol-space-3);margin-top:var(--arbol-space-3);padding-top:var(--arbol-space-2)">
        <AgentStatusBar status={agentStatus} running={agentRunning} {onRetry} {onContinue} />
        {#if answerStartIndex >= 0}
          <CopyButton text={copyableFinalAnswer} label="Copy answer" disabled={!copyableFinalAnswer} />
        {/if}
      </div>
    {/if}
    {#if finalAnswerOpeningSpacerHeight > 0}
      <div data-final-answer-opening-spacer aria-hidden="true" style:height={`${finalAnswerOpeningSpacerHeight}px`}></div>
    {/if}
  </div>
</div>

<style>
  .working-directory-change {
    display: flex;
    align-items: center;
    gap: var(--arbol-space-3);
    margin: var(--arbol-space-5) 0 var(--arbol-space-3);
    color: var(--arbol-color-text-muted);
    font: 600 var(--arbol-type-label)/1.4 var(--arbol-font-ui);
  }
  .working-directory-change::before,
  .working-directory-change::after {
    content: '';
    height: 1px;
    flex: 1;
    background: var(--arbol-color-border);
  }
  .working-directory-change span {
    max-width: 80%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .working-directory-change strong { color: var(--arbol-color-text); }
</style>
