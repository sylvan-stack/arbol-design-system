<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { call, HunkReview } from '@arbol/design-system'
  import type { HunkReviewComment, HunkReviewSnapshot } from '@arbol/design-system'
  import type { MergeRequest } from './mergeRequests'

  type Discussion = { id?: string; notes?: unknown[] }
  type Commit = { id?: string; short_id?: string; title?: string; author_name?: string }
  type Diff = { diff?: string; new_path?: string; old_path?: string; new_file?: boolean; deleted_file?: boolean; renamed_file?: boolean }
  type Mirror = { fetched_at?: string; diffs?: Diff[]; discussions?: Discussion[]; commits?: Commit[] }

  const WIDTH_PREFERENCE = 'oaken.merge-request-review.width'
  const MIN_WIDTH = 1000
  const MAX_WIDTH = 1900
  const WIDTH_STEP = 120

  let { item, onBack }: { item: MergeRequest; onBack: () => void } = $props()
  let data = $state<Mirror | null>(null)
  let focusedComment = $state<HunkReviewComment | null>(null)
  let contentWidth = $state(1320)
  let loading = $state(true)
  let error = $state<string | null>(null)

  const hunk = $derived.by((): HunkReviewSnapshot => ({
    title: item.title,
    files: (data?.diffs ?? []).map((file, index) => ({
      path: file.new_path || file.old_path || `File ${index + 1}`,
      ...(file.old_path && file.old_path !== file.new_path ? { old_path: file.old_path } : {}),
      patch: file.diff ?? '', new_file: file.new_file, deleted_file: file.deleted_file, renamed_file: file.renamed_file,
    })),
    discussions: data?.discussions ?? [],
  }))
  const humanComments = $derived((data?.discussions ?? []).flatMap((thread) =>
    (thread.notes ?? []).filter((note): note is HunkReviewComment => !!note && typeof note === 'object' && !(note as HunkReviewComment).system),
  ))
  const generalComments = $derived(humanComments.filter((note) => !note.position || (note.position.new_line == null && note.position.old_line == null)))
  const codeComments = $derived(humanComments.filter((note) => note.position && (note.position.new_line != null || note.position.old_line != null)))

  function clampWidth(value: number) { return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value))) }
  async function changeWidth(amount: number) {
    contentWidth = clampWidth(contentWidth + amount)
    try { await call('ui.preference.set', { key: WIDTH_PREFERENCE, value: String(contentWidth) }) }
    catch { /* Width remains usable for this view if persistence is temporarily unavailable. */ }
  }

  onMount(async () => {
    try {
      const preference = await call('ui.preference.get', { key: WIDTH_PREFERENCE }) as { value?: string | null }
      const saved = Number(preference.value)
      if (Number.isFinite(saved)) contentWidth = clampWidth(saved)
    } catch { /* A migration/daemon restart must not prevent review loading. */ }
  })

  function publishHeaderControls(active = true) {
    window.dispatchEvent(new CustomEvent('arbol-merge-request-review-controls', { detail: {
      active, onInc: () => changeWidth(WIDTH_STEP), onDec: () => changeWidth(-WIDTH_STEP),
      canInc: contentWidth < MAX_WIDTH, canDec: contentWidth > MIN_WIDTH,
    } }))
  }
  $effect(() => { publishHeaderControls(); return () => publishHeaderControls(false) })
  onDestroy(() => publishHeaderControls(false))

  onMount(async () => {
    try {
      const rawPath = item.sourcePath.replace(/^merge-requests\//, '').replace(/\.md$/, '.json')
      const response = await call('artifacts.read', { repo: 'mirrors/gitlab', path: rawPath }) as { exists?: boolean; content?: string }
      if (!response.exists || !response.content) throw new Error('The captured GitLab review artifact is unavailable. Sync the merge request again.')
      data = JSON.parse(response.content) as Mirror
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading = false
    }
  })
</script>

<section class="mr-detail-page" style={`max-width:${contentWidth}px`}>
  <header class="mr-detail-header">
    <button onclick={onBack}>‹ Merge requests</button>
    <div class="mr-detail-heading">
      <div class="mr-kicker">Tasks · GitLab</div>
      <h1>{item.title}</h1>
      <p>{item.id} · {item.sourceBranch} → {item.targetBranch}</p>
    </div>
    <div class="mr-detail-actions">
      {#if item.url}<a href={item.url} target="_blank" rel="noreferrer">Open in GitLab ↗</a>{/if}
    </div>
  </header>

  {#if loading}
    <div class="mr-detail-state">Loading merge request details…</div>
  {:else if error}
    <div class="mr-detail-state error">{error}</div>
  {:else}
    <section class="mr-overview" aria-label="Merge request overview">
      <div class="overview-summary"><span class="overview-label">Change summary</span><div class="mr-stats"><span><strong>{item.changedFiles}</strong> files</span><span><strong>{data?.discussions?.length ?? 0}</strong> threads</span><span><strong>{data?.commits?.length ?? 0}</strong> commits</span></div></div>
      <dl class="overview-details"><div><dt>Author</dt><dd>{item.author || 'Unknown'}</dd></div><div><dt>Status</dt><dd>{item.state || 'unknown'}</dd></div><div><dt>Updated</dt><dd>{item.updated ? new Date(item.updated).toLocaleString() : 'Unknown'}</dd></div><div><dt>Fetched</dt><dd>{data?.fetched_at ? new Date(data.fetched_at).toLocaleString() : 'Unknown'}</dd></div></dl>
    </section>

    {#if data?.commits?.length}
      <details class="mr-commits"><summary>Commits ({data.commits.length})</summary><ul>{#each data.commits as commit}<li><code>{commit.short_id || commit.id?.slice(0, 8)}</code> {commit.title || 'Untitled commit'}{commit.author_name ? ` · ${commit.author_name}` : ''}</li>{/each}</ul></details>
    {/if}
    {#if humanComments.length}
      <details class="mr-comments">
        <summary>Comments ({humanComments.length})</summary>
        {#if generalComments.length}<section><h3>General comments</h3>{#each generalComments as note (note.id ?? note.created_at ?? note.body)}<article><strong>{note.author?.name || 'Unknown author'}</strong><p>{note.body || ''}</p></article>{/each}</section>{/if}
        {#if codeComments.length}<section><h3>Comments on code</h3>{#each codeComments as note (note.id ?? note.created_at ?? note.body)}<button class="comment-link" onclick={() => focusedComment = note}><strong>{note.author?.name || 'Unknown author'}</strong><span>{note.position?.new_path || note.position?.old_path}:{note.position?.new_line ?? note.position?.old_line}</span><p>{note.body || ''}</p></button>{/each}</section>{/if}
      </details>
    {/if}
    <section class="mr-diff-review"><header><h2>Diff review</h2><span>{item.changedFiles} changed file{item.changedFiles === 1 ? '' : 's'}</span></header><HunkReview {hunk} showComments={false} focusComment={focusedComment} emptyMessage="No captured diff is available for this merge request." /></section>
  {/if}
</section>

<style>
  .mr-detail-page{box-sizing:border-box;width:100%;max-width:1320px;min-height:100%;margin:0 auto;padding:clamp(20px,3vw,42px)}
  .mr-detail-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:18px;padding-bottom:23px;border-bottom:1px solid var(--arbol-color-border)}
  button,.mr-detail-actions a{height:34px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);padding:0 11px;cursor:pointer;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);text-decoration:none}
  .mr-detail-actions{display:flex;align-items:center;gap:8px}.mr-detail-actions a{display:inline-flex;align-items:center}
  .mr-kicker{color:var(--arbol-color-accent);font:700 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:.9px;text-transform:uppercase}.mr-detail-heading h1{margin:7px 0 5px;font:750 calc(27px * var(--arbol-font-scale))/1.1 var(--arbol-font-ui)}.mr-detail-heading p{margin:0;color:var(--arbol-color-text-muted);font:var(--arbol-type-label)/1.4 var(--arbol-font-mono)}
  .mr-detail-state{display:flex;justify-content:center;align-items:center;min-height:180px;margin-top:22px;border:1px dashed var(--arbol-color-border);border-radius:var(--arbol-radius-l);color:var(--arbol-color-text-muted)}.error{color:var(--arbol-color-err)}
  .mr-overview{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:20px;padding:13px 16px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface);box-shadow:var(--arbol-shadow-1)}.overview-summary{display:flex;align-items:center;gap:22px;min-width:0}.overview-label{font:700 calc(15px * var(--arbol-font-scale))/1.2 var(--arbol-font-ui);white-space:nowrap}.mr-stats{display:flex;align-items:baseline;gap:16px}.mr-stats span{color:var(--arbol-color-text-muted);font:600 10px var(--arbol-font-mono);text-transform:uppercase;white-space:nowrap}.mr-stats strong{margin-right:4px;color:var(--arbol-color-text);font:750 17px var(--arbol-font-mono)}.overview-details{display:flex;align-items:baseline;justify-content:flex-end;gap:15px;margin:0;min-width:0}.overview-details>div{min-width:0}.overview-details dt{margin-bottom:3px;color:var(--arbol-color-text-muted);font:600 8px/1.2 var(--arbol-font-mono);letter-spacing:.4px;text-transform:uppercase}.overview-details dd{margin:0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:var(--arbol-type-label)/1.2 var(--arbol-font-ui)}
  .mr-commits,.mr-comments{margin-top:14px;padding:10px 16px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface);font:var(--arbol-type-label)/1.4 var(--arbol-font-ui)}.mr-commits summary,.mr-comments summary{cursor:pointer;font-weight:650}.mr-commits ul{margin:10px 0 0;padding-left:20px}.mr-commits li{margin:5px 0}.mr-commits code{font-family:var(--arbol-font-mono)}
  .mr-comments{min-width:0;overflow:hidden}.mr-comments section{min-width:0;margin-top:12px}.mr-comments h3{margin:0 0 7px;color:var(--arbol-color-text-muted);font:650 10px var(--arbol-font-ui);text-transform:uppercase}.mr-comments article,.mr-comments .comment-link{display:block;box-sizing:border-box;min-width:0;width:100%;height:auto;margin:5px 0;padding:7px 9px;border:1px solid var(--arbol-color-border);border-radius:5px;background:var(--arbol-color-surface-2);color:inherit;text-align:left;font:11px/1.35 var(--arbol-font-sans)}.mr-comments .comment-link{cursor:pointer}.mr-comments .comment-link span{margin-left:8px;color:var(--arbol-color-link);font-family:var(--arbol-font-mono);overflow-wrap:anywhere}.mr-comments p{overflow-wrap:anywhere;margin:4px 0 0;color:var(--arbol-color-text-muted)}
  .mr-diff-review{height:min(820px,calc(100vh - 120px));min-height:0;margin-top:20px;display:grid;grid-template-rows:auto minmax(0,1fr);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);overflow:hidden}.mr-diff-review>header{display:flex;align-items:center;justify-content:space-between;padding:14px 17px;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface)}.mr-diff-review :global(.hunk-review){min-height:0}.mr-diff-review h2{margin:0;font:700 calc(16px * var(--arbol-font-scale))/1.2 var(--arbol-font-ui)}.mr-diff-review header span{color:var(--arbol-color-text-muted);font:var(--arbol-type-label)/1 var(--arbol-font-mono)}
  @media(max-width:1000px){.mr-overview{align-items:flex-start;flex-direction:column}.overview-details{justify-content:flex-start;flex-wrap:wrap}}@media(max-width:850px){.mr-detail-header{grid-template-columns:1fr}}@media(max-width:540px){.mr-detail-page{padding:18px 14px 30px}.overview-summary{align-items:flex-start;flex-direction:column;gap:10px}.mr-stats{gap:11px}.overview-details{gap:11px}}
</style>
