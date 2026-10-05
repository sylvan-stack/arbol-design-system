<script lang="ts">
  /* Keep-on-Top compact station card (classes from willo.css:
   * .willo-compact-card and friends). A narrow one-column row: color dot +
   * title + state icons, relative activity, status, live tail, usage, meta. */
  import { entityLinkTarget } from '@arbol/design-system'
  import type { StationSession, TokenUsage } from './stations'
  import { formatGenerationSpeed, ZERO_GENERATION_SPEED, type GenerationSpeed } from './liveTails'
  import { sessionFailureCue, sessionFailureTitle, fmtRelativeTime, fmtAgentStaleDuration, agentActivityIsStale, usageSummary, withLiveUsage, primaryRepo, stationOnGoing, stationIsUnread, stationHasDraft, sessionProviderLabel, sessionModelLabel, type IpByName } from './helpers'
  import SessionFailureCue from './SessionFailureCue.svelte'
  import SessionImageIndicator from './SessionImageIndicator.svelte'
  import SessionTitleEditor from './SessionTitleEditor.svelte'

  let { session, editing = false, saving = false, activityAt = 0, liveTail = '', liveUsage, generationSpeed, now = Date.now(), liveAgentActivityAt = 0, spacingBeforePx = 0, running = false, minimal = false, openInElma = false, ipByName = {}, onOpen, onStartEdit, onSaveTitle, onCancelEdit, onContextMenu }: {
    session: StationSession
    editing?: boolean
    saving?: boolean
    activityAt?: number
    liveTail?: string
    liveUsage?: TokenUsage
    generationSpeed?: GenerationSpeed
    now?: number
    liveAgentActivityAt?: number
    spacingBeforePx?: number
    running?: boolean
    minimal?: boolean
    openInElma?: boolean
    ipByName?: IpByName
    onOpen: (s: StationSession) => void
    onStartEdit?: (id: string) => void
    onSaveTitle?: (id: string, title: string) => void
    onCancelEdit?: () => void
    onContextMenu?: (e: MouseEvent, s: StationSession) => void
  } = $props()

  const title = $derived(session.title || 'Untitled chat')
  const speed = $derived(generationSpeed || ZERO_GENERATION_SPEED)
  const lastAgentActivityAt = $derived(Math.max(
    session.last_agent_activity_at || session.updated_at || session.created_at || 0,
    liveAgentActivityAt || 0,
  ))
  const stale = $derived(running && agentActivityIsStale(lastAgentActivityAt, now))
  const staleFor = $derived(fmtAgentStaleDuration(lastAgentActivityAt, now))
  const ongoing = $derived(stationOnGoing(session))
  const unread = $derived(stationIsUnread(session))
  const draft = $derived(stationHasDraft(session))
  const idle = $derived(!ongoing && !unread && !draft)
  const repo = $derived(primaryRepo(session))
  const provider = $derived(sessionProviderLabel(session, ipByName))
  const model = $derived(sessionModelLabel(session, ipByName))
  // The model belongs exclusively in the metadata row. Keep this footer for
  // token usage so the same model is never rendered twice on a card.
  const usage = $derived(usageSummary(withLiveUsage(session, liveUsage)))
  const draftOnly = $derived(session.entityKind === 'draft')
  const failed = $derived(String(session.status || '').toLowerCase() === 'error')
  const failureCue = $derived(sessionFailureCue(session))
  const failureTitle = $derived(sessionFailureTitle(session))
  const activityLabel = $derived(fmtRelativeTime(activityAt || session.updated_at || session.created_at) || 'No activity')
  const statusLabel = $derived(
    stale ? (minimal ? `Stale for ${staleFor}` : 'Stale')
      : running ? 'Responding'
      : failed ? 'Error'
      : draft ? 'Draft ready'
      : unread ? 'Unread'
      : 'Idle',
  )
</script>

<div
  class="willo-compact-card"
  use:entityLinkTarget={{ repo: 'Arbol', kind: 'chat', entityId: session.id, title: session.title || 'Untitled Chat Session' }}
  data-arbol-entity-custom-context-menu="true"
  role="button"
  tabindex="0"
  data-running={running ? '1' : undefined}
  data-stale={stale ? '1' : undefined}
  data-ongoing={ongoing ? '1' : undefined}
  data-unread={unread ? '1' : undefined}
  data-draft={draft ? '1' : undefined}
  data-status={String(session.status || 'unknown').toLowerCase()}
  data-minimal={minimal ? '1' : undefined}
  data-error={failed ? '1' : undefined}
  data-open-in-elma={openInElma ? '1' : undefined}
  aria-current={openInElma ? 'true' : undefined}
  aria-label={draftOnly ? `Restore ${title}` : `Open ${title}`}
  style="--session-color:{session.color || 'var(--arbol-color-accent)'};{spacingBeforePx ? `margin-top:${spacingBeforePx}px;` : ''}"
  onclick={() => { if (!editing) onOpen(session) }}
  onkeydown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(session) } }}
  oncontextmenu={(e) => onContextMenu?.(e, session)}
