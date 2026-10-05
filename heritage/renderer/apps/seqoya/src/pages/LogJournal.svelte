<script lang="ts">
  /* Seqoya Monitoring[Journal Log] — one diagnostic view over every daemon's
   * JSON logs. Rows are operational logs of any kind:
   * ordinary messages, structured events, exceptions, and Signal entries. */
  import { onMount } from 'svelte'
  import { EntityChip, parseEntityUri, type EntityUri } from '@arbol/design-system'
  import { api, type LogJournalEntry, type LogJournalFacets, type SignalRecord } from '../api'

  let entries = $state<LogJournalEntry[]>([])
  let facets = $state<LogJournalFacets>({ daemons: [], levels: [] })
  let loading = $state(true)
  let error = $state<string | null>(null)
  let daemon = $state('')
  let level = $state('')
  let eventName = $state('')
  let query = $state('')
  let signalsOnly = $state(false)
  let limit = $state(500)
  let autoRefresh = $state(true)
  let selected = $state<LogJournalEntry | null>(null)
  let selectedSignal = $state<SignalRecord | null>(null)
  let signalLoading = $state(false)
  let signalError = $state<string | null>(null)

  const errorText = (value: unknown) => value instanceof Error ? value.message : String(value)

  async function load() {
    loading = true
    error = null
    try {
      const result = await api.logJournal.list({
        limit,
        daemon: daemon || undefined,
        level: level || undefined,
        event: eventName.trim() || undefined,
        query: query.trim() || undefined,
        signals_only: signalsOnly || undefined,
      })
      entries = result.entries
      facets = result.facets
      if (selected && !entries.some((entry) => entry.id === selected?.id)) selected = null
    } catch (value) {
      error = errorText(value)
    } finally {
      loading = false
    }
  }

  let filterTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    daemon; level; eventName; query; signalsOnly; limit
    if (filterTimer !== null) clearTimeout(filterTimer)
    filterTimer = setTimeout(load, 250)
    return () => { if (filterTimer !== null) clearTimeout(filterTimer) }
  })

  onMount(() => {
    void load()
    const timer = setInterval(() => { if (autoRefresh) void load() }, 3_000)
    return () => clearInterval(timer)
  })

  async function selectEntry(entry: LogJournalEntry) {
    selected = entry
    selectedSignal = null
    signalError = null
    signalLoading = false
    if (entry.event !== 'signal.sent') return
    // Older signal.sent records called this domain identifier `id`; new records
    // use the unambiguous `signal_id`. This is a read compatibility fallback,
    // not a second field in newly written logs.
    const signalId = entry.fields.signal_id ?? entry.fields.id
    if (typeof signalId !== 'string' || !signalId) {
      signalError = 'This log entry has no Signal ID.'
      return
    }
    signalLoading = true
    try {
      const signal = await api.signals.get(signalId)
      // Do not let an older request replace the currently selected row.
      if (selected === entry) selectedSignal = signal
    } catch (value) {
      if (selected === entry) signalError = errorText(value)
    } finally {
      if (selected === entry) signalLoading = false
    }
  }

  function closeDetail() {
    selected = null
    selectedSignal = null
    signalError = null
    signalLoading = false
  }

  function resetFilters() {
    daemon = ''
    level = ''
    eventName = ''
    query = ''
    signalsOnly = false
  }

  function time(ts: number): string {
    if (!ts) return '—'
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
  }

  function levelClass(value: string): string {
    if (value === 'ERROR' || value === 'CRITICAL') return 'is-error'
    if (value === 'WARNING') return 'is-warning'
    if (value === 'DEBUG') return 'is-debug'
    return 'is-info'
  }

  function summary(entry: LogJournalEntry): string {
    if (entry.event === 'signal.sent' && entry.fields.type) {
      return String(entry.fields.type)
    }
    return entry.msg || '(no message)'
  }

  function formatted(value: unknown): string {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }

  function entityUri(value: unknown): EntityUri | null {
    if (typeof value !== 'string') return null
    const parsed = parseEntityUri(value)
    return parsed.ok ? parsed.value.uri : null
  }

  function entryEntityUri(entry: LogJournalEntry): EntityUri | null {
    return entityUri(entry.fields.entity_uri)
  }

  function signalEntityUri(signal: SignalRecord): EntityUri | null {
    return entityUri(signal.source_ref) || entityUri(signal.data?.entity_uri)
  }
</script>

