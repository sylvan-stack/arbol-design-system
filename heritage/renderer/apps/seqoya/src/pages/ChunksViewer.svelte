<script lang="ts">
  /* Chunks Viewer (Seqoya Lab): the knowledge catalog made visible — artifacts →
   * expandable chunks → chunk details (id, heading path, hashes, role, status,
   * derivation, staleness). Reads `knowledge.chunks` from Core. */
  import { tick, untrack } from 'svelte'
  import { api, type KnChunksView, type KnChunk, type KnDerivation } from '../api'

  let { repo = 'Arbol' }: { repo?: string } = $props()

  let view = $state<KnChunksView | null>(null)
  let showCorpus = $state(true)
  let showRaptor = $state(false)
  let showCode = $state(false)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let filter = $state('')

  // Paginate at the artifact level: large repos have thousands of code
  // files, and loading every chunk's raw_text at once is prohibitive.
  const PAGE_SIZE = 10
  let page = $state(0)
  let requestId = 0
  let expanded = $state<Record<string, boolean>>({})

  const totalPages = $derived(view ? Math.max(1, Math.ceil(view.artifact_count / PAGE_SIZE)) : 1)
  const pageStart = $derived(view && view.artifact_count ? page * PAGE_SIZE + 1 : 0)
  const pageEnd = $derived(view ? Math.min((page + 1) * PAGE_SIZE, view.artifact_count) : 0)

  async function load() {
    const currentRequest = ++requestId
    loading = true; error = null
    try {
      const result = await api.knowledge.chunks(showCorpus, showRaptor, showCode, repo, PAGE_SIZE, page * PAGE_SIZE)
      if (currentRequest !== requestId) return
      view = result
      expanded = {}
    } catch (e) {
      if (currentRequest === requestId) error = e instanceof Error ? e.message : String(e)
    } finally {
      if (currentRequest === requestId) loading = false
    }
  }
  // Toggling which sets are shown changes the artifact span → back to page 1.
  function toggleCorpus() { showCorpus = !showCorpus; page = 0; load() }
  function toggleRaptor() { showRaptor = !showRaptor; page = 0; load() }
  function toggleCode() { showCode = !showCode; page = 0; load() }
  function goPage(n: number) {
    const np = Math.min(Math.max(0, n), totalPages - 1)
    if (np !== page) { page = np; load() }
  }
  $effect(() => {
    // Reload when the selected repository changes; ignore superseded responses.
    void repo
    untrack(() => {
      page = 0
      view = null
      load()
    })
    return () => { ++requestId }
  })

  // Navigate to a derivation source: make sure its set is shown (+ reloaded),
  // clear the filter so it renders, then expand its <details> and scroll to it.
  async function openChunk(d: KnDerivation) {
    filter = ''
    if (d.origin === 'summary' && !showRaptor) { showRaptor = true; await load() }
    else if (d.origin === 'code' && !showCode) { showCode = true; await load() }
    else if (d.origin === 'corpus' && !showCorpus) { showCorpus = true; await load() }
    await tick()
    const el = document.getElementById('chunk-' + d.parent_id)
    if (!el) return
    for (let n: HTMLElement | null = el; n; n = n.parentElement)
      if (n.tagName === 'DETAILS') (n as HTMLDetailsElement).open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.outline = '2px solid #69f'
    setTimeout(() => { el.style.outline = '' }, 1200)
  }

  const q = $derived(filter.trim().toLowerCase())
  function hit(path: string, c: KnChunk): boolean {
    if (!q) return true
    return (path + ' ' + c.natural_key + ' ' + c.raw_text).toLowerCase().includes(q)
  }

  const togBtn = (on: boolean) =>
    'cursor:pointer;border:none;padding:5px 12px;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);' +
    (on ? 'background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink,#fff)'
        : 'background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted)')

  const pagerBtn = (dis: boolean) =>
    'cursor:pointer;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);' +
    'padding:4px 10px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui);' +
    'background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    (dis ? 'opacity:0.4;cursor:default' : '')

  const badge = 'font:600 11px/1 var(--arbol-font-mono);padding:2px 6px;border-radius:6px;margin-left:6px'
  const roleStyle = (r: string) =>
    r === 'derived' ? 'background:#e8820033;color:#e88200'
    : r === 'authored' ? 'background:#8882;color:var(--arbol-color-text-muted)'
    : 'background:transparent;color:var(--arbol-color-text-muted);border:1px dashed var(--arbol-color-hairline)'
</script>

