<script lang="ts">
  import StationCard from './StationCard.svelte'
  import OpenInElmaBadge from './OpenInElmaBadge.svelte'
  import CompactStationCard from './CompactStationCard.svelte'
  import RunningChatBackground from './RunningChatBackground.svelte'
  import type { StationSession } from './stations'
  import './willo.css'

  let { variant = 'all', compact = false, paused = false }: {
    variant?: 'all' | 'current' | 'badge' | 'frame' | 'band'; compact?: boolean; paused?: boolean
  } = $props()
  let selected = $state('chat-1')
  let freeze = $state(false)
  const now = Date.now()
  const options = [
    { id: 'current', title: 'Current design', detail: 'Warm outline and a subtle surface tint. Baseline.' },
    { id: 'badge', title: '01 · Explicit badge', detail: 'A theme-tinted “Open in Elma” badge with the card’s accent border and monospace type.' },
    { id: 'frame', title: '02 · Cool frame', detail: 'A blue outer frame separates the open chat from warm running states.' },
    { id: 'band', title: '03 · Header band', detail: 'A solid, high-contrast heading makes the open card a stronger landmark.' },
  ] as const
  const sessions: StationSession[] = [
    'Elma · Arbol', 'Elma · Arbol', 'Refine the station layout', 'Search across repositories',
    'Review the navigation changes', 'Fix the retry flow', 'Polish the composer', 'Update session shortcuts',
    'Check the release notes', 'Improve activity timestamps',
  ].map((title, i) => ({
    id: `chat-${i}`, title, ip_name: i === 1 ? 'glm' : 'codex', model: i === 1 ? 'glm-5.3-flash' : 'gpt-6-astra',
    repo: 'arbol', status: i < 2 ? 'running' : i === 5 ? 'error' : 'idle', onGoing: i < 2,
    isUnread: i === 3, hasDraft: i === 6, first_message_has_images: i === 0,
    color: i % 2 ? '#fb668d' : '#88dceb', updated_at: now - (i < 2 ? 15000 + i * 20000 : i * 180000),
    last_agent_activity_at: now - 15000,
    last_usage: { tokens_in: 57890 + i * 3200, tokens_out: 317 + i * 210 },
  }))
</script>

