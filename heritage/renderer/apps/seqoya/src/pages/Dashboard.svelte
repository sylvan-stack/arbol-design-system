<script lang="ts">
  // Seqoya Lab[Dashboard] — landing hero + the Recent Activity feed (kn_activity):
  // sync/embed/overlay/raptor/pull operations from BOTH writers (taproot
  // daemon and the daemon-less `mycel` CLI). No-op passes are never logged, so
  // every row here is real work.
  import { onMount } from 'svelte'
  import ActivityDetails from '../components/ActivityDetails.svelte'
  import { Button, RingsMark } from '@arbol/design-system'
  import { api, type KnActivity, type KnDashboardStatus } from '../api'
  let { onGo }: { onGo: () => void } = $props()

  let activity = $state<KnActivity[]>([])
  let dashboardStatus = $state<KnDashboardStatus | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let statusError = $state<string | null>(null)
  let synchronizationEnabled = $state(true)
  let synchronizationLoading = $state(true)
  let synchronizationSaving = $state(false)
  let synchronizationError = $state<string | null>(null)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function load() {
    error = null
    statusError = null
    const [activityResult, statusResult] = await Promise.allSettled([
      api.knowledge.activity(30), api.knowledge.dashboardStatus(),
    ])
    if (activityResult.status === 'fulfilled') activity = activityResult.value
    else error = msg(activityResult.reason)
    if (statusResult.status === 'fulfilled') dashboardStatus = statusResult.value
    else statusError = msg(statusResult.reason)
    loading = false
  }

  async function loadSynchronization() {
    synchronizationError = null
    try {
      synchronizationEnabled = (await api.knowledge.synchronizationStatus()).enabled
    } catch (e) {
      synchronizationError = msg(e)
    } finally {
      synchronizationLoading = false
    }
  }

  async function toggleSynchronization() {
    if (synchronizationSaving) return
    const enabled = !synchronizationEnabled
    synchronizationSaving = true
    synchronizationError = null
    try {
      synchronizationEnabled = (await api.knowledge.setSynchronization(enabled)).enabled
    } catch (e) {
      synchronizationError = msg(e)
    } finally {
      synchronizationSaving = false
    }
  }

  onMount(() => {
    load()
    loadSynchronization()
    const t = setInterval(load, 5_000) // live sync/embed progress while the page is up
    return () => clearInterval(t)
  })

  const KIND_STYLE: Record<string, string> = {
    sync: 'background:#3a7bd533;color:#6aa7f8',
    embed: 'background:#2a8f6a33;color:#39b58a',
    overlay_ingest: 'background:#6a5acd33;color:#8a7be8',
    raptor_build: 'background:#b58a3933;color:#d9a441',
    raptor_regen: 'background:#b58a3933;color:#d9a441',
    pull: 'background:#8a3ab533;color:#b56ad9',
  }

  function ago(ts: number): string {
    const s = Math.max(0, (Date.now() - ts) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  function dur(ms: number | null): string {
    if (ms == null) return ''
    return ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`
  }

  /* Compact one-line description of a row's summary, per kind. */
  function describe(a: KnActivity): string {
    const s = a.summary as Record<string, any>
    if (a.kind === 'sync') {
      const parts = [
        s.code_added && `${s.code_added} code added`,
        s.code_updated && `${s.code_updated} code updated`,
        s.code_removed && `${s.code_removed} code removed`,
        s.docs_new && `${s.docs_new} docs new`,
        s.docs_edited && `${s.docs_edited} docs edited`,
        s.stale && `${s.stale} stale`,
      ].filter(Boolean)
      const tail = s.pending_embed ? ` · ${s.pending_embed} pending embed` : ''
      return (parts.join(', ') || 'changes synced') + tail
    }
    if (a.kind === 'embed')
      return `${s.embedded ?? 0}/${s.total ?? '?'} chunks embedded${s.stopped ? ' (stopped)' : ''}`
    if (a.kind === 'overlay_ingest')
      return `${s.overlay ?? ''} — ${s.changed_files ?? 0} files${s.merged ? ' (merged)' : ''}`
    if (a.kind === 'raptor_build')
      return `${s.summaries ?? 0} summaries, ${s.tiers ?? 0} tiers${s.cancelled ? ' (cancelled)' : ''}`
    if (a.kind === 'raptor_regen')
      return `${s.regenerated ?? 0}/${s.stale ?? 0} summaries regenerated${s.cancelled ? ' (cancelled)' : ''}`
    if (a.kind === 'pull') {
      const repos = (s.repos ?? {}) as Record<string, string>
      return Object.entries(repos).map(([r, st]) => `${r} ${st}`).join(', ') || 'pull'
    }
    return JSON.stringify(s)
  }

  function percent(done: number, total: number): string {
    if (total <= 0) return '0.00'
    if (done >= total) return '100.00'
    return Math.min(99.99, Math.max(0, done * 100 / total)).toFixed(2)
  }

  const chip = 'font:600 10px/1 var(--arbol-font-mono);padding:2px 6px;border-radius:5px'
  const statCard = 'min-width:0;padding:12px 14px;border:1px solid var(--arbol-color-hairline);' +
    'border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2)'
  const statValue = 'font:700 22px/1.1 var(--arbol-font-mono);color:var(--arbol-color-text)'
  const statLabel = 'margin-top:4px;color:var(--arbol-color-text-muted);font-size:11px;line-height:1.3'
</script>

<div style="height:100%;overflow-y:auto;padding:var(--arbol-space-6) var(--arbol-space-5) 64px">
  <div style="max-width:720px;margin:0 auto">
    <div style="text-align:center;margin-bottom:var(--arbol-space-6)">
      <div style="display:flex;justify-content:center;margin-bottom:var(--arbol-space-4);color:var(--arbol-color-accent)">
        <RingsMark size={64} color="var(--arbol-color-accent)" />
      </div>
      <h2 style="margin:0 0 var(--arbol-space-2);font-size:var(--arbol-type-display);font-weight:700">Seqoya Lab</h2>
      <p style="margin:0 0 var(--arbol-space-5);color:var(--arbol-color-text-muted);line-height:1.5">
        The Intelligence Service. Set up and monitor your Intelligence Providers and the subscriptions behind them.
      </p>
      <Button kind="primary" onclick={onGo}>{#snippet children()}Open Intelligence Providers →{/snippet}</Button>
    </div>

    <section style="margin:0 0 var(--arbol-space-5)" aria-labelledby="knowledge-health-label">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
        <h3 id="knowledge-health-label" style="font-size:var(--arbol-type-title);font-weight:700;margin:0">Knowledge health</h3>
        <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">all Mycel repositories</span>
      </div>
      {#if statusError && !dashboardStatus}
        <div style="padding:12px 14px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                    color:var(--arbol-color-danger,#e35);font-size:var(--arbol-type-label)">{statusError}</div>
      {:else if !dashboardStatus}
        <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">Loading knowledge health…</div>
      {:else}
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px">
          <div style={statCard}><div style={statValue}>{dashboardStatus.files.total}</div><div style={statLabel}>all files</div></div>
          <div style={statCard}><div style={statValue}>{dashboardStatus.composition.codebase.files.total}</div><div style={statLabel}>codebase files</div></div>
          <div style={statCard}><div style={statValue}>{dashboardStatus.composition.artifacts.files.total}</div><div style={statLabel}>artifact files</div></div>
          <div style={statCard}><div style={statValue}>{dashboardStatus.chunks.total}</div><div style={statLabel}>all chunks</div></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px">
          <div style={statCard}>
            <div style="display:flex;align-items:baseline;gap:8px"><div style={statValue}>Codebase</div><span style={statLabel}>repository source files</span></div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;font:600 12px var(--arbol-font-mono)">
              <span>{dashboardStatus.composition.codebase.files.total}<small style={statLabel}> files</small></span>
              <span>{dashboardStatus.composition.codebase.chunks.total}<small style={statLabel}> chunks</small></span>
              <span style="color:{dashboardStatus.composition.codebase.files.stale ? '#e3535a' : 'inherit'}">{dashboardStatus.composition.codebase.files.stale}<small style={statLabel}> stale files</small></span>
              <span>{dashboardStatus.composition.codebase.files.heartwood}<small style={statLabel}> heartwood</small></span>
            </div>
          </div>
          <div style={statCard}>
            <div style="display:flex;align-items:baseline;gap:8px"><div style={statValue}>Artifacts</div><span style={statLabel}>Artifact Corpus documents</span></div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;font:600 12px var(--arbol-font-mono)">
              <span>{dashboardStatus.composition.artifacts.files.total}<small style={statLabel}> files</small></span>
              <span>{dashboardStatus.composition.artifacts.chunks.total}<small style={statLabel}> chunks</small></span>
              <span style="color:{dashboardStatus.composition.artifacts.files.stale ? '#e3535a' : 'inherit'}">{dashboardStatus.composition.artifacts.files.stale}<small style={statLabel}> stale files</small></span>
              <span>{dashboardStatus.composition.artifacts.files.heartwood}<small style={statLabel}> heartwood</small></span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px">
          <div style={statCard}><div style={statValue}>{dashboardStatus.composition.base_repositories.files}</div><div style={statLabel}>base repository files · {dashboardStatus.composition.base_repositories.chunks} chunks</div></div>
          <div style="{statCard};border-color:{dashboardStatus.composition.overlays.files ? '#8a7be888' : 'var(--arbol-color-hairline)'}"><div style={statValue}>{dashboardStatus.composition.overlays.files}</div><div style={statLabel}>overlay files · {dashboardStatus.composition.overlays.chunks} chunks</div></div>
        </div>

        <details style="margin-top:7px;padding:10px 12px;border:1px solid var(--arbol-color-hairline);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2)">
          <summary style="cursor:pointer;font-weight:700;font-size:var(--arbol-type-label)">Repositories · {dashboardStatus.composition.repositories.length}</summary>
          <div style="display:grid;grid-template-columns:minmax(100px,1.4fr) repeat(5,minmax(64px,1fr));gap:5px 10px;margin-top:9px;font:11px/1.35 var(--arbol-font-mono)">
            <strong>repository</strong><strong>base</strong><strong>overlay</strong><strong>code</strong><strong>artifacts</strong><strong>chunks</strong>
            {#each dashboardStatus.composition.repositories as repo (repo.repo)}
              <span style="overflow:hidden;text-overflow:ellipsis">{repo.repo}</span><span>{repo.base_files}</span><span>{repo.overlay_files}</span><span>{repo.code_files}</span><span>{repo.artifact_files}</span><span>{repo.chunks}</span>
            {/each}
          </div>
        </details>
        <div style="margin-top:7px;padding:10px 12px;border:1px solid var(--arbol-color-hairline);
                    border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2)">
          <div style="display:flex;align-items:baseline;gap:10px;font-size:var(--arbol-type-label)">
            <strong>Embeddings</strong>
            <span style="color:var(--arbol-color-text-muted)">{dashboardStatus.chunks.embedded}/{dashboardStatus.chunks.total} current · {dashboardStatus.chunks.pending} pending</span>
            <span style="margin-left:auto;font:600 11px var(--arbol-font-mono)">{percent(dashboardStatus.chunks.embedded, dashboardStatus.chunks.total)}%</span>
          </div>
          <div style="height:5px;margin-top:7px;border-radius:999px;background:var(--arbol-color-surface);overflow:hidden">
            <div style="height:100%;width:{percent(dashboardStatus.chunks.embedded, dashboardStatus.chunks.total)}%;background:var(--arbol-color-accent);border-radius:999px"></div>
          </div>
          {#if dashboardStatus.synchronization.sync.running || dashboardStatus.synchronization.embedding.running}
            <div style="display:grid;gap:5px;margin-top:9px;font-size:11px;color:var(--arbol-color-text-muted)">
              {#if dashboardStatus.synchronization.sync.running}
                <div><span style="{chip};background:#3a7bd533;color:#6aa7f8;margin-right:7px">syncing</span>
                  {dashboardStatus.synchronization.sync.done}/{dashboardStatus.synchronization.sync.total} files observed
                  {#if dashboardStatus.synchronization.sync.repos.length}
                    · {dashboardStatus.synchronization.sync.repos.join(', ')}
                  {/if}
                </div>
                {#each dashboardStatus.synchronization.sync.active_files as file (`${file.repo}:${file.path}`)}
                  <div style="display:flex;gap:7px;min-width:0;padding-left:8px;font:11px/1.3 var(--arbol-font-mono)">
                    <span style="color:var(--arbol-color-text)">{file.repo}</span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{file.path}</span>
                  </div>
                {/each}
              {/if}
              {#if dashboardStatus.synchronization.embedding.running}
                <div><span style="{chip};background:#2a8f6a33;color:#39b58a;margin-right:7px">embedding</span>
                  {dashboardStatus.synchronization.embedding.done}/{dashboardStatus.synchronization.embedding.total} chunks</div>
                {#each dashboardStatus.synchronization.embedding.active_files as file (`${file.repo}:${file.path}`)}
                  <div style="display:flex;gap:7px;min-width:0;padding-left:8px;font:11px/1.3 var(--arbol-font-mono)">
                    <span style="color:var(--arbol-color-text)">{file.repo}</span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{file.path}</span>
                    <span style="margin-left:auto;white-space:nowrap">{file.pending_chunks} chunks</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
          {#if dashboardStatus.synchronization.sync.error || dashboardStatus.synchronization.embedding.error}
            <div style="margin-top:7px;color:var(--arbol-color-danger,#e35);font-size:11px">
              {dashboardStatus.synchronization.sync.error ?? dashboardStatus.synchronization.embedding.error}
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <section style="display:flex;align-items:center;gap:16px;margin:0 0 var(--arbol-space-6);padding:14px 16px;
                    border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                    background:var(--arbol-color-surface-2)" aria-labelledby="synchronization-label">
      <div style="min-width:0;flex:1">
        <div id="synchronization-label" style="font-weight:700;font-size:var(--arbol-type-title)">
          Synchronization {synchronizationEnabled ? 'ON' : 'OFF'}
        </div>
        <div style="margin-top:3px;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);line-height:1.4">
          {synchronizationEnabled
            ? 'Sync, ingest, and embedding processes are allowed to run.'
            : 'All sync, ingest, and embedding processes are stopped.'}
        </div>
        {#if synchronizationError}
          <div style="margin-top:5px;color:var(--arbol-color-danger,#e35);font-size:var(--arbol-type-label)">{synchronizationError}</div>
        {/if}
      </div>
      <button type="button" role="switch" aria-checked={synchronizationEnabled}
              aria-label="Synchronization" onclick={toggleSynchronization}
              disabled={synchronizationLoading || synchronizationSaving}
              title={synchronizationEnabled ? 'Stop all synchronization, ingest, and embedding processes' : 'Resume synchronization, ingest, and embedding processes'}
              style="position:relative;flex:0 0 auto;width:48px;height:28px;padding:0;cursor:pointer;
                     border:1px solid {synchronizationEnabled ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
                     border-radius:999px;background:{synchronizationEnabled ? 'var(--arbol-color-accent)' : 'var(--arbol-color-surface)'};
                     opacity:{synchronizationLoading || synchronizationSaving ? 0.55 : 1};transition:background .15s ease">
        <span style="position:absolute;top:3px;left:{synchronizationEnabled ? '23px' : '3px'};width:20px;height:20px;
                     border-radius:50%;background:var(--arbol-color-text);box-shadow:0 1px 3px #0006;transition:left .15s ease"></span>
      </button>
    </section>

    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px">
      <h3 style="font-size:var(--arbol-type-title);font-weight:700;margin:0">Recent activity</h3>
      <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        sync · embed · overlays · RAPTOR · pulls — daemon and CLI alike
      </span>
      <button onclick={load} disabled={loading} style="margin-left:auto;cursor:pointer;background:var(--arbol-color-surface-2);
              color:var(--arbol-color-text);border:1px solid var(--arbol-color-border);
              border-radius:var(--arbol-radius-s);padding:5px 12px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui)">Reload</button>
    </div>

    {#if error}<p style="color:var(--arbol-color-danger,#e35)">{error}</p>{/if}

    {#if loading}
      <p style="color:var(--arbol-color-text-muted)">Loading…</p>
    {:else if !activity.length}
      <p style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        No activity yet — rows appear when a sync pass ingests changes, chunks embed,
        an overlay is added, a RAPTOR tree builds, or <code>mycel pull</code> advances a container's master.
      </p>
    {:else}
      <div style="display:grid;gap:2px;margin-top:8px">
        {#each activity as a (a.id)}
          <details class="activity-row">
          <summary style="display:flex;gap:10px;align-items:baseline;padding:7px 10px;border-radius:var(--arbol-radius-s);
                      background:var(--arbol-color-surface-2);font-size:var(--arbol-type-label)"
               title={new Date(a.ts).toLocaleString()}>
            <span class="chevron" aria-hidden="true">›</span>
            <span style={chip + ';' + (KIND_STYLE[a.kind] ?? 'background:var(--arbol-color-surface);color:var(--arbol-color-text-muted)')}>{a.kind}</span>
            {#if a.repo}<span style="font:600 12px/1.3 var(--arbol-font-mono)">{a.repo}</span>{/if}
            <span style="color:var(--arbol-color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"
                  title={describe(a)}>{describe(a)}</span>
            {#if a.error}<span style="color:var(--arbol-color-danger,#e35)" title={a.error}>⚠</span>{/if}
            {#if a.duration_ms != null}<span style="color:var(--arbol-color-text-muted);font:11px var(--arbol-font-mono)">{dur(a.duration_ms)}</span>{/if}
            <span style={chip + ';background:transparent;color:var(--arbol-color-text-muted);border:1px solid var(--arbol-color-hairline)'}
                  title="who ran it: the taproot daemon or the daemon-less mycel CLI">{a.actor}</span>
            <span style="color:var(--arbol-color-text-muted);font-size:11px;white-space:nowrap">{ago(a.ts)}</span>
          </summary>
          <ActivityDetails activity={a} />
          </details>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .activity-row { background: var(--arbol-color-surface-2); border-radius: var(--arbol-radius-s); min-width: 0; }
  .activity-row summary { cursor: pointer; list-style: none; }
  .activity-row summary::-webkit-details-marker { display: none; }
  .activity-row summary:hover { filter: brightness(1.1); }
  .activity-row summary:focus-visible { outline: 2px solid var(--arbol-color-accent); outline-offset: -2px; }
  .chevron { display: inline-block; transition: transform .15s; color: var(--arbol-color-text-muted); }
  .activity-row[open] .chevron { transform: rotate(90deg); }
</style>
