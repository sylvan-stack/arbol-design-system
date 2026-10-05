<script lang="ts">
  /* Refresher (Seqoya Lab): the freshness console. Lists open Drifts (a derived
   * chunk whose source changed) with the changed source; "Refresh" re-runs the
   * detection pipeline, "Open drifts" turns current stale chunks into Drifts. */
  import { onMount } from 'svelte'

  let { repo = 'Arbol' }: { repo?: string } = $props()
  import { api, type KnDrift, type KnStatus } from '../api'

  let drifts = $state<KnDrift[]>([])
  let status = $state<KnStatus | null>(null)
  let loading = $state(true)
  let busy = $state(false)
  let msg = $state<string | null>(null)
  let error = $state<string | null>(null)

  async function reload() {
    loading = true; error = null
    try {
      const [s, d] = await Promise.all([api.knowledge.status(repo), api.knowledge.drifts(repo)])
      status = s; drifts = d
    } catch (e) { error = e instanceof Error ? e.message : String(e) }
    finally { loading = false }
  }
  onMount(reload)

  async function run(label: string, fn: () => Promise<string>) {
    busy = true; msg = null; error = null
    try { msg = await fn(); await reload() }
    catch (e) { error = e instanceof Error ? e.message : String(e) }
    finally { busy = false }
  }
  const refresh = () => run('refresh', async () => {
    const r = await api.knowledge.refresh(repo)
    return `Refreshed — ${r.stale ?? 0} stale chunk(s) across ${r.edges ?? 0} edge(s).`
  })
  const openDrifts = () => run('open', async () => {
    const r = await api.knowledge.openDrifts(repo)
    return r.opened ? `Opened ${r.opened} drift(s).` : 'No new drifts to open.'
  })

  const fmt = (ms: number) => new Date(ms).toLocaleString()
  const btn = 'cursor:pointer;border-radius:var(--arbol-radius-s);padding:6px 14px;' +
    'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);border:1px solid var(--arbol-color-border)'
</script>

<div style="padding:var(--arbol-space-4) var(--arbol-space-5) 64px;max-width:1000px">
  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px">
    <h1 style="font-size:var(--arbol-type-title);font-weight:700;margin:0">Refresher</h1>
    {#if status}
      <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        {status.stale} stale · {status.open_drifts} open drifts · {status.edges} edges
      </span>
    {/if}
    <div style="margin-left:auto;display:flex;gap:8px">
      <button onclick={refresh} disabled={busy}
        style="{btn};background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent;opacity:{busy ? 0.6 : 1}">
        {busy ? 'Working…' : 'Refresh'}</button>
      <button onclick={openDrifts} disabled={busy}
        style="{btn};background:var(--arbol-color-surface-2);color:var(--arbol-color-text);opacity:{busy ? 0.6 : 1}">
        Open drifts</button>
    </div>
  </div>

  <p style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin:0 0 14px;max-width:680px">
    A <strong>Drift</strong> is opened when a derived chunk's source changes. <em>Refresh</em> re-ingests,
    re-hashes tracked sources, and re-runs detection; <em>Open drifts</em> records a work item for each stale chunk.
  </p>

  {#if msg}<div style="margin-bottom:12px;padding:8px 10px;border-radius:var(--arbol-radius-s);
        background:#2a83;color:#2a8;font-size:var(--arbol-type-label)">{msg}</div>{/if}
  {#if error}<div style="margin-bottom:12px;padding:8px 10px;border-radius:var(--arbol-radius-s);
        background:#e3535a22;color:#e35;font-size:var(--arbol-type-label)">Failed: {error}</div>{/if}

  {#if loading}
    <p style="color:var(--arbol-color-text-muted)">Loading…</p>
  {:else if !drifts.length}
    <div style="padding:28px;text-align:center;color:var(--arbol-color-text-muted);
                border:1px dashed var(--arbol-color-hairline);border-radius:var(--arbol-radius-m)">
      No open drifts. {status && status.stale ? 'Click “Open drifts” to record the current stale chunks.' : 'Everything tracked is fresh.'}
    </div>
  {:else}
    {#each drifts as d (d.id)}
      <div style="border:1px solid var(--arbol-color-hairline);border-left:3px solid #e3535a;
                  border-radius:var(--arbol-radius-m);padding:10px 12px;margin:8px 0;background:var(--arbol-color-surface)">
        <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-mono)">{d.chunk}</div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-top:6px;
                    font:12px/1.4 var(--arbol-font-mono);color:var(--arbol-color-text-muted)">
          {#if d.sources.length}
            {#each d.sources as s (s.id ?? s.label)}
              <span>⇠ source: <span style="color:var(--arbol-color-link)">{s.label ?? '—'}</span>
                <span style="opacity:0.75"> · {s.reason ?? ''}</span></span>
            {/each}
          {:else}
            <span>⇠ source: <span style="color:var(--arbol-color-link)">{d.source ?? '—'}</span>
              <span style="opacity:0.75"> · {d.reason ?? ''}</span></span>
          {/if}
          <span style="opacity:0.7">opened {fmt(d.opened_at)}</span>
        </div>
      </div>
    {/each}
  {/if}
</div>