<div class="journal-page">
  <header class="journal-header">
    <div>
      <h2>Journal Log</h2>
      <p>Operational logs from all Arbol daemons. This includes structured events, Signals, ordinary messages, warnings, and errors—not only event-sourcing events.</p>
    </div>
    <div class="journal-actions">
      <label class="auto-refresh"><input type="checkbox" bind:checked={autoRefresh} /> Auto-refresh</label>
      <button type="button" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
    </div>
  </header>

  <section class="journal-filters" aria-label="Journal Log filters">
    <label>
      <span>Search</span>
      <input bind:value={query} placeholder="message, field, ID…" />
    </label>
    <label>
      <span>Daemon</span>
      <select bind:value={daemon}>
        <option value="">All daemons</option>
        {#each facets.daemons as item}<option value={item}>{item}</option>{/each}
      </select>
    </label>
    <label>
      <span>Level</span>
      <select bind:value={level}>
        <option value="">All levels</option>
        {#each facets.levels as item}<option value={item}>{item}</option>{/each}
      </select>
    </label>
    <label>
      <span>Structured event</span>
      <input bind:value={eventName} placeholder="e.g. signal.sent" />
    </label>
    <label class="signal-filter">
      <span>Entry type</span>
      <span class="signal-toggle"><input type="checkbox" bind:checked={signalsOnly} /> Signals only</span>
    </label>
    <label class="limit-filter">
      <span>Rows</span>
      <select bind:value={limit}>
        <option value={100}>100</option><option value={250}>250</option>
        <option value={500}>500</option><option value={1000}>1000</option>
      </select>
    </label>
    <button class="clear-button" type="button" onclick={resetFilters}>Clear</button>
  </section>

  <div class="journal-meta">
    <span>{entries.length} log {entries.length === 1 ? 'entry' : 'entries'}</span>
    {#if error}<span class="journal-error">{error}</span>{/if}
  </div>

  <div class:with-detail={selected !== null} class="journal-content">
    <div class="journal-table-wrap">
      <table class="journal-table">
        <thead><tr><th>Time</th><th>Level</th><th>Daemon</th><th>Event / Logger</th><th>Summary</th></tr></thead>
        <tbody>
          {#each entries as entry (entry.id)}
            <tr class:is-selected={selected?.id === entry.id} onclick={() => void selectEntry(entry)}>
              <td class="mono time" title={entry.ts ? new Date(entry.ts * 1000).toLocaleString() : entry.file}>{time(entry.ts)}</td>
              <td><span class="level {levelClass(entry.level)}">{entry.level}</span></td>
              <td class="mono daemon" title={entry.file}>{entry.daemon || '—'}</td>
              <td class="mono event" title={entry.event || entry.logger}>{entry.event || entry.logger || '—'}</td>
              <td class="message" title={summary(entry)}><span>{summary(entry)}</span>{#if entryEntityUri(entry)}{@const uri = entryEntityUri(entry)}{#if uri}<EntityChip {uri} onNavigationError={(value) => error = value.message} />{/if}{/if}</td>
            </tr>
          {:else}
            <tr><td class="empty" colspan="5">{loading ? 'Loading logs…' : 'No log entries match these filters.'}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if selected}
      <aside class="journal-detail" aria-label="Selected log entry">
        <div class="detail-head">
          <div><span class="level {levelClass(selected.level)}">{selected.level}</span><b>{selected.event || selected.logger || 'Log entry'}</b></div>
          <button type="button" aria-label="Close details" onclick={closeDetail}>×</button>
        </div>
        <dl>
          <dt>Time</dt><dd>{selected.ts ? new Date(selected.ts * 1000).toLocaleString() : 'Unknown'}</dd>
          <dt>Daemon</dt><dd>{selected.daemon || '—'}</dd>
          <dt>Logger</dt><dd>{selected.logger || '—'}</dd>
          <dt>File</dt><dd>{selected.file}</dd>
          <dt>Message</dt><dd>{selected.msg || '—'}</dd>
        </dl>
        {#if selected.event === 'signal.sent'}
          <h3>Signal</h3>
          {#if signalLoading}
            <p class="detail-note">Loading complete Signal…</p>
          {:else if signalError}
            <p class="detail-error">{signalError}</p>
          {:else if selectedSignal}
            {#if signalEntityUri(selectedSignal)}
              {@const uri = signalEntityUri(selectedSignal)}
              {#if uri}<div class="signal-entity"><EntityChip {uri} onNavigationError={(value) => error = value.message} /></div>{/if}
            {/if}
            <pre>{formatted(selectedSignal)}</pre>
          {/if}
        {/if}
        <h3>Operational log record</h3>
        <pre>{formatted(selected.fields)}</pre>
      </aside>
    {/if}
  </div>
</div>

<style>
  .journal-page { height:100%; min-height:0; display:grid; grid-template-rows:auto auto auto 1fr; overflow:hidden; padding:var(--arbol-space-5); gap:var(--arbol-space-3); box-sizing:border-box; }
  .journal-header { display:flex; align-items:flex-start; gap:24px; }
  .journal-header h2 { margin:0 0 4px; font-size:var(--arbol-type-title); }
  .journal-header p { margin:0; color:var(--arbol-color-text-muted); max-width:780px; font-size:var(--arbol-type-label); line-height:1.45; }
  .journal-actions { margin-left:auto; display:flex; align-items:center; gap:10px; white-space:nowrap; }
  button, input, select { font:500 var(--arbol-type-label)/1.2 var(--arbol-font-ui); color:var(--arbol-color-text); }
  button { cursor:pointer; border:1px solid var(--arbol-color-border); background:var(--arbol-color-surface-2); border-radius:var(--arbol-radius-s); padding:7px 12px; }
  button:disabled { opacity:.6; cursor:default; }
  .auto-refresh { display:flex; align-items:center; gap:5px; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); }
  .journal-filters { display:grid; grid-template-columns:minmax(180px,1.4fr) minmax(140px,1fr) 120px minmax(160px,1fr) 110px 90px auto; gap:8px; align-items:end; padding:10px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-m); background:var(--arbol-color-surface-2); }
  .journal-filters label { display:grid; gap:4px; min-width:0; }
  .journal-filters label > span { color:var(--arbol-color-text-muted); font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
  .signal-toggle { height:30px; box-sizing:border-box; display:flex; align-items:center; gap:6px; white-space:nowrap; padding:5px 8px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); color:var(--arbol-color-text); font-size:var(--arbol-type-label); text-transform:none!important; letter-spacing:normal!important; }
  .signal-toggle input { width:auto; height:auto; margin:0; }
  input, select { min-width:0; box-sizing:border-box; width:100%; height:30px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); padding:5px 8px; }
  .clear-button { height:30px; }
  .journal-meta { min-height:20px; display:flex; gap:16px; color:var(--arbol-color-text-muted); font:11px var(--arbol-font-mono); }
  .journal-error { color:var(--arbol-color-danger,#e35); }
  .journal-content { min-height:0; display:grid; grid-template-columns:1fr; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-m); overflow:hidden; background:var(--arbol-color-bg); }
  .journal-content.with-detail { grid-template-columns:minmax(420px,1fr) minmax(320px,38%); }
  .journal-table-wrap { overflow:auto; min-width:0; }
  .journal-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12px; }
  .journal-table th { position:sticky; top:0; z-index:1; text-align:left; color:var(--arbol-color-text-muted); background:var(--arbol-color-surface-2); border-bottom:1px solid var(--arbol-color-border); padding:7px 8px; font:600 10px var(--arbol-font-ui); text-transform:uppercase; letter-spacing:.45px; }
  .journal-table th:nth-child(1) { width:92px; }.journal-table th:nth-child(2) { width:70px; }.journal-table th:nth-child(3) { width:145px; }.journal-table th:nth-child(4) { width:210px; }
  .journal-table td { border-bottom:1px solid var(--arbol-color-hairline,var(--arbol-color-border)); padding:6px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .journal-table tbody tr { cursor:pointer; }.journal-table tbody tr:hover,.journal-table tbody tr.is-selected { background:var(--arbol-color-surface-2); }
  .message { display:flex; align-items:center; gap:8px; }.message > span { min-width:0; overflow:hidden; text-overflow:ellipsis; }.message :global(.entity-chip) { flex:0 1 auto; max-width:240px; }.signal-entity { margin:0 0 8px; }
  .mono { font-family:var(--arbol-font-mono); }.time { color:var(--arbol-color-text-muted); }.daemon { font-weight:600; }.event { color:var(--arbol-color-accent); }.message { color:var(--arbol-color-text); }
  .level { display:inline-block; border-radius:4px; padding:2px 5px; font:600 9px var(--arbol-font-mono); letter-spacing:.3px; }
  .level.is-info { color:#39b58a; background:#2a8f6a26; }.level.is-warning { color:#d9a441; background:#b58a392b; }.level.is-error { color:#ee6b78; background:#c53d4d28; }.level.is-debug,.level.is-unknown { color:var(--arbol-color-text-muted); background:var(--arbol-color-surface-2); }
  .empty { text-align:center; color:var(--arbol-color-text-muted); padding:32px!important; }
  .journal-detail { min-width:0; overflow:auto; border-left:1px solid var(--arbol-color-border); padding:14px; background:var(--arbol-color-surface-2); }
  .detail-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:16px; }.detail-head > div { display:flex; align-items:center; gap:8px; min-width:0; }.detail-head b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.detail-head button { padding:2px 8px; font-size:18px; }
  dl { display:grid; grid-template-columns:68px minmax(0,1fr); gap:7px 10px; margin:0; font-size:11px; } dt { color:var(--arbol-color-text-muted); } dd { margin:0; overflow-wrap:anywhere; font-family:var(--arbol-font-mono); }
  .journal-detail h3 { margin:18px 0 7px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--arbol-color-text-muted); }
  .detail-note,.detail-error { margin:0; padding:10px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); font:11px/1.45 var(--arbol-font-mono); overflow-wrap:anywhere; }
  .detail-note { color:var(--arbol-color-text-muted); }.detail-error { color:var(--arbol-color-danger,#e35); }
  pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; padding:10px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); color:var(--arbol-color-text); font:11px/1.45 var(--arbol-font-mono); }
  @media (max-width:900px) { .journal-filters { grid-template-columns:1fr 1fr 1fr; }.journal-content.with-detail { grid-template-columns:1fr; }.journal-detail { position:absolute; right:var(--arbol-space-5); bottom:var(--arbol-space-5); top:200px; width:min(430px,75vw); box-shadow:var(--arbol-shadow-2); border:1px solid var(--arbol-color-border); }.journal-page { position:relative; } }
</style>
