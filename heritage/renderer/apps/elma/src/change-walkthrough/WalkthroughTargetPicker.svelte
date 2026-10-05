<script lang="ts">
  import type { WalkthroughRepo, WalkthroughTarget } from './types'

  let { repos, loading, error, selectedRepoRoot, onSelectRepo, onSelectTarget, onRefresh }: {
    repos: WalkthroughRepo[]
    loading: boolean
    error?: string | null
    selectedRepoRoot?: string | null
    onSelectRepo: (repoRoot: string) => void
    onSelectTarget: (repo: WalkthroughRepo, target: WalkthroughTarget) => void
    onRefresh: () => void
  } = $props()

  const shortPath = (path: string) => path.replace(/^\/Users\/[^/]+/, '~')
</script>

<section class="picker" aria-label="Choose a repository">
  <header>
    <div>
      <p class="eyebrow">REPOSITORY CHANGES</p>
      <h1>Choose a repository</h1>
      <p>Review changes in a repository’s current checkout.</p>
    </div>
    <button class="secondary" onclick={onRefresh} disabled={loading}>↻ Refresh</button>
  </header>

  {#if error}<div class="error" role="alert">{error}</div>{/if}
  {#if loading && !repos.length}<div class="state">Discovering repositories…</div>{/if}
  {#if !loading && !repos.length}<div class="state">No Git repositories were found.</div>{/if}

  <div class="repo-list">
    {#each repos as repo (repo.repo_root)}
      <article class:matched={repo.launch_chat_match}>
        <button class="repo" onclick={() => onSelectRepo(repo.repo_root)} aria-expanded={selectedRepoRoot === repo.repo_root}>
          <span class="chevron">{selectedRepoRoot === repo.repo_root ? '▾' : '▸'}</span>
          <span class="repo-name">{repo.name}</span>
          {#if repo.launch_chat_match}<span class="match">Chat Repo</span>{/if}
          <span class="count">{repo.targets[0]?.branch || 'detached HEAD'}</span>
        </button>
        {#if selectedRepoRoot === repo.repo_root}
          <div class="worktrees">
            {#if !repo.targets.length}<p class="empty">No repository checkout available.</p>{/if}
            {#each repo.targets as target (target.target_id)}
              <div class="target-row" class:clean={target.stats_status === 'clean'}>
                <button class="target" disabled={!target.exists} onclick={() => onSelectTarget(repo, target)}>
                  <span class="branch">{target.detached ? `Detached · ${target.branch ?? 'HEAD'}` : target.branch ?? 'Unknown branch'}</span>
                  <span class="path">{shortPath(target.worktree_root)}</span>
                  <span class="stats">
                    {#if target.stats_status === 'changed' && target.totals}
                      <strong>{target.totals.files} files</strong>
                      <span class="add">+{target.totals.additions}</span>
                      <span class="del">−{target.totals.deletions}</span>
                    {:else if target.stats_status === 'clean'}
                      Clean
                    {:else if target.stats_status === 'unavailable'}
                      Unavailable
                    {:else}
                      Calculating…
                    {/if}
                  </span>
                </button>

              </div>
              {#if target.stats_error}<p class="target-error">{target.stats_error}</p>{/if}
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .picker{height:100%;overflow:auto;padding:clamp(24px,5vw,64px);background:radial-gradient(80% 60% at 50% 0%,var(--arbol-color-accent-soft),transparent 60%)}
  header{max-width:960px;margin:0 auto 28px;display:flex;gap:24px;justify-content:space-between;align-items:flex-start}
  h1{margin:4px 0 8px;font:650 clamp(24px,3vw,36px)/1.15 var(--arbol-font-ui);color:var(--arbol-color-text)}
  header p{margin:0;color:var(--arbol-color-text-muted);max-width:650px}.eyebrow{font:700 10px/1 var(--arbol-font-ui);letter-spacing:.12em;color:var(--arbol-color-accent)!important}
  button{font:inherit;color:inherit}.secondary{border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface);padding:8px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
  .repo-list{max-width:960px;margin:auto;display:grid;gap:10px}article{border:1px solid var(--arbol-color-border);border-radius:12px;overflow:hidden;background:color-mix(in oklch,var(--arbol-color-surface) 92%,transparent)}article.matched{border-color:var(--arbol-color-accent)}
  .repo{width:100%;display:flex;align-items:center;gap:10px;padding:14px 16px;border:0;background:transparent;cursor:pointer;text-align:left}.repo:hover,.target-row:hover{background:var(--arbol-color-surface-2)}
  .repo-name{font-weight:700}.chevron{color:var(--arbol-color-text-muted)}.count{margin-left:auto;color:var(--arbol-color-text-muted);font-size:12px}.match{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--arbol-color-accent);background:var(--arbol-color-accent-soft);padding:3px 6px;border-radius:99px}
  .worktrees{border-top:1px solid var(--arbol-color-border);padding:8px}.target-row{display:flex;align-items:center;border-radius:8px}.target-row.clean{opacity:.48}.target{min-width:0;flex:1;display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,2fr) auto;align-items:center;gap:14px;border:0;background:transparent;padding:11px;text-align:left;cursor:pointer}.target:disabled{cursor:not-allowed}
  .branch{font-weight:650;overflow:hidden;text-overflow:ellipsis}.path{font:11px/1.3 var(--arbol-font-mono);color:var(--arbol-color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stats{display:flex;gap:8px;color:var(--arbol-color-text-muted);font-size:12px}.add{color:var(--arbol-color-ok)}.del{color:var(--arbol-color-err)}
  .target-error,.empty{padding:0 12px 8px;margin:0;color:var(--arbol-color-text-muted);font-size:11px}.state,.error{max-width:960px;margin:16px auto;padding:18px;border:1px dashed var(--arbol-color-border);border-radius:10px;color:var(--arbol-color-text-muted)}.error{border-style:solid;border-color:var(--arbol-color-err);color:var(--arbol-color-err)}
  @media(max-width:720px){.target{grid-template-columns:1fr auto}.path{grid-column:1/-1;grid-row:2}.picker{padding:20px}header{align-items:center}}
</style>
