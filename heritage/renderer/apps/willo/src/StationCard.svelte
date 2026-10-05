<script lang="ts">
  import { Dot, entityLinkTarget } from '@arbol/design-system'
  import type { StationSession, TokenUsage } from './stations'
  import { formatGenerationSpeed, ZERO_GENERATION_SPEED, type GenerationSpeed } from './liveTails'
  import { sessionFailureCue, sessionFailureTitle, fmtRelativeTime, fmtAgentStaleDuration, agentActivityIsStale, usageSummary, withLiveUsage, primaryRepo, stationIsRunning, stationOnGoing, stationIsUnread, stationHasDraft, sessionProviderLabel, sessionModelLabel, type IpByName } from './helpers'
  import SessionFailureCue from './SessionFailureCue.svelte'
  import SessionImageIndicator from './SessionImageIndicator.svelte'
  import SessionTitleEditor from './SessionTitleEditor.svelte'

  let { session, onOpen, liveTail = '', liveUsage, generationSpeed, now = Date.now(), liveAgentActivityAt = 0, ipByName = {}, openInElma = false, editing = false, saving = false, compact = false, onStartEdit, onSaveTitle, onCancelEdit, onContextMenu }: {
    session: StationSession
    onOpen: (s: StationSession) => void
    /** Last streamed characters of the running agent response (liveTails.ts). */
    liveTail?: string
    /** Cumulative Provider usage reported during the current running turn. */
    liveUsage?: TokenUsage
    /** Rolling estimated-token rates while this session is running. */
    generationSpeed?: GenerationSpeed
    /** Reactive clock and latest transient progress observed by Willo. */
    now?: number
    liveAgentActivityAt?: number
    ipByName?: IpByName
    /** This Chat Session is currently attached in Elma Chat. */
    openInElma?: boolean
    /** Inline title editor open on this card (Cmd-click the title). */
    editing?: boolean
    saving?: boolean
    /** Render at 70% density for the non-ongoing “Other chats” section. */
    compact?: boolean
    onStartEdit?: (id: string) => void
    onSaveTitle?: (id: string, title: string) => void
    onCancelEdit?: () => void
    onContextMenu?: (e: MouseEvent, s: StationSession) => void
  } = $props()

  const running = $derived(stationIsRunning(session))
  const speed = $derived(generationSpeed || ZERO_GENERATION_SPEED)
  // Prefer durable agent progress, overlay it with transient streamed progress,
  // and only fall back to updated_at for sessions created before Core recorded
  // agent activity separately. This avoids both an immediate false Stale state
  // on card mount and metadata edits resetting an established stale clock.
  const lastAgentActivityAt = $derived(Math.max(
    session.last_agent_activity_at || session.updated_at || session.created_at || 0,
    liveAgentActivityAt || 0,
  ))
  const stale = $derived(running && agentActivityIsStale(lastAgentActivityAt, now))
  const staleFor = $derived(fmtAgentStaleDuration(lastAgentActivityAt, now))
  const ongoing = $derived(stationOnGoing(session))
  const unread = $derived(stationIsUnread(session))
  const draft = $derived(stationHasDraft(session))
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
  const statusLabel = $derived(
    stale ? 'Stale'
      : running ? 'Responding'
      : failed ? 'Error'
      : draft ? 'Draft ready'
      : unread ? 'New response'
      // `onGoing` is a user-curated radar/pinning flag, not a live session
      // status. An idle pinned chat must still be labelled Idle; the star badge
      // below communicates that it is tracked as on-going.
      : 'Idle',
  )
  const statusColor = $derived(
    stale ? 'var(--arbol-color-text-muted)'
      : running ? 'var(--arbol-color-accent)'
      : failed ? 'var(--arbol-color-err)'
      : unread ? 'var(--arbol-color-ok)'
      : 'var(--arbol-color-text-muted)',
  )
</script>

<!-- Root is a div (not a button): the inline title editor nests an input +
     buttons, which is invalid markup inside a button element. -->