<main class:compact class:paused={paused || freeze}>
  <header>
    <p class="eyebrow">Willo · Open chat studies</p>
    <h1>Find your open chat at a glance.</h1>
    <p>Click any card to move the open state in every option. Try an idle, unread, or error card, too.</p>
    <div class="toolbar">
      <button onclick={() => freeze = !freeze} aria-pressed={freeze}>{freeze ? 'Resume motion' : 'Pause motion'}</button>
      <button onclick={() => selected = 'chat-1'}>Reset selection</button>
      <span role="status">Open: {sessions.find(s => s.id === selected)?.title}</span>
    </div>
    <p class="recommendation">Suggested starting point: <strong>01 · Explicit badge</strong> — the smallest change that explains the highlight.</p>
  </header>
  <div class="comparisons" class:single={variant !== 'all'}>
    {#each options.filter(o => variant === 'all' || variant === o.id) as option}
      <section class="option" data-variant={option.id} aria-label={option.title}>
        <div class="option-heading"><h2>{option.title}</h2><p>{option.detail}</p></div>
        <RunningChatBackground paused={paused || freeze} {compact}>
          <h3>Running <span>2</span></h3>
          <div class="cards">
            {#each sessions.slice(0, 2) as session}
              {@render card(session, option.id, true)}
            {/each}
          </div>
        </RunningChatBackground>
        <div class="other">
          <h3>Other chats <span>8</span></h3>
          <div class="cards">
            {#each sessions.slice(2) as session}
              {@render card(session, option.id, false)}
            {/each}
          </div>
        </div>
      </section>
    {/each}
  </div>
</main>

{#snippet card(session: StationSession, treatment: string, running: boolean)}
  <div class="sample" class:chosen={selected === session.id} data-treatment={treatment}>
    {#if treatment === 'badge'}
      <OpenInElmaBadge active={selected === session.id} />
    {:else if treatment !== 'current'}
      <div class="marker" class:visible={selected === session.id} aria-hidden="true">
        <span class="open-label">
          <svg class="window-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="2" y="2.5" width="12" height="11" rx="2" />
            <path d="M2 6h12M6 6v7.5" />
          </svg>
          Open in Elma
        </span>
      </div>
    {/if}
    {#if compact}
      <CompactStationCard {session} {now} {running} openInElma={selected === session.id}
        onOpen={(s) => selected = s.id} generationSpeed={{ oneMinute: 826, fiveMinutes: 1125 }} />
    {:else}
      <StationCard {session} {now} compact={!running} openInElma={selected === session.id}
        onOpen={(s) => selected = s.id} generationSpeed={{ oneMinute: 826, fiveMinutes: 1125 }}
        liveTail={running ? 'Checking the layout and refining the interaction…' : ''} />
    {/if}
  </div>
{/snippet}

<style>
  main { padding:32px; min-height:100vh; box-sizing:border-box; background:var(--arbol-color-bg); color:var(--arbol-color-text); font-family:var(--arbol-font-ui); }
  header { max-width:1500px; margin:0 auto 28px; }
  .eyebrow, h3 { font:600 11px var(--arbol-font-mono); text-transform:uppercase; letter-spacing:1px; }
  h1 { font-size:30px; letter-spacing:-.8px; margin:12px 0; }
  p { font-size:13px; line-height:1.6; color:var(--arbol-color-text-muted); margin:0; }
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:18px 0; font-size:12px; }
  button { padding:8px 12px; border:1px solid var(--arbol-color-border); border-radius:8px; background:var(--arbol-color-surface); color:var(--arbol-color-text); font:inherit; cursor:pointer; }
  button:focus-visible { outline:2px solid var(--arbol-color-text); outline-offset:3px; }
  .recommendation { font-size:12px; }
  .comparisons { max-width:1500px; margin:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:32px; align-items:start; }
  .comparisons.single { max-width:1000px; grid-template-columns:1fr; }
  .option { min-width:0; --open-blue:#91bdff; --open-ink:#10213b; }
  .option-heading { min-height:76px; }
  h2 { margin:0 0 6px; font-size:19px; }
  h3 { margin:0 0 16px; color:var(--arbol-color-text-muted); }
  h3 span { margin-left:8px; opacity:.65; }
  .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .other { padding:24px 22px; }
  .sample { position:relative; min-width:0; border-radius:var(--arbol-radius-l); }
  /* Reserve marker space on every proposed card so switching never shifts the list. */
  .marker { height:26px; display:flex; align-items:flex-start; visibility:hidden; pointer-events:none; }
  .marker.visible { visibility:visible; }
  .open-label { display:inline-flex; gap:6px; align-items:center; padding:4px 9px; border-radius:5px; background:var(--arbol-color-text); color:var(--arbol-color-bg); font:700 10px/1.2 var(--arbol-font-ui); }
  .window-icon { flex-shrink:0; }
  .chosen[data-treatment=frame] { outline:3px solid var(--open-blue); outline-offset:4px; }
  [data-treatment=frame] .open-label { background:var(--open-blue); color:var(--open-ink); }
  .chosen[data-treatment=band] { background:var(--arbol-color-text); box-shadow:0 0 0 2px var(--arbol-color-text); }
  [data-treatment=band] .marker { height:30px; padding:0 8px; align-items:center; }
  /* For these two options, the outer treatment replaces the existing warm selection ring. */
  .chosen[data-treatment=frame] :global([data-open-in-elma]),
  .chosen[data-treatment=band] :global([data-open-in-elma]) { outline:none; background:var(--arbol-color-surface) !important; border-color:var(--arbol-color-border) !important; box-shadow:var(--arbol-shadow-1) !important; }
  .sample :global([role=button]:focus-visible) { outline:2px dashed var(--arbol-color-text); outline-offset:2px; }
  .compact .cards { grid-template-columns:1fr; }
  .compact .option { max-width:380px; width:100%; margin:auto; }
  .paused :global(.station-card), .paused :global(.station-card *),
  .paused :global(.station-card::before), .paused :global(.station-card::after),
  .paused :global(.willo-compact-card), .paused :global(.willo-compact-card *),
  .paused :global(.willo-compact-card::before), .paused :global(.willo-compact-card::after) { animation-play-state:paused !important; }
  @media (max-width:1100px) { .comparisons { grid-template-columns:1fr; max-width:760px; } }
  @media (max-width:580px) { main { padding:20px 12px; } .cards { grid-template-columns:1fr; } .option-heading { padding-bottom:16px; } }
</style>
