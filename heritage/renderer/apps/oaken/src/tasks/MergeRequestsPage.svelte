<script lang="ts">
  import { entityLinkTarget, type EntityLinkReference } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import { MERGE_REQUESTS_CORPUS, fetchMyOpenMergeRequests, importMergeRequest, loadMergeRequests, syncMergeRequest, type MergeRequest } from './mergeRequests'
  import MergeRequestReview from './MergeRequestReview.svelte'

  let { requestedId = null, requestId = 0 }: { requestedId?: string | null; requestId?: number } = $props()

  let items = $state<MergeRequest[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let importing = $state(false)
  let fetchingMine = $state(false)
  let notice = $state<string | null>(null)
  let syncingId = $state<string | null>(null)
  let query = $state('')
  let selected = $state<MergeRequest | null>(null)
  let expandedIds = $state<Record<string, boolean>>({})

  let handledRequestId = $state(-1)
  $effect(() => {
    if (!requestedId || loading || handledRequestId === requestId) return
    const match = items.find((item) => item.id.toLocaleLowerCase() === requestedId.toLocaleLowerCase())
    if (match) { handledRequestId = requestId; selected = match }
  })

  async function refresh() {
    loading = true
    error = null
    try { items = await loadMergeRequests() }
    catch (e) { error = e instanceof Error ? e.message : 'Could not load merge requests' }
    finally { loading = false }
  }

  async function fetchMine() {
    if (fetchingMine || loading) return
    fetchingMine = true
    error = null
    notice = null
    try {
      const result = await fetchMyOpenMergeRequests()
      await refresh()
      notice = result.failed ? `${result.message}; ${result.failed} could not be fetched.` : result.message
    } catch (e) { error = e instanceof Error ? e.message : 'Could not fetch your open merge requests' }
    finally { fetchingMine = false }
  }

  async function add() {
    const url = window.prompt('Paste one GitLab merge request URL')?.trim()
    if (!url || importing) return
    importing = true
    error = null
    try { await importMergeRequest(url); await refresh() }
    catch (e) { error = e instanceof Error ? e.message : 'Could not import merge request' }
    finally { importing = false }
  }

  async function sync(item: MergeRequest) {
    if (syncingId) return
    syncingId = item.id
    error = null
    try { await syncMergeRequest(item); await refresh() }
    catch (e) { error = e instanceof Error ? e.message : 'Could not sync merge request' }
    finally { syncingId = null }
  }

  function toggle(item: MergeRequest) {
    expandedIds = { ...expandedIds, [item.id]: !expandedIds[item.id] }
  }

  function activate(event: KeyboardEvent, item: MergeRequest) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle(item)
  }

  function formatUpdated(value: string) {
    return value ? new Date(value).toLocaleString() : 'Unknown'
  }

  function mergeRequestLinkTarget(item: MergeRequest): EntityLinkReference {
    return {
      repo: item.project || 'Any',
      kind: 'mr',
      entityId: item.id,
      title: `${item.id}: ${item.title}`,
      lookup: { corpus: MERGE_REQUESTS_CORPUS, relativePath: item.sourcePath },
    }
  }

  const filtered = $derived(items.filter((item) => {
    const needle = query.trim().toLocaleLowerCase()
    return !needle || [item.id, item.title, item.project, item.author, item.state].some((value) => value.toLocaleLowerCase().includes(needle))
  }))
  onMount(() => { void refresh() })
</script>