<div
  class="station-card"
  use:entityLinkTarget={{ repo: 'Arbol', kind: 'chat', entityId: session.id, title: session.title || 'Untitled Chat Session' }}
  data-arbol-entity-custom-context-menu="true"
  role="button"
  tabindex="0"
  data-running={running}
  data-stale={stale}
  data-unread={unread}
  data-draft={draft}
  data-error={failed}
  data-compact={compact}
  data-open-in-elma={openInElma ? '1' : undefined}
  aria-current={openInElma ? 'true' : undefined}
  style="--session-color:{session.color || 'var(--arbol-color-accent)'}"
  aria-label={draftOnly ? `Restore ${session.title || 'Draft'}` : `Open ${session.title || 'Untitled chat'}`}
  onclick={() => { if (!editing) onOpen(session) }}
  onkeydown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(session) } }}
  oncontextmenu={(e) => onContextMenu?.(e, session)}
>
  <span class="state-rail" aria-hidden="true"></span>
  <span class="card-topline">
    <span class="state-icon"><Dot color={statusColor} pulse={running && !stale} /></span>
    {#if failureCue}<SessionFailureCue cue={failureCue} title={failureTitle} compact={compact} />{/if}
    <span class="card-status">{statusLabel}</span>
    {#if stale}<span class="stale-badge" title="No agent progress in the last five minutes">Stale for {staleFor}</span>{/if}
    {#if session.first_message_has_images}<SessionImageIndicator />{/if}
    {#if ongoing}<span class="card-badge" title="On-going">★</span>{/if}
    {#if draft}<span class="card-badge" title="Has draft">✎</span>{/if}
    {#if session.updated_at}<time class="card-time">{fmtRelativeTime(session.updated_at)}</time>{/if}
  </span>

  {#if editing}
    <SessionTitleEditor
      value={session.title || 'Untitled chat'}
      busy={saving}
      onSave={(t) => onSaveTitle?.(session.id, t)}
      onCancel={() => onCancelEdit?.()}
    />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <strong
      class="card-title"
      title={draftOnly ? 'Restore Draft in Elma' : 'Cmd-click to rename'}
      onclick={(e) => { if (!draftOnly && e.metaKey && onStartEdit) { e.stopPropagation(); onStartEdit(session.id) } }}
    >{session.title || 'Untitled chat'}</strong>
  {/if}

  {#if draftOnly && session.draftText}
    <span class="draft-preview" title={session.draftText}>{session.draftText}</span>
  {/if}
  <span class="card-meta">
    {#if provider}<span>{provider}</span>{/if}
    {#if provider && repo}<span class="meta-separator">·</span>{/if}
    {#if repo}<span class="truncate">{repo}</span>{/if}
    {#if (provider || repo) && model}<span class="meta-separator">·</span>{/if}
    {#if model}<span class="truncate">{model}</span>{/if}
  </span>
  <!-- Keep recorded usage ahead of the optional running-only blocks. If a
       host constrains card height, token counts win over the live-tail preview. -->
  {#if usage}<span class="card-usage" title={usage}>{usage}</span>{/if}
  {#if running}
    <span class="generation-speeds" title="Estimated generated tokens per minute over rolling windows">
      <span><b>{formatGenerationSpeed(speed.oneMinute)}tok/min</b> <small>1m</small></span>
      <span><b>{formatGenerationSpeed(speed.fiveMinutes)}tok/min</b> <small>5m</small></span>
    </span>
    {#if liveTail}<span class="card-tail has-tail" title={liveTail}>{liveTail}</span>{/if}
  {/if}
</div>

<style>
  .station-card { position:relative; display:flex; flex-direction:column; gap:10px; min-width:0; min-height:142px; overflow:hidden; padding:var(--arbol-space-4) var(--arbol-space-4) var(--arbol-space-4) 18px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface); box-shadow:var(--arbol-shadow-1); color:var(--arbol-color-text); font-family:var(--arbol-font-ui); text-align:left; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease; }
  .station-card[data-open-in-elma="1"] { outline:2px solid var(--arbol-color-accent); outline-offset:-2px; border-color:color-mix(in oklch, var(--arbol-color-accent) 68%, var(--arbol-color-border)) !important; background:radial-gradient(120% 90% at 12% 0%, color-mix(in srgb, var(--arbol-color-accent) 14%, transparent), transparent 58%), linear-gradient(color-mix(in srgb, var(--arbol-color-accent) 10%, transparent), color-mix(in srgb, var(--arbol-color-accent) 10%, transparent)), var(--arbol-color-surface) !important; box-shadow:var(--arbol-shadow-2), 0 0 0 1px color-mix(in oklch, var(--arbol-color-accent) 34%, transparent), 0 10px 28px -18px var(--arbol-color-accent) !important; }
  .station-card[data-open-in-elma="1"] .card-title { color:color-mix(in oklch, var(--arbol-color-accent) 34%, var(--arbol-color-text)); }
  .stale-badge { padding:3px 6px; border:1px solid var(--arbol-color-border); border-radius:99px; background:var(--arbol-color-surface-2); color:var(--arbol-color-text-muted); font:750 8px/1 var(--arbol-font-mono); letter-spacing:.45px; text-transform:uppercase; }
  .station-card:hover { transform:translateY(-2px); border-color:var(--arbol-color-text-muted); box-shadow:var(--arbol-shadow-2); }
  /* 70% density variant used only by Other chats. Scale every fixed part of
     the card rather than using transform:scale(), which would leave oversized
     grid hitboxes and gaps. */
  .station-card[data-compact="true"] { gap:7px; min-height:99.4px; padding:11.2px 11.2px 11.2px 12.6px; border-radius:calc(var(--arbol-radius-l) * .7); }
  .station-card[data-compact="true"] .state-rail { width:2.8px; }
  .station-card[data-compact="true"] .card-topline { gap:5px; }
  .station-card[data-compact="true"] .card-status { font-size:7px; letter-spacing:.385px; }
  .station-card[data-compact="true"] .card-badge { font-size:8px; }
  .station-card[data-compact="true"] .card-time,
  .station-card[data-compact="true"] .card-meta,
  .station-card[data-compact="true"] .card-usage,
  .station-card[data-compact="true"] .card-tail { font-size:calc(var(--arbol-type-label) * .7); }
  .station-card[data-compact="true"] .card-title { font-size:11.2px; }
  .station-card[data-compact="true"] .card-meta,
  .station-card[data-compact="true"] .card-usage { gap:4.2px; }
  .station-card[data-compact="true"] .card-tail { padding-top:calc(var(--arbol-space-2) * .7); min-height:.945em; }

  .station-card:focus-visible { outline:2px solid var(--arbol-color-accent); outline-offset:2px; }
  /* Keyboard focus only — a click must not leave a permanent accent ring
     around the card (the root is a div[tabindex], which WebKit happily keeps
     focused after a mouse press). */
  .station-card:focus:not(:focus-visible) { outline:none; }
  .state-rail { position:absolute; inset:0 auto 0 0; width:4px; background:transparent; }
  .station-card[data-running="true"] { border-color:color-mix(in srgb, var(--arbol-color-accent) 45%, var(--arbol-color-border)); background:color-mix(in srgb, var(--arbol-color-accent) 5%, var(--arbol-color-surface)); }
  .station-card[data-stale="true"] { border-color:color-mix(in oklch, var(--arbol-color-text-muted) 65%, var(--arbol-color-border)); background:color-mix(in oklch, var(--arbol-color-text-muted) 5%, var(--arbol-color-surface)); filter:saturate(.72); }
  /* No static rail while running — the traveling scanner + breathing ring
     are the running signal (pre-port look); a solid accent bar glued to the
     left border reads as a foreign element. The rail stays for
     unread/draft/error states. */
  .station-card[data-running="true"] .state-rail { display:none; }
  .card-tail.has-tail { animation-duration:1.6s !important; animation-iteration-count:infinite !important; }
  /* Running animation, restored from the pre-port card: breathing glow +
     scanner pill down the left edge + diagonal sheen sweep. The keyframes are
     global (willo.css) and shared with the compact card. The !importants are
     load-bearing: tokens.css crushes every animation-duration to .001ms under
     prefers-reduced-motion, and macOS Reduce Motion is on — these shorthands
     out-cascade it (higher specificity among !important), exactly like the
     pre-port willo.css did. */
  .station-card[data-running="true"] { isolation:isolate; animation:willo-running-card-pulse 3.4s ease-in-out infinite !important; }
  .station-card[data-stale="true"] { animation:none !important; box-shadow:var(--arbol-shadow-1); }
  .station-card[data-stale="true"]::before,
  .station-card[data-stale="true"]::after { content:none; display:none; animation:none !important; }
  .station-card[data-stale="true"] .card-tail { animation:none !important; }
  .station-card[data-running="true"] > :global(:not(.state-rail)) { position:relative; z-index:3; }
  .station-card[data-running="true"]::before {
    content:''; position:absolute; z-index:6; left:0; top:var(--arbol-radius-l); width:10px; height:48px; border-radius:999px;
    --willo-running-scan-inset:var(--arbol-radius-l);
    --willo-running-scan-height:48px;
    background:#fff;
    box-shadow:0 0 0 2px var(--session-color, var(--arbol-color-accent)), 0 0 22px 5px var(--session-color, var(--arbol-color-accent));
    animation:willo-running-regular-card-accent-scan 3.0s linear infinite !important;
    pointer-events:none;
  }
  .station-card[data-running="true"]::after {
    content:''; position:absolute; z-index:2; top:-40%; bottom:-40%; left:-55%; width:36%;
    background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.10) 18%, rgba(255,255,255,.42) 50%, rgba(255,255,255,.10) 82%, transparent 100%);
    mix-blend-mode:screen; opacity:0; transform:translateX(-170%) skewX(-18deg);
    animation:willo-running-regular-card-sheen-real 6.0s ease-in-out infinite !important;
    pointer-events:none;
  }
  .station-card[data-unread="true"] .state-rail { background:var(--arbol-color-ok); }
  .station-card[data-draft="true"] .state-rail { background:var(--arbol-color-text-muted); }
  .station-card[data-error="true"] .state-rail { background:var(--arbol-color-err); }
  .card-topline { display:flex; align-items:center; gap:7px; width:100%; min-width:0; }
  .state-icon { display:inline-flex; align-items:center; }
  .card-status { color:var(--arbol-color-text-muted); font:600 10px/1 var(--arbol-font-mono); letter-spacing:.55px; text-transform:uppercase; }
  .station-card[data-running="true"] .card-status { color:var(--arbol-color-accent); }
  .station-card[data-unread="true"] .card-status { color:var(--arbol-color-ok); }
  .station-card[data-error="true"] .card-status { color:var(--arbol-color-err); }
  .card-badge { color:var(--arbol-color-accent); font-size:11px; }
  .card-time { margin-left:auto; color:var(--arbol-color-text-muted); font:500 var(--arbol-type-label)/1 var(--arbol-font-mono); white-space:nowrap; }
  .card-title { display:-webkit-box; overflow:hidden; color:var(--arbol-color-text); font-size:16px; line-height:1.3; font-weight:650; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .draft-preview { display:-webkit-box; overflow:hidden; color:var(--arbol-color-text-muted); font:500 var(--arbol-type-label)/1.45 var(--arbol-font-ui); white-space:pre-wrap; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .station-card[data-unread="true"] .card-title { font-weight:750; }
  .card-meta, .card-usage { display:flex; align-items:center; gap:6px; min-width:0; color:var(--arbol-color-text-muted); font:500 var(--arbol-type-label)/1.25 var(--arbol-font-mono); }
  .meta-separator { opacity:.45; }
  .truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .generation-speeds { display:flex; align-items:center; gap:10px; color:var(--arbol-color-text-muted); font:600 10px/1.2 var(--arbol-font-mono); white-space:nowrap; }
  .generation-speeds span { display:inline-flex; align-items:baseline; gap:3px; }
  .generation-speeds b { color:var(--arbol-color-accent); font-size:12px; font-weight:750; }
  .generation-speeds small { opacity:.7; font:inherit; text-transform:uppercase; }
  .station-card[data-stale="true"] .generation-speeds b { color:var(--arbol-color-text-muted); }
  .card-usage { display:block; margin-top:auto; padding-top:2px; white-space:normal; overflow:visible; overflow-wrap:anywhere; text-overflow:clip; }
  .card-tail { margin-top:auto; padding-top:var(--arbol-space-2); border-top:1px solid var(--arbol-color-hairline); color:var(--arbol-color-text-muted); font:600 var(--arbol-type-label)/1.35 var(--arbol-font-mono); min-height:1.35em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.78; }
  .card-tail.has-tail { color:var(--arbol-color-accent); opacity:.95; animation:tail-pulse 1.6s ease-in-out infinite; }
  @keyframes tail-pulse { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.22); } }
  @keyframes rail-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
  /* No prefers-reduced-motion guard, deliberately: the running motion is a
     functional signal (matches the pre-port card, which also ignored it), and
     macOS "Reduce motion" is enabled on the target machine. */
</style>
