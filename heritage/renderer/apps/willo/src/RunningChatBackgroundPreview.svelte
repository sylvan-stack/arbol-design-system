<script lang="ts">
  import RunningChatBackground from './RunningChatBackground.svelte'
  import CompactStationCard from './CompactStationCard.svelte'
  import StationCard from './StationCard.svelte'
  import type { StationSession } from './stations'
  import './willo.css'
  let { variant = 'all', paused = false, compact = false, minimal = false }: { variant?: 'all' | 'aurora' | 'tide' | 'ember'; paused?: boolean; compact?: boolean; minimal?: boolean } = $props()
  let locallyPaused = $state(false)
  let selected = $state('')
  const now = Date.now()
  const options = [
    { id: 'aurora', name: 'Aurora', description: 'Blue and coral clouds with a wider, livelier drift.' },
    { id: 'tide', name: 'Tide', description: 'A silky ribbon flowing from cool blue to warm rose.' },
    { id: 'ember', name: 'Ember', description: 'A breathing glow around the edges. A quieter center.' },
  ] as const
  const sessions: StationSession[] = [
    { id: 'preview-layout', title: 'Refine the station layout', ip_name: 'codex', model: 'GPT-6', repo: 'Arbol', color: '#6da9ff' },
    { id: 'preview-search', title: 'Make search feel instant', ip_name: 'codex', model: 'GPT-6', repo: 'Mycel', color: '#ed8495' },
  ].map(s => ({ ...s, status: 'running', onGoing: true, last_agent_activity_at: now, last_usage: { tokens_in: 18400, tokens_out: 2700 } }))
</script>

<main class:compact>
  <header>
    <div><p class="eyebrow">Willo Station · Motion studies</p><h1>Running, with a little atmosphere.</h1><p>Three blue-to-red backgrounds, with the real running chat cards. Try the theme switcher, too.</p></div>
    <button onclick={() => locallyPaused = !locallyPaused} aria-pressed={locallyPaused}>{locallyPaused ? 'Resume backgrounds' : 'Pause backgrounds'}</button>
  </header>
  <div class="options" class:single={variant !== 'all'}>
    {#each options.filter(option => variant === 'all' || variant === option.id) as option}
      <article>
        <div class="option-heading"><span class="number">0{options.indexOf(option) + 1}</span><div><h2>{option.name}</h2><p>{option.description}</p></div></div>
        <RunningChatBackground variant={option.id} paused={paused || locallyPaused} {compact}>
          <div class="section-heading"><h3>Running</h3><span class="line"></span><span class="count">2</span></div>
          <div class="cards">
            {#each sessions as session, i}
              {#if compact}
                <CompactStationCard {session} {now} {minimal} running generationSpeed={{ oneMinute: 1280 + i * 340, fiveMinutes: 960 + i * 220 }} liveTail="Checking the layout…" onOpen={(s) => selected = s.title || ''} />
              {:else}
              <StationCard {session} {now} generationSpeed={{ oneMinute: 1280 + i * 340, fiveMinutes: 960 + i * 220 }} liveTail={i === 0 ? 'Refining spacing and checking the responsive layout…' : 'Checking the search results against the index…'} onOpen={(s) => selected = s.title || ''} />
              {/if}
            {/each}
          </div>
        </RunningChatBackground>
      </article>
    {/each}
  </div>
  <p class="footnote">Backgrounds follow your system’s reduced-motion preference. Existing card motion is unchanged.</p>
  <p class="selection" role="status">{selected ? `Preview selected: ${selected}` : ''}</p>
</main>

<style>
  main { box-sizing:border-box; min-height:100vh; padding:36px; background:var(--arbol-color-bg); color:var(--arbol-color-text); font-family:var(--arbol-font-ui); }
  header { display:flex; justify-content:space-between; align-items:center; gap:24px; margin:0 auto 36px; max-width:1500px; }
  .eyebrow { font:600 10px var(--arbol-font-mono); letter-spacing:1.5px; text-transform:uppercase; color:var(--arbol-color-text-muted); }
  h1 { font-size:clamp(22px, 3vw, 34px); font-weight:600; letter-spacing:-1px; margin:12px 0; }
  p { color:var(--arbol-color-text-muted); font-size:13px; line-height:1.6; margin:0; }
  button { flex-shrink:0; border:1px solid var(--arbol-color-border); border-radius:8px; background:var(--arbol-color-surface); color:var(--arbol-color-text); padding:10px 14px; font:inherit; font-size:12px; cursor:pointer; }
  button:focus-visible { outline:2px solid var(--arbol-color-accent); outline-offset:3px; }
  .options { max-width:1500px; margin:auto; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; }
  .options.single { max-width:1100px; grid-template-columns:1fr; }
  .option-heading { display:flex; align-items:center; gap:12px; min-height:80px; margin-bottom:14px; }
  .number { font:500 12px var(--arbol-font-mono); color:var(--arbol-color-text-muted); }
  h2 { margin:0 0 6px; font-size:20px; font-weight:600; }
  .section-heading { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  h3 { margin:0; font:600 11px var(--arbol-font-mono); text-transform:uppercase; letter-spacing:.65px; }
  .line { height:1px; flex:1; background:var(--arbol-color-border); }
  .count { border:1px solid var(--arbol-color-border); border-radius:99px; padding:2px 7px; font:500 10px var(--arbol-font-mono); }
  .cards { display:grid; gap:16px; }
  .single .cards { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .compact .options.single { max-width:360px; }
  .compact .cards { grid-template-columns:1fr; }
  .footnote { margin:28px auto 0; max-width:1500px; font-size:11px; }
  .selection { margin:10px auto; max-width:1500px; }
  @media (max-width:1000px) { .options { grid-template-columns:1fr; max-width:700px; } }
  @media (max-width:600px) { main { padding:20px 12px; } header { align-items:flex-start; flex-direction:column; } .single .cards { grid-template-columns:1fr; } }
</style>