{#if selected}
  <MergeRequestReview item={selected} onBack={() => selected = null} />
{:else}
  <section class="mr-page">
    <header class="mr-page-heading">
      <div>
        <div class="mr-kicker">Tasks · GitLab</div>
        <h1>Merge Requests</h1>
        <p>Imported GitLab merge requests. Expand an item for its summary, then open details to review its changes.</p>
      </div>
      <div class="mr-tools">
        <label><span class="sr-only">Filter merge requests</span><input bind:value={query} type="search" placeholder="Filter merge requests…" /></label>
        <button onclick={() => void fetchMine()} disabled={loading || fetchingMine} title="Fetch all open merge requests authored by you from configured repositories, then reload the list">{fetchingMine ? 'Fetching my MRs…' : loading ? 'Loading…' : 'Refresh'}</button>
        <button class="primary" onclick={add} disabled={importing}>{importing ? 'Importing…' : 'Import merge request'}</button>
      </div>
    </header>

    {#if error}<div class="mr-state error" role="alert">{error}</div>
    {:else if notice}<div class="mr-notice" role="status">{notice}<button onclick={() => (notice = null)} aria-label="Dismiss">×</button></div>{/if}
    {#if loading}<div class="mr-state">Loading merge requests…</div>
    {:else if !filtered.length}<div class="mr-state">No merge requests yet. Paste a GitLab merge request link into Quick Input, or import one here.</div>
    {:else}
      <div class="mr-list">
        {#each filtered as item (item.id)}
          <article class="mr-item" class:expanded={expandedIds[item.id]} use:entityLinkTarget={mergeRequestLinkTarget(item)}>
            <div class="mr-item-main" role="button" tabindex="0" aria-expanded={expandedIds[item.id] ?? false} aria-controls={`mr-details-${item.id}`} onclick={() => toggle(item)} onkeydown={(event) => activate(event, item)}>
              <div class="mr-id"><i class="mr-chevron" aria-hidden="true">›</i><strong>{item.id}</strong><small>{item.project}</small></div>
              <div class="mr-copy"><h2>{item.title}</h2><p>{item.sourceBranch || '?'} <span>→</span> {item.targetBranch || '?'}</p></div>
              <div class="mr-author"><small>Author</small><strong>{item.author || 'Unknown'}</strong></div>
              <div class="mr-status"><small>Status</small><span class:closed={item.state !== 'opened'}><i></i>{item.state || 'unknown'}</span></div>
            </div>
            <footer><span>{item.changedFiles} changed file{item.changedFiles === 1 ? '' : 's'}</span><time>{formatUpdated(item.updated)}</time></footer>

            {#if expandedIds[item.id]}
              <section class="mr-details" id={`mr-details-${item.id}`} aria-label={`${item.title} summary`}>
                <dl>
                  <div><dt>Project</dt><dd>{item.project}</dd></div>
                  <div><dt>Branches</dt><dd><code>{item.sourceBranch || '?'}</code> → <code>{item.targetBranch || '?'}</code></dd></div>
                  <div><dt>Changed files</dt><dd>{item.changedFiles}</dd></div>
                  <div><dt>Last updated</dt><dd>{formatUpdated(item.updated)}</dd></div>
                </dl>
                <div class="mr-details-actions">
                  <button class="primary" onclick={() => (selected = item)}>Open details</button>
                  <button onclick={() => void sync(item)} disabled={syncingId === item.id}>{syncingId === item.id ? 'Syncing…' : 'Sync'}</button>
                  {#if item.url}<a href={item.url} target="_blank" rel="noreferrer">Open in GitLab ↗</a>{/if}
                </div>
              </section>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .mr-page { box-sizing:border-box; width:100%; max-width:1500px; min-height:100%; margin:0 auto; padding:clamp(20px,3vw,42px) }
  .mr-page-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:28px; padding-bottom:24px; border-bottom:1px solid var(--arbol-color-border) }
  .mr-kicker { color:var(--arbol-color-accent); font:700 var(--arbol-type-label)/1 var(--arbol-font-mono); letter-spacing:.9px; text-transform:uppercase }
  h1 { margin:7px 0 5px; font:750 calc(30px * var(--arbol-font-scale))/1.05 var(--arbol-font-ui) }.mr-page-heading p { max-width:760px; margin:0; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-body); line-height:1.5 }
  .mr-tools,.mr-details-actions { display:flex; align-items:center; gap:8px }.mr-tools { flex-shrink:0 }.mr-tools input,button,.mr-details-actions a { box-sizing:border-box; height:34px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-m); background:var(--arbol-color-surface-2); color:var(--arbol-color-text); padding:0 11px; font:600 var(--arbol-type-label)/1 var(--arbol-font-ui) }.mr-tools input { width:min(28vw,310px); font-weight:500 }.mr-tools button, .mr-details-actions button { cursor:pointer }.mr-tools button:disabled { cursor:default; opacity:.55 }.primary { border-color:color-mix(in oklch,var(--arbol-color-accent) 55%,var(--arbol-color-border))!important; background:var(--arbol-color-accent-soft)!important; color:var(--arbol-color-accent)!important }.mr-details-actions a { display:inline-flex; align-items:center; text-decoration:none }.mr-state { display:flex; justify-content:center; align-items:center; min-height:130px; margin-top:22px; padding:18px; border:1px dashed var(--arbol-color-border); border-radius:var(--arbol-radius-l); color:var(--arbol-color-text-muted); text-align:center }.mr-state.error { color:var(--arbol-color-err) }.mr-notice{display:flex;align-items:center;gap:12px;margin-top:14px;padding:9px 12px;border:1px solid color-mix(in oklch,var(--arbol-color-ok) 50%,var(--arbol-color-border));border-radius:var(--arbol-radius-m);background:color-mix(in oklch,var(--arbol-color-ok) 8%,var(--arbol-color-surface));font-size:var(--arbol-type-label)}.mr-notice button{margin-left:auto;height:auto;padding:0;border:0;background:transparent;cursor:pointer}
  .mr-list { display:flex; flex-direction:column; gap:8px; margin-top:20px }.mr-item { overflow:hidden; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface); box-shadow:var(--arbol-shadow-1) }.mr-item.expanded { border-color:color-mix(in oklch,var(--arbol-color-accent) 46%,var(--arbol-color-border)); box-shadow:var(--arbol-shadow-2) }.mr-item-main { display:grid; grid-template-columns:minmax(145px,.75fr) minmax(280px,3.5fr) minmax(145px,.9fr) minmax(110px,.65fr); gap:clamp(12px,2vw,28px); align-items:start; padding:15px 17px; cursor:pointer; outline:0 }.mr-item-main:focus-visible { box-shadow:inset 0 0 0 2px var(--arbol-color-accent) }.mr-id strong { color:var(--arbol-color-link); font:750 calc(12px * var(--arbol-font-scale))/1 var(--arbol-font-mono) }.mr-chevron { display:inline-block; margin-right:6px; color:var(--arbol-color-link); font-style:normal; transition:transform .14s ease }.expanded .mr-chevron { transform:rotate(90deg) }.mr-id small { display:block; overflow:hidden; margin-top:6px; color:var(--arbol-color-text-muted); font:550 calc(9px * var(--arbol-font-scale))/1.2 var(--arbol-font-mono); text-overflow:ellipsis; text-transform:uppercase }.mr-copy { min-width:0 }.mr-copy h2 { overflow:hidden; margin:0 0 7px; font:650 calc(13px * var(--arbol-font-scale))/1.3 var(--arbol-font-ui); text-overflow:ellipsis; white-space:nowrap }.mr-copy p { margin:0; overflow:hidden; color:var(--arbol-color-text-muted); font:500 calc(10px * var(--arbol-font-scale))/1.3 var(--arbol-font-mono); text-overflow:ellipsis; white-space:nowrap }.mr-copy p span { color:var(--arbol-color-text) }.mr-author small,.mr-status small { display:block; margin-bottom:5px; color:var(--arbol-color-text-muted); font:550 calc(8.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono); letter-spacing:.4px; text-transform:uppercase }.mr-author strong { display:block; overflow:hidden; font:600 calc(10.5px * var(--arbol-font-scale))/1.25 var(--arbol-font-ui); text-overflow:ellipsis; white-space:nowrap }.mr-status span { display:inline-flex; align-items:center; gap:6px; padding:5px 8px; border-radius:99px; background:var(--arbol-color-surface-2); font:650 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono); text-transform:capitalize }.mr-status span i { width:6px; height:6px; border-radius:99px; background:var(--arbol-color-ok) }.mr-status span.closed i { background:var(--arbol-color-text-muted) }.mr-item footer { display:flex; gap:10px; padding:5px 17px; border-top:1px solid var(--arbol-color-hairline); background:color-mix(in oklch,var(--arbol-color-surface-2) 54%,transparent); color:var(--arbol-color-text-muted); font-size:calc(8.5px * var(--arbol-font-scale)) }.mr-item footer time { margin-left:auto; font-family:var(--arbol-font-mono) }
  .mr-details { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:17px; border-top:1px solid var(--arbol-color-hairline); background:color-mix(in oklch,var(--arbol-color-surface-2) 25%,var(--arbol-color-surface)) }.mr-details dl { display:grid; grid-template-columns:repeat(4,minmax(100px,1fr)); gap:14px; margin:0 }.mr-details dt { margin-bottom:5px; color:var(--arbol-color-text-muted); font:600 calc(8px * var(--arbol-font-scale))/1 var(--arbol-font-mono); letter-spacing:.4px; text-transform:uppercase }.mr-details dd { margin:0; font-size:var(--arbol-type-label); overflow-wrap:anywhere }.mr-details code { font:var(--arbol-type-label) var(--arbol-font-mono) }.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap }
  @media(max-width:1050px){.mr-page-heading{align-items:flex-start;flex-direction:column}.mr-tools{width:100%}.mr-tools label{flex:1}.mr-tools input{width:100%}.mr-item-main{grid-template-columns:130px minmax(240px,1fr) minmax(130px,.7fr)}.mr-status{grid-column:3}.mr-details dl{grid-template-columns:repeat(2,minmax(140px,1fr))}} @media(max-width:700px){.mr-page{padding:18px 14px 30px}.mr-tools{align-items:stretch;flex-wrap:wrap}.mr-tools label{min-width:100%}.mr-item-main{grid-template-columns:1fr}.mr-status{grid-column:auto}.mr-item footer time{display:none}.mr-details{align-items:stretch;flex-direction:column}.mr-details dl{width:100%;grid-template-columns:1fr}.mr-details-actions{width:100%}.mr-details-actions>*{flex:1;justify-content:center}.mr-copy h2{white-space:normal}} @media(prefers-reduced-motion:reduce){.mr-chevron{transition:none}}
</style>
