<script lang="ts">
  /* Versioned operational history; it never reconstructs domain state. */
  import { onMount } from 'svelte'
  import { call, subscribe, onCoreDisconnect, onCoreReconnect, type StreamEvent } from '@arbol/design-system'

  type MonitorEvent = {
    seq: number
    ts?: number
    type: string
    actor: string
    aggregate_id: string
    correlation_id?: string | null
    payload?: unknown
  }

  const MAX_EVENTS = 500
  let events = $state<MonitorEvent[]>([])
  let connected = $state(true)
  let paused = $state(false)
  let selected = $state<MonitorEvent | null>(null)
  let query = $state('')
  let eventType = $state('')
  let actor = $state('')
  let storageGeneration = $state('legacy')
  let cursor: unknown = undefined
  let restartFeed = () => {}

  const filtered = $derived(events.filter((event) => {
    if (eventType && event.type !== eventType) return false
    if (actor && event.actor !== actor) return false
    const needle = query.trim().toLowerCase()
    return !needle || [event.type, event.actor, event.aggregate_id, event.correlation_id || '']
      .some((value) => value.toLowerCase().includes(needle))
  }))
  const types = $derived([...new Set(events.map((event) => event.type))].sort())
  const actors = $derived([...new Set(events.map((event) => event.actor))].sort())

  function ingest(frame: StreamEvent) {
    if (frame.kind === 'error' && cursor && /cursor|generation|reset/.test(JSON.stringify(frame.data))) {
      cursor = undefined
      clear()
      restartFeed()
      return
    }
    if (frame.event === 'state.history' && frame.data?.format === 'arbol.state-history/1') {
      const page = frame.data
      if (storageGeneration !== page.cursor.generation) {
        clear()
        storageGeneration = page.cursor.generation
      }
      cursor = page.cursor
      if (paused) return
      const incoming: MonitorEvent[] = page.entries.map((entry: any) => ({
        seq: entry.cursor, ts: Date.parse(entry.recorded_at), type: entry.kind,
        actor: entry.actor_login, aggregate_id: entry.subject.session || '',
        correlation_id: entry.command_id, payload: entry.subject,
      }))
      const byPosition = new Map([...events, ...incoming].map(entry => [entry.seq, entry]))
      events = [...byPosition.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS)
      return
    }
    if (paused || frame.kind === 'error' || !frame.data || typeof frame.data.seq !== 'number') return
    const incoming = frame.data as MonitorEvent
    if (events.some((event) => event.seq === incoming.seq)) return
    events = [...events, incoming].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS)
  }

  onMount(() => {
    let unsubscribe: (() => void) | null = null
    let connection = 0
    const open = async () => {
      const expected = ++connection
      unsubscribe?.()
      try {
        const health = await call('healthz')
        if (expected !== connection) return
        const state = health?.storage_mode === 'state'
        unsubscribe = state
          ? subscribe('state.history', { live_only: true, ...(cursor ? { cursor } : {}) }, ingest)
          : subscribe('events.all', {}, ingest)
      } catch { connected = false }
    }
    restartFeed = () => { void open() }
    open()
    const offDisconnect = onCoreDisconnect(() => { connected = false })
    const offReconnect = onCoreReconnect(() => { connected = true; open() })
    return () => { connection++; unsubscribe?.(); offDisconnect(); offReconnect() }
  })

  function clear() {
    events = []
    selected = null
  }

  function time(ts = 0): string {
    if (!ts) return '—'
    return new Date(ts > 10_000_000_000 ? ts : ts * 1000)
      .toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
  }

  function formatted(value: unknown): string {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }
</script>