<div style="padding:var(--arbol-space-4) var(--arbol-space-5) 64px;max-width:1100px">
  <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px">
    <h1 style="font-size:var(--arbol-type-title);font-weight:700;margin:0">Chunks Viewer</h1>
    {#if view}
      <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        {view.artifact_count} artifacts · {view.total_chunks} chunks
      </span>
    {/if}
    <div style="margin-left:auto;display:flex;border:1px solid var(--arbol-color-border);
                border-radius:var(--arbol-radius-s);overflow:hidden">
      <button onclick={toggleCorpus} disabled={loading} style={togBtn(showCorpus)}>Corpus chunks</button>
      <button onclick={toggleRaptor} disabled={loading}
              style={togBtn(showRaptor) + ';border-left:1px solid var(--arbol-color-border)'}>RAPTOR chunks</button>
      <button onclick={toggleCode} disabled={loading}
              style={togBtn(showCode) + ';border-left:1px solid var(--arbol-color-border)'}>Codebase</button>
    </div>
    <button onclick={load} disabled={loading} style="cursor:pointer;background:var(--arbol-color-surface-2);
            color:var(--arbol-color-text);border:1px solid var(--arbol-color-border);
            border-radius:var(--arbol-radius-s);padding:5px 12px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui)">Reload</button>
  </div>

  <input bind:value={filter} placeholder="filter by path / heading / text… (current page)"
         style="width:100%;padding:8px 10px;margin:10px 0 14px;font:13px/1.2 var(--arbol-font-mono);
                border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
                background:var(--arbol-color-surface-2);color:var(--arbol-color-text);outline:none" />

  {@render pager()}

  {#if loading}
    <p style="color:var(--arbol-color-text-muted)">Loading…</p>
  {:else if error}
    <p style="color:var(--arbol-color-danger,#e35)">Failed: {error}</p>
  {:else if !showCorpus && !showRaptor && !showCode}
    <p style="color:var(--arbol-color-text-muted)">Select <strong>Corpus chunks</strong>, <strong>RAPTOR chunks</strong> or <strong>Codebase</strong> above.</p>
  {:else if view}
    {#if !view.artifacts.length}
      <p style="color:var(--arbol-color-text-muted)">No chunks found for the selected sources in {repo}.</p>
    {:else if !view.artifacts.some(art => art.chunks.some(c => hit(art.path, c)))}
      <p style="color:var(--arbol-color-text-muted)">No matches on this page. Try another page or change the filter.</p>
    {/if}
    {#each view.artifacts as art (art.path)}
      {@const shown = art.chunks.filter((c) => hit(art.path, c))}
      {#if shown.length}
        <details style="border:1px solid var(--arbol-color-hairline);border-radius:var(--arbol-radius-m);
                        margin:6px 0;background:var(--arbol-color-surface)">
          <summary style="cursor:pointer;padding:8px 10px;font:600 var(--arbol-type-body)/1.2 var(--arbol-font-mono)">
            {art.path}
            <span style="color:var(--arbol-color-text-muted);font-weight:400;margin-left:6px">{art.chunk_count} chunks</span>
            {#if art.heartwood}
              <span style="font:600 10px/1 var(--arbol-font-mono);padding:2px 6px;border-radius:5px;background:#8a6d3b33;color:#c9a25e;margin-left:6px"
                    title="Heartwood — time-frozen record, exempt from Detection{art.heartwood.implemented ? ` · implemented ${art.heartwood.implemented}` : ''}{art.heartwood.outdated ? ` · outdated ${art.heartwood.outdated}` : ''}">
                heartwood{art.heartwood.outdated ? ` · ${art.heartwood.outdated}` : ''}</span>
            {/if}
          </summary>
          <div style="padding:2px 8px 8px">
            {#each shown as c (c.id)}
              <details id={'chunk-' + c.id} ontoggle={(event) => { expanded[c.id] = event.currentTarget.open }} style="margin:4px 0 4px {(Math.max(0, c.level - 1)) * 14}px;
                              border:1px solid var(--arbol-color-hairline);border-radius:var(--arbol-radius-s);
                              {c.stale ? 'box-shadow:inset 3px 0 #e3535a' : ''}">
                <summary style="cursor:pointer;padding:6px 9px;font:600 var(--arbol-type-label)/1.3 var(--arbol-font-mono)">
                  <span style="color:var(--arbol-color-text-muted)">{c.origin === 'summary' ? `L${c.tier}` : c.origin === 'code' ? (c.symbol_kind ?? 'code') : `H${c.level}`}</span> {c.natural_key}
                  {#if c.origin === 'summary'}<span style={badge + ';background:#6a5acd33;color:#8a7be8'}>summary L{c.tier}</span>
                  {:else if c.origin === 'code'}<span style={badge + ';background:#2a8f6a33;color:#39b58a'}>{c.lang}{c.line_start ? ` L${c.line_start}-${c.line_end}` : ''}</span>
                  {:else}<span style={badge + ';' + roleStyle(c.role)}>{c.role}</span>{/if}
                  {#if c.stale}<span style={badge + ';background:#e3535a;color:#fff'}>stale</span>{/if}
                  {#if c.unresolved_sources?.length}<span style={badge + ';background:#e3535a33;color:#e3535a'}
                        title="Source Refs that did not resolve at ingest:&#10;{c.unresolved_sources.join('\n')}">⚠ {c.unresolved_sources.length} unresolved</span>{/if}
                  {#if c.derives_from.length}<span style="color:#69f;margin-left:6px">⇠{c.derives_from.length}</span>{/if}
                </summary>
                {#if expanded[c.id]}
                <div style="padding:8px 12px 12px">
                  <dl style="display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0 0 10px;
                             font:12px/1.4 var(--arbol-font-mono)">
                    <dt style="color:var(--arbol-color-text-muted)">id</dt><dd style="margin:0">{c.id}</dd>
                    <dt style="color:var(--arbol-color-text-muted)">parent</dt><dd style="margin:0">{c.parent ?? '—'}</dd>
                    <dt style="color:var(--arbol-color-text-muted)">level / ordinal</dt><dd style="margin:0">H{c.level} / #{c.ordinal}</dd>
                    <dt style="color:var(--arbol-color-text-muted)">role</dt><dd style="margin:0">{c.role}</dd>
                    <dt style="color:var(--arbol-color-text-muted)">chars</dt><dd style="margin:0">{c.chars}</dd>
                    <dt style="color:var(--arbol-color-text-muted)">content_hash</dt><dd style="margin:0">{c.content_hash.slice(0, 16)}…</dd>
                    {#if c.status}<dt style="color:var(--arbol-color-text-muted)">status</dt><dd style="margin:0">{c.status}</dd>{/if}
                    {#if c.prev}<dt style="color:var(--arbol-color-text-muted)">renamed from</dt><dd style="margin:0">{c.prev}</dd>{/if}
                    {#if c.derives_from.length}
                      <dt style="color:var(--arbol-color-text-muted)">derives from</dt>
                      <dd style="margin:0">
                        {#each c.derives_from as d}
                          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:baseline">
                            <button type="button" onclick={() => openChunk(d)} title="Open this source chunk"
                                    style="cursor:pointer;background:none;border:none;padding:0;text-align:left;
                                           color:#69f;font:inherit;text-decoration:underline">{d.path}{d.parent ? ' › ' + d.parent : ''}</button>
                            <span style="color:var(--arbol-color-text-muted)" title="parent content_hash at generation time">@{d.hash_at_gen ? d.hash_at_gen.slice(0, 12) + '…' : '—'}</span>
                            {#if d.drifted}<span style="color:#e35" title="parent has changed since generation — now {d.current.slice(0, 12)}…">≠ drifted</span>{/if}
                          </div>
                        {/each}
                      </dd>
                    {/if}
                    {#if c.stale_because}<dt style="color:var(--arbol-color-text-muted)">stale because</dt><dd style="margin:0">{c.stale_because}</dd>{/if}
                    {#if c.unresolved_sources?.length}
                      <dt style="color:#e3535a">unresolved sources</dt>
                      <dd style="margin:0">{#each c.unresolved_sources as u}<div>{u}</div>{/each}</dd>
                    {/if}
                  </dl>
                  <pre style="background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-hairline);
                              border-radius:var(--arbol-radius-s);padding:10px;overflow-x:auto;font-size:12px;
                              white-space:pre-wrap;margin:0">{c.raw_text}</pre>
                </div>
                {/if}
              </details>
            {/each}
          </div>
        </details>
      {/if}
    {/each}
    {@render pager()}
  {/if}
</div>

{#snippet pager()}
  {#if view && totalPages > 1}
    <div style="display:flex;align-items:center;gap:10px;margin:12px 0;
                font:500 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted)">
      <button onclick={() => goPage(0)} disabled={loading || page === 0} style={pagerBtn(page === 0)}>« First</button>
      <button onclick={() => goPage(page - 1)} disabled={loading || page === 0} style={pagerBtn(page === 0)}>‹ Prev</button>
      <span style="font-family:var(--arbol-font-mono)">
        {pageStart}–{pageEnd} of {view.artifact_count} artifacts · page {page + 1}/{totalPages}
      </span>
      <button onclick={() => goPage(page + 1)} disabled={loading || page >= totalPages - 1} style={pagerBtn(page >= totalPages - 1)}>Next ›</button>
      <button onclick={() => goPage(totalPages - 1)} disabled={loading || page >= totalPages - 1} style={pagerBtn(page >= totalPages - 1)}>Last »</button>
    </div>
  {/if}
{/snippet}