>
  {#if editing}
    <SessionTitleEditor value={title} busy={saving} onSave={(t) => onSaveTitle?.(session.id, t)} onCancel={() => onCancelEdit?.()} />
  {:else if minimal}
    <div class="willo-minimal-main">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions -->
      <div
        class="willo-compact-title"
        title={draftOnly ? `${title} — restore Draft in Elma` : `${title} — Cmd-click to rename`}
        onclick={(e) => { if (!draftOnly && e.metaKey && onStartEdit) { e.stopPropagation(); onStartEdit(session.id) } }}
      >{title}</div>
      {#if session.first_message_has_images}<SessionImageIndicator />{/if}
      <time class="willo-compact-activity" title={`Last activity: ${activityLabel}`}>{activityLabel}</time>
    </div>
    <div class="willo-minimal-meta">
      <span class="willo-compact-status" title={`Chat status: ${statusLabel}`}>{statusLabel}</span>
      {#if failureCue}<SessionFailureCue cue={failureCue} title={failureTitle} compact />{/if}
      {#if running}<span class="willo-minimal-speed" title="1m / 5m estimated generated tokens per minute">{formatGenerationSpeed(speed.oneMinute)}tok/min / {formatGenerationSpeed(speed.fiveMinutes)}tok/min</span>{:else}<span class="willo-minimal-repo" title={repo ? repo : 'No repository'}>{repo ? repo : 'No repo'}</span>{/if}
    </div>
  {:else}
    <div class="willo-compact-title-row">
      <span class="willo-compact-color"></span>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions -->
      <div
        class="willo-compact-title"
        title={draftOnly ? 'Restore Draft in Elma' : 'Cmd-click to rename'}
        onclick={(e) => { if (!draftOnly && e.metaKey && onStartEdit) { e.stopPropagation(); onStartEdit(session.id) } }}
      >{title}</div>
      <span class="willo-state-icons compact" aria-label="Chat state indicators">
        {#if session.first_message_has_images}<SessionImageIndicator />{/if}
        {#if ongoing}<span class="willo-state-icon is-ongoing" title="Ongoing" aria-label="Ongoing"></span>{/if}
        {#if unread}<span class="willo-state-icon is-unread" title="Unread" aria-label="Unread"></span>{/if}
        {#if draft}<span class="willo-state-icon is-draft" title="Drafted" aria-label="Drafted">✍</span>{/if}
        {#if idle}<span class="willo-state-icon is-idle" title="Idle" aria-label="Idle"></span>{/if}
      </span>
    </div>
    <div class="willo-compact-activity">{fmtRelativeTime(activityAt || session.updated_at || session.created_at)}</div>
    <div class="willo-compact-status-row">
      <span class="willo-compact-status" title={`Chat status: ${statusLabel}`}>{statusLabel}</span>
      {#if failureCue}<SessionFailureCue cue={failureCue} title={failureTitle} compact />{/if}
    </div>
  {/if}
  {#if !minimal}
    {#if running}<div class="willo-generation-speeds" title="Estimated generated tokens per minute over rolling windows"><span><b>{formatGenerationSpeed(speed.oneMinute)}tok/min</b> · 1m</span><span><b>{formatGenerationSpeed(speed.fiveMinutes)}tok/min</b> · 5m</span></div>{/if}
    {#if stale}<div class="willo-agent-inactivity" title="Time since this chat entered the stale state">Stale for {staleFor}</div>{/if}
    {#if liveTail}<div class="willo-live-tail has-tail" title={liveTail}>{liveTail}</div>{/if}
    {#if usage}<div class="willo-card-usage">↯ {usage}</div>{/if}
    <div class="willo-compact-meta">
      {#if repo}<span title={repo}>{repo}</span>{/if}
      {#if provider}<span title={provider}>{provider}</span>{/if}
      {#if model}<span title={model}>{model}</span>{/if}
    </div>
  {/if}
</div>