<div class="monitor-page">
  <header>
    <div>
      <h2>Activity History</h2>
      <p>Live operational history from Arbol Core. {storageGeneration === 'legacy' ? 'Legacy event feed.' : 'State command history; positions are history cursors.'}</p>
    </div>
    <div class="actions">
      <span class:offline={!connected} class="connection">{connected ? 'Connected' : 'Disconnected'}</span>
      <button type="button" onclick={() => (paused = !paused)}>{paused ? 'Resume' : 'Pause'}</button>
      <button type="button" onclick={clear}>Clear</button>
    </div>
  </header>

  <section class="filters" aria-label="Event stream filters">
    <label><span>Search</span><input bind:value={query} placeholder="session, correlation, type…" /></label>
    <label><span>Event type</span><select bind:value={eventType}><option value="">All event types</option>{#each types as item}<option value={item}>{item}</option>{/each}</select></label>
    <label><span>Actor</span><select bind:value={actor}><option value="">All actors</option>{#each actors as item}<option value={item}>{item}</option>{/each}</select></label>
  </section>

  <div class="meta">{filtered.length} of {events.length} retained events · latest {events.at(-1)?.seq ? `#${events.at(-1)?.seq}` : '—'}</div>

  <div class:with-detail={selected !== null} class="content">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Seq</th><th>Time</th><th>Type</th><th>Actor</th><th>Aggregate</th><th>Correlation</th></tr></thead>
        <tbody>
          {#each [...filtered].reverse() as event (event.seq)}
            <tr class:is-selected={selected?.seq === event.seq} onclick={() => (selected = event)}>
              <td class="mono">#{event.seq}</td><td class="mono muted">{time(event.ts)}</td>
              <td class="mono type">{event.type}</td><td class="mono">{event.actor}</td>
              <td class="mono">{event.aggregate_id}</td><td class="mono muted">{event.correlation_id || '—'}</td>
            </tr>
          {:else}
            <tr><td class="empty" colspan="6">{paused ? 'Event capture is paused.' : 'Waiting for live durable events…'}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if selected}
      <aside>
        <div class="detail-head"><b>{selected.type}</b><button type="button" aria-label="Close details" onclick={() => (selected = null)}>×</button></div>
        <dl>
          <dt>Sequence</dt><dd>#{selected.seq}</dd><dt>Actor</dt><dd>{selected.actor}</dd>
          <dt>Aggregate</dt><dd>{selected.aggregate_id}</dd><dt>Correlation</dt><dd>{selected.correlation_id || '—'}</dd>
        </dl>
        <h3>Recorded details</h3><pre>{formatted(selected.payload)}</pre>
      </aside>
    {/if}
  </div>
</div>

<style>
  .monitor-page{height:100%;min-height:0;display:grid;grid-template-rows:auto auto auto 1fr;overflow:hidden;padding:var(--arbol-space-5);gap:var(--arbol-space-3);box-sizing:border-box}
  header{display:flex;align-items:flex-start;gap:24px}h2{margin:0 0 4px;font-size:var(--arbol-type-title)}p{margin:0;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);line-height:1.45}.actions{margin-left:auto;display:flex;align-items:center;gap:8px}.connection{color:var(--arbol-color-ok);font:11px var(--arbol-font-mono)}.connection.offline{color:var(--arbol-color-err)}
  button,input,select{font:500 var(--arbol-type-label)/1.2 var(--arbol-font-ui);color:var(--arbol-color-text)}button{cursor:pointer;border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);border-radius:var(--arbol-radius-s);padding:7px 12px}.filters{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(180px,1fr) minmax(150px,1fr);gap:8px;padding:10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2)}label{display:grid;gap:4px}label span,h3{color:var(--arbol-color-text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px}input,select{min-width:0;width:100%;height:30px;box-sizing:border-box;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-bg);padding:5px 8px}.meta{min-height:20px;color:var(--arbol-color-text-muted);font:11px var(--arbol-font-mono)}
  .content{min-height:0;display:grid;grid-template-columns:1fr;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);overflow:hidden}.content.with-detail{grid-template-columns:minmax(500px,1fr) minmax(320px,38%)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th{position:sticky;top:0;text-align:left;background:var(--arbol-color-surface-2);border-bottom:1px solid var(--arbol-color-border);padding:7px 8px;color:var(--arbol-color-text-muted);font:600 10px var(--arbol-font-ui);text-transform:uppercase}th:nth-child(1){width:72px}th:nth-child(2){width:95px}th:nth-child(3){width:225px}th:nth-child(4){width:130px}td{padding:6px 8px;border-bottom:1px solid var(--arbol-color-hairline,var(--arbol-color-border));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.is-selected{background:var(--arbol-color-surface-2)}.mono{font-family:var(--arbol-font-mono)}.muted{color:var(--arbol-color-text-muted)}.type{color:var(--arbol-color-accent)}.empty{text-align:center;color:var(--arbol-color-text-muted);padding:32px!important}
  aside{overflow:auto;border-left:1px solid var(--arbol-color-border);padding:14px;background:var(--arbol-color-surface-2)}.detail-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:16px}.detail-head button{padding:2px 8px;font-size:18px}dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:7px 10px;margin:0;font-size:11px}dt{color:var(--arbol-color-text-muted)}dd{margin:0;overflow-wrap:anywhere;font-family:var(--arbol-font-mono)}h3{margin:18px 0 7px}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-bg);font:11px/1.45 var(--arbol-font-mono)}
</style>
