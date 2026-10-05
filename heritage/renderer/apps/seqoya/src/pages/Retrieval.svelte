<script lang="ts">
  /* Retrieval (Seqoya Lab): the embeddings + RAPTOR console.
   * Embed the corpus, manage Brain Recipes, build the RAPTOR
   * summary tree, and smoke-test collapsed-tree similarity search. */
  import { onMount, onDestroy } from 'svelte'
  import { api, type KnEmbedStatus, type KnSearchResult, type KnCodeSearch,
    type KnBrainRecipe, type KnRaptorStatus, type KnBuildPlan, type KnRegenPlan, type Ip,
    type ModelOption } from '../api'
  import { availableModelOptions, THINKING_LEVELS } from '../constants'

  let { repo = 'Arbol', onSecrets }: { repo?: string; onSecrets: () => void } = $props()

  let status = $state<KnEmbedStatus | null>(null)
  let busy = $state(false)
  let note = $state<string | null>(null)
  let error = $state<string | null>(null)

  let query = $state('')
  let results = $state<KnSearchResult[]>([])
  let codeQuery = $state('')
  let codeRes = $state<KnCodeSearch | null>(null)
  let codeSearching = $state(false)
  let searching = $state(false)

  // Brain Recipes + RAPTOR
  let recipes = $state<KnBrainRecipe[]>([])
  let ips = $state<Ip[]>([])
  let rName = $state(''); let rIp = $state(''); let rModel = $state(''); let rThinking = $state('none')
  // Brain Recipes can use every model exposed by the selected IP. This catalog is
  // intentionally independent from enabled_models, which only curates Elma Chat.
  let rIpModels = $state<ModelOption[]>([])
  let rModelsLoading = $state(false)
  let rModelsError = $state('')
  let summarizer = $state('')
  let editing = $state(false)   // editing an existing recipe (name locked)
  let raptor = $state<KnRaptorStatus | null>(null)
  let raptorError = $state<string | null>(null)
  let raptorNote = $state<string | null>(null)
  let raptorAction = $state<'build' | 'regen' | 'stop' | null>(null)
  let destroyed = false
  let planning = $state(false)
  let planMsg = $state('')
  let plan = $state<{ kind: 'build' | 'regen'; build?: KnBuildPlan; regen?: KnRegenPlan } | null>(null)

  let poll: ReturnType<typeof setInterval> | null = null
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function refresh() {
    try { status = await api.knowledge.embedderStatus(repo) } catch (e) { error = msg(e) }
  }
  async function refreshRaptor() {
    try { raptor = await api.knowledge.raptorStatus(repo) } catch (e) { raptorError = `Could not refresh RAPTOR progress: ${msg(e)}` }
  }
  async function loadConfig() {
    try {
      ;[recipes, ips] = await Promise.all([api.knowledge.brainRecipes(), api.ips()])
      if (!summarizer) summarizer = ''
    } catch (e) { error = msg(e) }
  }

  onMount(() => {
    refreshRaptor(); loadConfig()
    poll = setInterval(() => {
      if (status?.progress.running || status?.local_model?.download?.running) refresh()
      if (raptor?.running) refreshRaptor()
    }, 1500)
  })
  onDestroy(() => { destroyed = true; if (poll) clearInterval(poll) })
  $effect(() => { repo; refresh() })

  async function embed() {
    busy = true; error = null; note = null
    try { const r = await api.knowledge.embedCorpus(); note = r.started ? 'Embedding started…' : 'Already running.'; await refresh() }
    catch (e) { error = msg(e) } finally { busy = false }
  }

  async function downloadLocalModel() {
    busy = true; error = null; note = null
    try { const r = await api.knowledge.localEmbedderDownload(); note = r.started ? 'Downloading local model…' : 'Already downloading.'; await refresh() }
    catch (e) { error = msg(e) } finally { busy = false }
  }

  async function runSearch() {
    if (!query.trim()) return
    searching = true; error = null
    try { results = await api.knowledge.search(query.trim(), 10, repo) }
    catch (e) { error = msg(e) } finally { searching = false }
  }

  async function runCodeSearch() {
    if (!codeQuery.trim()) return
    codeSearching = true; error = null
    try { codeRes = await api.knowledge.codeSearch(codeQuery.trim(), 12, repo) }
    catch (e) { error = msg(e) } finally { codeSearching = false }
  }
  async function ingestCode() {
    busy = true; error = null; note = null
    try { const r = await api.knowledge.ingestCode(repo); note = `Code ingested: ${r.chunks} chunks (${r.added} new, ${r.updated} changed, ${r.removed} removed).` }
    catch (e) { error = msg(e) } finally { busy = false }
  }

  async function saveRecipe() {
    if (!(rName.trim() && rIp && rModel.trim())) return
    busy = true; error = null; note = null
    try {
      await api.knowledge.brainRecipeSave({ name: rName.trim(), ip_name: rIp, model: rModel.trim(), thinking: rThinking })
      note = `Brain Recipe '${rName.trim()}' saved.`
      cancelEdit()
      await loadConfig()
    } catch (e) { error = msg(e) } finally { busy = false }
  }
  async function deleteRecipe(name: string) {
    busy = true; error = null
    try { await api.knowledge.brainRecipeDelete(name); if (editing && rName === name) cancelEdit(); await loadConfig() }
    catch (e) { error = msg(e) } finally { busy = false }
  }
  function editRecipe(r: KnBrainRecipe) { rName = r.name; rIp = r.ip_name; rModel = r.model; rThinking = r.thinking === 'low' ? 'minimum' : r.thinking; editing = true }
  function cancelEdit() { editing = false; rName = ''; rModel = ''; rIp = ''; rThinking = 'none' }

  // Plan/approve gate: preview the work (chunk + summary counts) before generating.
  async function preparePlan(kind: 'build' | 'regen') {
    if (planning || busy || raptor?.running) return
    // An empty recipe selects the assigned RAPTOR recipe on the backend.
    planning = true; raptorError = null; raptorNote = null; plan = null
    planMsg = kind === 'build' ? 'Starting clustering preview…' : 'Counting stale summaries…'
    try {
      if (kind === 'regen') {
        plan = { kind, regen: await api.knowledge.planRegen(repo) }
      } else {
        // The build plan runs the clustering sweep (seconds) as a background task
        // (so it doesn't hog the connection); poll plan_status for the live stage.
        await api.knowledge.planBuild(repo)
        plan = { kind, build: await pollPlanBuild() }
      }
    } catch (e) { raptorError = `Could not prepare RAPTOR plan: ${msg(e)}` } finally { planning = false; planMsg = '' }
  }
  async function pollPlanBuild(): Promise<KnBuildPlan> {
    const deadline = Date.now() + 5 * 60_000
    while (!destroyed) {
      const s = await api.knowledge.planStatus()
      if (s.error) throw new Error(s.error)
      if (s.message) planMsg = s.message
      if (s.done) {
        if (s.result) return s.result
        throw new Error('The plan produced no result. Please try again.')
      }
      if (!s.running) throw new Error('Planning stopped before producing a result. Please try again.')
      if (Date.now() >= deadline) throw new Error('Planning is taking longer than expected. It may still be running; retry to check its progress.')
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    throw new Error('Retrieval page closed.')
  }
  function dismissPlan() { plan = null }
  async function approveRun() {
    if (!plan) return
    const kind = plan.kind
    plan = null
    if (kind === 'build') await build()
    else await regen()
  }

  async function build() { await runRaptor('build') }
  async function regen() { await runRaptor('regen') }
  async function runRaptor(kind: 'build' | 'regen') {
    busy = true; raptorAction = kind; raptorError = null; raptorNote = null
    try {
      const r = kind === 'build'
        ? await api.knowledge.buildTree(summarizer, repo)
        : await api.knowledge.regenSummaries(summarizer, repo)
      raptorNote = r.started
        ? (kind === 'build' ? 'RAPTOR build started…' : 'Regenerating stale summaries…')
        : 'RAPTOR is already running.'
      await refreshRaptor()
    } catch (e) { raptorError = `Could not start RAPTOR ${kind === 'build' ? 'build' : 'regeneration'}: ${msg(e)}` }
    finally { busy = false; raptorAction = null }
  }
  async function stop() {
    busy = true; raptorAction = 'stop'; raptorError = null
    try {
      const r = await api.knowledge.buildTreeStop()
      raptorNote = r.stopping ? 'Stopping — aborting the current summary…' : 'RAPTOR is no longer running.'
      await refreshRaptor()
    } catch (e) { raptorError = `Could not stop RAPTOR: ${msg(e)}` }
    finally { busy = false; raptorAction = null }
  }

  const pct = $derived(status && status.progress.total
    ? Math.round((status.progress.done / status.progress.total) * 100) : 0)
  const raptorPct = $derived(raptor && raptor.tier_total
    ? Math.round((raptor.tier_done / raptor.tier_total) * 100) : 0)
  const recipeIps = $derived(ips.filter((i) => i.provider === 'claude' || i.provider === 'codex' || i.provider === 'zai'))
  const rProvider = $derived(ips.find((i) => i.name === rIp)?.provider ?? '')
  // Fetch the selected IP's complete provider catalog. enabled_models is an Elma
  // Chat preference and must not constrain Brain Recipe creation. The cancel flag
  // drops results from a superseded IP selection.
  $effect(() => {
    const ip = rIp
    if (!ip) { rIpModels = []; rModelsLoading = false; rModelsError = ''; return }
    let cancelled = false
    rIpModels = []
    rModelsLoading = true
    rModelsError = ''
    api.fetchIpModels({ ip_name: ip })
      .then((result) => { if (!cancelled) rIpModels = result.models ?? [] })
      .catch((e) => {
        if (!cancelled) {
          rModelsError = msg(e)
          // Keep recipe creation usable if the provider catalog is temporarily
          // unavailable; the static list is only a failure fallback.
          rIpModels = availableModelOptions(rProvider)
        }
      })
      .finally(() => { if (!cancelled) rModelsLoading = false })
    return () => { cancelled = true }
  })
  // Always keep the current value (e.g. an existing recipe's dated model id)
  // selectable even if the provider no longer publishes it.
  const modelChoices = $derived.by(() => {
    const base: ModelOption[] = rIpModels
    return rModel && !base.some((m) => m.value === rModel)
      ? [{ value: rModel, label: `${rModel} (current)` }, ...base]
      : base
  })
  const btn = 'cursor:pointer;border-radius:var(--arbol-radius-s);padding:6px 14px;' +
    'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);border:1px solid var(--arbol-color-border)'
  const inp = 'padding:7px 10px;font:13px/1.2 var(--arbol-font-mono);border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);outline:none'
  const sect = 'border:1px solid var(--arbol-color-hairline);border-radius:var(--arbol-radius-m);padding:14px;margin:12px 0;background:var(--arbol-color-surface)'
  const h = 'font:600 var(--arbol-type-body)/1.2 var(--arbol-font-ui);margin-bottom:8px'
  const badgeCode = 'font:600 10px/1 var(--arbol-font-mono);padding:2px 5px;border-radius:5px'
</script>

<div style="padding:var(--arbol-space-4) var(--arbol-space-5) 64px;max-width:900px">
  <h1 style="font-size:var(--arbol-type-title);font-weight:700;margin:0 0 4px">Retrieval</h1>
  <p style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin:0 0 16px">
    Embeddings{#if status?.embedder_profile === 'local'} (local <code>{status.local_model?.model ?? 'model'}</code>){:else if status} (Voyage <code>voyage-code-3</code>){/if} + RAPTOR summary tree over the chunk corpus.
  </p>

  {#if note}<div style="margin:8px 0;padding:6px 10px;border-radius:var(--arbol-radius-s);background:#2a83;color:#2a8;font-size:var(--arbol-type-label)">{note}</div>{/if}
  {#if error}<div style="margin:8px 0;padding:6px 10px;border-radius:var(--arbol-radius-s);background:#e3535a22;color:#e35;font-size:var(--arbol-type-label)">{error}</div>{/if}

  <!-- API key -->
  <section style={sect}>
    <div style={h}>Voyage API key
      {#if status}<span style="margin-left:8px;font:600 11px/1 var(--arbol-font-mono);padding:2px 8px;border-radius:6px;background:{status.has_key ? '#2a83' : '#e3535a22'};color:{status.has_key ? '#2a8' : '#e35'}">{status.has_key ? 'configured' : 'not set'}</span>{/if}
    </div>
    <button onclick={onSecrets} style={btn}>Manage in Secrets</button>
  </section>

  <!-- Embed corpus -->
  <section style={sect}>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font:600 var(--arbol-type-body)/1.2 var(--arbol-font-ui)">Embed corpus</div>
      {#if status}<span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">{status.embedded} embedded · {status.pending} pending</span>{/if}
      <button onclick={embed} disabled={busy || !status?.has_key || status?.progress.running} style="{btn};margin-left:auto;background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">{status?.progress.running ? 'Embedding…' : 'Embed corpus'}</button>
    </div>
    {#if status?.progress.running}
      <div style="margin-top:10px;height:6px;border-radius:99px;background:var(--arbol-color-surface-2);overflow:hidden"><div style="height:100%;width:{pct}%;background:var(--arbol-color-accent);transition:width .3s"></div></div>
      <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:4px">{status.progress.done} / {status.progress.total} ({pct}%)</div>
    {/if}
    {#if status?.progress.error}<div style="color:#e35;font-size:var(--arbol-type-label);margin-top:6px">Embedding failed: {status.progress.error}</div>{/if}
    {#if status?.embedder_profile === 'local' && status.local_model}
      {@const lm = status.local_model}
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--arbol-color-text-muted);margin-top:8px">
        <span>Local embedder ({lm.model}, {lm.dim}d — for <strong>local</strong>-profile repos):</span>
        {#if lm.available}
          <span style="color:#2a8;font-weight:600">ready</span>
          <span>· {Math.round(lm.bytes / 1e6)} MB on disk</span>
        {:else if lm.download.running}
          <span>downloading… {Math.round(lm.download.done / 1e6)}/{lm.download.total ? Math.round(lm.download.total / 1e6) : '?'} MB</span>
        {:else}
          <span style="color:#e88200;font-weight:600">not downloaded</span>
          <button onclick={downloadLocalModel} disabled={busy}
                  style="cursor:pointer;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
                         padding:2px 8px;font:600 11px/1.2 var(--arbol-font-ui);background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">Download (~340 MB)</button>
        {/if}
        {#if lm.download.error}<span style="color:#e35">failed: {lm.download.error}</span>{/if}
      </div>
    {/if}
    {#if status?.sync}
      <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-top:8px">
        {#if status.sync.enabled}
          {#if status.sync.watcher}
            Auto-sync on file change ({status.sync.debounce}s debounce; sweep every {Math.round(status.sync.interval / 60)}m as fallback)
          {:else}
            Auto-sync every {Math.round(status.sync.interval / 60)}m — file watcher unavailable{status.sync.watcher_error ? `: ${status.sync.watcher_error}` : ''}
          {/if}
          {#if status.sync.running} · pass running…
          {:else if status.sync.last_ts}
            · last pass {new Date(status.sync.last_ts).toLocaleTimeString()}{#if status.sync.last}&nbsp;· docs {status.sync.last.docs_edited + status.sync.last.docs_new}Δ · code {status.sync.last.code_added + status.sync.last.code_updated + status.sync.last.code_removed}Δ · embedded {status.sync.last.embedded}{/if}
          {:else} · first pass pending{/if}
          {#if status.sync.error} · <span style="color:#e35">failed: {status.sync.error}</span>{/if}
        {:else}
          Auto-sync off (set ARBOL_KN_SWEEP_SECONDS).
        {/if}
      </div>
    {/if}
  </section>

  <!-- RAPTOR tree -->
  <section style={sect}>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font:600 var(--arbol-type-body)/1.2 var(--arbol-font-ui)">RAPTOR tree</div>
      <select bind:value={summarizer} disabled={busy || planning || raptor?.running} style={inp}>
        <option value="">Assigned RAPTOR recipe</option>
        {#each recipes as r (r.name)}<option value={r.name}>{r.name}</option>{/each}
      </select>
      {#if raptor?.running}
        <button onclick={stop} disabled={busy} style="{btn};margin-left:auto;background:#e3535a22;color:#e35;border-color:transparent">Stop</button>
      {:else}
        <button onclick={() => preparePlan('build')} disabled={busy || planning || (status?.pending ?? 1) > 0}
                title={(status?.pending ?? 0) > 0 ? 'Embed the corpus first' : 'Preview a full clear-and-rebuild before running'}
                style="{btn};margin-left:auto;background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent">Rebuild RAPTOR tree</button>
        <button onclick={() => preparePlan('regen')} disabled={busy || planning || (raptor?.stale_summaries ?? 0) === 0}
                title={(raptor?.stale_summaries ?? 0) > 0 ? `Preview regenerating the ${raptor?.stale_summaries} stale node(s)` : 'No stale summaries to regenerate'}
                style="{btn};background:#e8820022;color:#e88200;border-color:transparent">Regenerate stale summaries{(raptor?.stale_summaries ?? 0) > 0 ? ` (${raptor?.stale_summaries})` : ''}</button>
      {/if}
    </div>
    {#if raptorError}
      <div role="alert" style="color:#e35;font-size:var(--arbol-type-label);margin-top:8px">{raptorError}</div>
    {/if}
    {#if raptorNote && !raptor?.done}
      <div role="status" style="font-size:var(--arbol-type-label);margin-top:8px">{raptorNote}</div>
    {/if}
    {#if planning || raptorAction}
      <div role="status" style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:8px">
        {planning ? `Preparing plan… ${planMsg}` : raptorAction === 'stop' ? 'Requesting stop…' : raptorAction === 'regen' ? 'Starting regeneration…' : 'Starting RAPTOR build…'}
      </div>
      <progress aria-label="RAPTOR operation progress" style="display:block;width:100%;height:6px;margin-top:6px;accent-color:var(--arbol-color-accent)"></progress>
    {/if}
    {#if !planning && !raptorAction && !raptor?.running}
      <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-top:6px">
        {#if !status}Rebuild availability is loading.
        {:else if status.pending > 0}Embed the {status.pending} pending chunk(s) before rebuilding.{/if}
        {#if !raptor}Regeneration availability is loading.
        {:else if (raptor.stale_summaries ?? 0) === 0}No stale summaries to regenerate.{/if}
      </div>
    {/if}
    {#if raptor?.max_concurrency}
      <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-top:6px">
        Summarises up to {raptor.max_concurrency} clusters in parallel.
      </div>
    {/if}
    {#if raptor?.running}
      <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:8px">
        {raptor.mode === 'regen' ? 'Regenerating' : 'Building'} · tier {raptor.tier} · {raptor.tier_done}/{raptor.tier_total || '?'} this tier · {raptor.summaries} {raptor.mode === 'regen' ? 'regenerated' : 'built'} total
      </div>
      <progress aria-label="RAPTOR tier progress" max="100" value={raptor.tier_total ? raptorPct : undefined}
        style="display:block;width:100%;height:6px;margin-top:6px;accent-color:var(--arbol-color-accent)"></progress>
      {#if raptor.message}
        <div style="margin-top:8px;font-size:12px;color:var(--arbol-color-text-muted)">{raptor.message}</div>
      {/if}
      {#if raptor.active_jobs?.length}
        <div style="margin-top:8px">
          <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-bottom:3px">
            {raptor.active_jobs.length} generating now (of up to {raptor.max_concurrency ?? '…'}):
          </div>
          <!-- Plain block container (NOT a flex column): a max-height flex column
               shrinks its rows vertically to fit, clipping the text to slivers. -->
          <div style="max-height:220px;overflow-y:auto">
            {#each raptor.active_jobs.slice().sort((a, b) => a.tier - b.tier || a.ordinal - b.ordinal) as j (j.tier + '-' + j.ordinal)}
              <div style="display:flex;gap:8px;align-items:baseline;min-width:0;padding:3px 0;line-height:1.4">
                <span style="flex:none;font-weight:600;font-size:12px;font-family:var(--arbol-font-mono);color:#8a7be8">L{j.tier} #{j.ordinal}</span>
                <span style="flex:none;font-size:12px;font-family:var(--arbol-font-mono);color:var(--arbol-color-text-muted)">{j.members} ch</span>
                <span style="flex:1 1 auto;min-width:0;font-size:13px;font-family:var(--arbol-font-ui);color:var(--arbol-color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                      title={j.preview}>{j.preview || '—'}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else if plan}
      <div style="margin-top:10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
                  background:var(--arbol-color-surface-2);padding:12px 14px">
        {#if plan.kind === 'build' && plan.build}
          <div style="font:600 var(--arbol-type-label)/1.3 var(--arbol-font-ui);margin-bottom:6px">Rebuild plan — clears the existing tree</div>
          <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-bottom:8px">
            {plan.build.corpus_chunks} corpus chunks → about {plan.build.total_summaries} summaries across {plan.build.tiers.length} tier(s); {plan.build.top_nodes} top node(s) remain.
          </div>
          <div style="font:12px/1.5 var(--arbol-font-mono)">
            {#each plan.build.tiers as t}
              <div>tier {t.tier}: {t.nodes_in} nodes → <strong>{t.summaries}</strong> summaries{t.carried ? ` · ${t.carried} carried up` : ''}</div>
            {/each}
          </div>
          <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-top:8px">Tier 1 is exact; upper tiers are estimated (summary embeddings approximated by member centroids).</div>
        {:else if plan.kind === 'regen' && plan.regen}
          <div style="font:600 var(--arbol-type-label)/1.3 var(--arbol-font-ui);margin-bottom:6px">Regenerate plan — in place, no re-clustering</div>
          <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-bottom:8px">
            {plan.regen.stale_summaries} stale summary node(s) re-summarised from {plan.regen.members} source chunk(s).
          </div>
          <div style="font:12px/1.5 var(--arbol-font-mono)">
            {#each plan.regen.by_tier as t}<div>tier {t.tier}: <strong>{t.count}</strong> stale</div>{/each}
          </div>
        {/if}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick={approveRun} disabled={busy || (plan.kind === 'build' && (plan.build?.total_summaries ?? 0) === 0)}
                  style="{btn};background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent">Approve &amp; Run</button>
          <button onclick={dismissPlan} disabled={busy} style={btn}>Dismiss</button>
        </div>
      </div>
    {:else if !planning && !raptorAction && raptor?.error}
      <div role="alert" style="color:#e35;font-size:var(--arbol-type-label);margin-top:8px">{raptor.mode === 'regen' ? 'Regeneration' : 'Build'} failed: {raptor.error}</div>
    {:else if !planning && !raptorAction && raptor?.cancelled}
      <div style="color:var(--arbol-color-warn,#e88200);font-size:var(--arbol-type-label);margin-top:8px">Stopped — {raptor.summaries} node(s) {raptor.mode === 'regen' ? 'regenerated' : 'built'} across {raptor.tiers} tier(s).</div>
    {:else if !planning && !raptorAction && raptor?.done}
      <div style="color:#2a8;font-size:var(--arbol-type-label);margin-top:8px">{raptor.mode === 'regen' ? `Regenerated ${raptor.summaries} stale summary node(s).` : `Built ${raptor.tiers} tier(s), ${raptor.summaries} summary nodes, ${raptor.top_nodes} top node(s).`}</div>
    {/if}
  </section>

  <!-- Search -->
  <section style={sect}>
    <div style={h}>Search (collapsed-tree top-k)</div>
    <div style="display:flex;gap:8px">
      <input bind:value={query} onkeydown={(e) => e.key === 'Enter' && runSearch()} placeholder="ask something…" style="flex:1;{inp};font-family:var(--arbol-font-ui)" />
      <button onclick={runSearch} disabled={searching || !query.trim() || !status?.has_key} style="{btn};background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent">{searching ? '…' : 'Search'}</button>
    </div>
    {#each results as r (r.id)}
      <div style="border-top:1px solid var(--arbol-color-hairline);padding:8px 0;margin-top:8px">
        <div style="display:flex;gap:8px;align-items:baseline;font:600 var(--arbol-type-label)/1.3 var(--arbol-font-mono)">
          <span style="color:var(--arbol-color-accent)">{r.score.toFixed(3)}</span>
          <span>{r.chunk}</span>
          {#if r.heartwood}
            <span style="flex:none;font:600 10px/1 var(--arbol-font-mono);padding:2px 6px;border-radius:5px;background:#8a6d3b33;color:#c9a25e"
                  title="Heartwood — time-frozen record, not current truth{r.heartwood.implemented ? ` · implemented ${r.heartwood.implemented}` : ''}{r.heartwood.outdated ? ` · outdated ${r.heartwood.outdated}` : ''}">
              heartwood{r.heartwood.outdated ? ` · ${r.heartwood.outdated}` : ''}</span>
          {/if}
          <span style="margin-left:auto;color:var(--arbol-color-text-muted);font-weight:400">{r.origin === 'summary' ? `summary L${r.tier}` : 'leaf'}</span>
        </div>
        <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin-top:3px;white-space:pre-wrap">{r.preview}</div>
      </div>
    {/each}
  </section>

  <!-- Code search: hybrid dense (voyage-code-3) + BM25 (pg_search), RRF-fused -->
  <section style={sect}>
    <div style="display:flex;align-items:baseline;gap:12px">
      <div style={h}>Code search (hybrid: dense + BM25)</div>
      <button onclick={ingestCode} disabled={busy} title="Re-chunk the code corpus into the store"
              style="{btn};margin-left:auto">Ingest code</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input bind:value={codeQuery} onkeydown={(e) => e.key === 'Enter' && runCodeSearch()} placeholder="find code by meaning or identifier…" style="flex:1;{inp};font-family:var(--arbol-font-ui)" />
      <button onclick={runCodeSearch} disabled={codeSearching || !codeQuery.trim()} style="{btn};background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent">{codeSearching ? '…' : 'Search'}</button>
    </div>
    {#if codeRes}
      <div style="font-size:11px;color:var(--arbol-color-text-muted);margin-top:6px">
        dense arm: {codeRes.dense} hit(s){codeRes.dense === 0 ? ' (code not embedded yet — run “Embed corpus”)' : ''} · BM25 arm: {codeRes.bm25} hit(s)
      </div>
      {#each codeRes.results as h (h.id)}
        <div style="border-top:1px solid var(--arbol-color-hairline);padding:8px 0;margin-top:8px">
          <div style="display:flex;gap:8px;align-items:baseline;font:600 var(--arbol-type-label)/1.3 var(--arbol-font-mono);flex-wrap:wrap">
            <span style="color:var(--arbol-color-accent)">{h.score.toFixed(4)}</span>
            <span>{h.path}<span style="color:var(--arbol-color-text-muted)">#{h.symbol}</span></span>
            <span style="margin-left:auto;display:flex;gap:4px">
              {#if h.dense_rank}<span style={badgeCode + ';background:#6a5acd33;color:#8a7be8'}>dense #{h.dense_rank}</span>{/if}
              {#if h.bm25_rank}<span style={badgeCode + ';background:#2a8f6a33;color:#39b58a'}>bm25 #{h.bm25_rank}</span>{/if}
              <span style={badgeCode + ';background:#8882;color:var(--arbol-color-text-muted)'}>{h.lang} L{h.line_start}-{h.line_end}</span>
            </span>
          </div>
          {#if h.via}
            <div style="font-size:11px;margin-top:2px;color:#c9a25e">
              ⇐ via {h.via.doc}
              {#if h.via.stale}<span style="color:#e3535a" title="the doc section is stale — its sources moved since it was written"> · ⚠ stale</span>{/if}
              {#if h.via.heartwood}<span title="time-frozen record, not current truth"> · heartwood</span>{/if}
            </div>
          {/if}
          {#if h.documented_in?.length}
            <div style="font-size:11px;margin-top:2px;color:var(--arbol-color-text-muted)">
              documented in: {#each h.documented_in as d, i}{i ? ' · ' : ''}{d.doc}{#if d.stale}<span style="color:#e3535a"> ⚠</span>{/if}{/each}
            </div>
          {/if}
          <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin-top:3px;white-space:pre-wrap;font-family:var(--arbol-font-mono)">{h.preview}</div>
        </div>
      {/each}
      {#if !codeRes.results.length}<div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin-top:8px">No matches.</div>{/if}
    {/if}
  </section>
</div>
