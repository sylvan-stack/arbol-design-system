<script lang="ts">
  import { untrack } from 'svelte'
  import { callNative, DiffViewSwitcher } from '@arbol/design-system'
  import { api, hasBridge } from '../api'
  import ChangeFileRail from './ChangeFileRail.svelte'
  import CodeVersionView from './CodeVersionView.svelte'
  import UnifiedDiff from './UnifiedDiff.svelte'
  import WalkthroughTargetPicker from './WalkthroughTargetPicker.svelte'
  import { buildAskAgentBlock, nextContext, reconcileSelectedPath } from './state'
  import type { ChangeWalkthroughDiff, ChangeWalkthroughSummary, SelectedDiffRow, WalkthroughRepo, WalkthroughTarget, WalkthroughView } from './types'

  let { active = true, launchChatSessionId, launchWorktreePath, launchDiffMode, refreshToken = 0, launchToken = 0, onAskAgent }: {
    active?: boolean
    launchChatSessionId?: string | null
    launchWorktreePath?: string | null
    launchDiffMode?: import('@arbol/design-system').DiffView | null
    refreshToken?: number
    launchToken?: number
    onAskAgent?: (chatSessionId: string, block: string) => void
  } = $props()

  let repos = $state<WalkthroughRepo[]>([])
  let targetsLoading = $state(false)
  let targetsError = $state<string | null>(null)
  let hiddenTargetIds = $state<string[]>([])
  let selectedRepoRoot = $state<string | null>(null)
  let selectedRepoName = $state('')
  let selectedTarget = $state<WalkthroughTarget | null>(null)
  let summary = $state<ChangeWalkthroughSummary | null>(null)
  let summaryLoading = $state(false)
  let moreFilesLoading = $state(false)
  let summaryError = $state<string | null>(null)
  let selectedPath = $state<string | null>(null)
  let diff = $state<ChangeWalkthroughDiff | null>(null)
  let diffLoading = $state(false)
  let diffMode = $state<import('@arbol/design-system').DiffView>('uncommitted')
  let diffError = $state<string | null>(null)
  let context = $state(3)
  let ignoreWhitespace = $state(false)
  let selectedRows = $state<SelectedDiffRow[]>([])
  let view = $state<WalkthroughView>('diff')
  let staleRetry = 0
  let targetLoadGeneration = 0


  const selectedFile = $derived(summary?.files.find((file) => file.path === selectedPath) ?? null)
  const canAsk = $derived(Boolean(launchChatSessionId && selectedRows.length && selectedFile && summary && repos.find((repo) => repo.repo_root === selectedRepoRoot)?.launch_chat_match))

  async function loadTargets(forceRefresh = false) {
    const generation = ++targetLoadGeneration
    const chatSessionId = launchChatSessionId ?? undefined
    targetsLoading = true; targetsError = null
    try {
      // Publish the cheap catalog first so the picker is immediately usable.
      // Statistics then arrive in one bounded Core pass. Sending one summary
      // RPC per Worktree caused every request to rediscover every Repo and could
      // temporarily turn valid targets into target_not_found under load.
      const discovered = (await api.changeWalkthrough.targets(chatSessionId, false, forceRefresh)).repos
      if (generation !== targetLoadGeneration) return
      repos = discovered.map((repo) => ({
        ...repo, targets: repo.targets.filter((target) => !hiddenTargetIds.includes(target.target_id)),
      }))
      const matched = repos.filter((repo) => repo.launch_chat_match)
      if (!selectedRepoRoot && matched.length === 1) selectedRepoRoot = matched[0].repo_root
      if (selectedRepoRoot && !repos.some((repo) => repo.repo_root === selectedRepoRoot)) selectedRepoRoot = null

      void api.changeWalkthrough.targets(chatSessionId, true).then((enriched) => {
        if (generation !== targetLoadGeneration) return
        repos = enriched.repos.map((repo) => ({
          ...repo, targets: repo.targets.filter((target) => !hiddenTargetIds.includes(target.target_id)),
        }))
        if (selectedRepoRoot && !repos.some((repo) => repo.repo_root === selectedRepoRoot)) selectedRepoRoot = null
      }).catch((error) => {
        if (generation !== targetLoadGeneration) return
        // Discovery succeeded, so keep every Worktree selectable. Statistics
        // are supplemental and can be retried without mislabelling targets.
        console.warn('[Change Walkthrough] Worktree statistics unavailable', error)
      })
    } catch (error) {
      if (generation === targetLoadGeneration) targetsError = error instanceof Error ? error.message : String(error)
    } finally {
      if (generation === targetLoadGeneration) targetsLoading = false
    }
  }


  async function chooseTarget(repo: WalkthroughRepo, target: WalkthroughTarget) {
    selectedRepoRoot = repo.repo_root; selectedRepoName = repo.name; selectedTarget = target
    // main/master cannot compare against itself and has no parent branch view.
    // Never carry either disabled selection into its Hunk Review.
    if (/^(?:main|master)$/.test(target.branch ?? '') && (diffMode === 'master' || diffMode === 'parent')) {
      diffMode = 'uncommitted'
    }
    await loadSummary(false)
  }


  async function loadSummary(isRefresh = true) {
    if (!selectedTarget) return
    summaryLoading = true; summaryError = null
    const before = summary?.files ?? []
    try {
      const next = await api.changeWalkthrough.summary(selectedTarget.target_id, diffMode, isRefresh, 0)
      summary = next
      selectedPath = reconcileSelectedPath(selectedPath, before, next.files)
      selectedRows = []
      if (selectedPath) await loadDiff(false)
      else diff = null
    } catch (error) {
      summaryError = error instanceof Error ? error.message : String(error)
    } finally { summaryLoading = false }
  }

  async function loadMoreFiles() {
    if (!selectedTarget || !summary?.has_more_files || moreFilesLoading) return
    moreFilesLoading = true; summaryError = null
    const current = summary
    try {
      const page = await api.changeWalkthrough.summary(
        selectedTarget.target_id, diffMode, false, current.files.length, current.file_limit,
      )
      // A cache validation may discover an edit between pages. Never combine
      // inventories from different Worktree versions.
      if (page.worktree_version !== current.worktree_version) {
        await loadSummary(true)
        return
      }
      const known = new Set(current.files.map((file) => file.id))
      summary = {
        ...current,
        files: [...current.files, ...page.files.filter((file) => !known.has(file.id))],
        has_more_files: page.has_more_files,
      }
    } catch (error) {
      summaryError = error instanceof Error ? error.message : String(error)
    } finally { moreFilesLoading = false }
  }

  async function changeDiffMode(mode: import('@arbol/design-system').DiffView) {
    if (!selectedTarget || mode === diffMode) return
    diffMode = mode
    diff = null
    await loadSummary(false)
  }


  async function loadDiff(allowRetry = true) {
    if (!summary || !selectedPath || !selectedTarget) return
    diffLoading = true; diffError = null
    const requestedVersion = summary.worktree_version
    try {
      const fileId = summary.files.find((file) => file.path === selectedPath)?.id ?? ''
      const next = await api.changeWalkthrough.diff(selectedTarget.target_id, selectedPath, fileId, requestedVersion, context, ignoreWhitespace, diffMode)
      if (next.status === 'stale' && allowRetry) {
        staleRetry += 1
        await loadSummary(true)
        return
      }
      diff = next
      selectedRows = []
    } catch (error) {
      diffError = error instanceof Error ? error.message : String(error)
    } finally { diffLoading = false }
  }

  async function selectFile(path: string) {
    selectedPath = path; selectedRows = []; staleRetry = 0
    await loadDiff(true)
  }

  async function moveFile(direction: -1 | 1) {
    if (!summary?.files.length) return
    let index = Math.max(0, summary.files.findIndex((file) => file.path === selectedPath))
    if (direction === 1 && index === summary.files.length - 1 && summary.has_more_files) {
      await loadMoreFiles()
      if (!summary) return
      index = Math.max(0, summary.files.findIndex((file) => file.path === selectedPath))
    }
    const next = summary.files[Math.max(0, Math.min(summary.files.length - 1, index + direction))]
    if (next && next.path !== selectedPath) await selectFile(next.path)
  }

  function expandContext() { context = nextContext(context); void loadDiff(true) }
  function toggleWhitespace() { ignoreWhitespace = !ignoreWhitespace; void loadDiff(true) }
  async function askAgent() {
    if (!canAsk || !launchChatSessionId || !summary || !selectedFile || !selectedRepoRoot) return
    try {
      const currentRepos = (await api.changeWalkthrough.targets(launchChatSessionId, false)).repos
      if (!currentRepos.some((repo) => repo.repo_root === selectedRepoRoot && repo.launch_chat_match)) {
        diffError = 'The launch Chat Session no longer represents this Repo.'
        return
      }
      onAskAgent?.(launchChatSessionId, buildAskAgentBlock({ repo: selectedRepoName, summary, file: selectedFile, rows: selectedRows }))
    } catch (error) {
      diffError = error instanceof Error ? error.message : String(error)
    }
  }
  async function openSelected() {
    if (!summary || !selectedFile || !hasBridge()) return
    const path = `${summary.worktree_root}/${selectedFile.path}`
    await callNative('link.open', { kind: 'file', target: path, source_ui: 'elma' })
  }
  function backToPicker() { selectedTarget = null; summary = null; diff = null; selectedPath = null; selectedRows = [] }

  $effect(() => {
    // Only launch inputs drive discovery. `loadTargets` maintains its own
    // generation counter, which must not accidentally become an effect
    // dependency and turn discovery into a request loop.
    void launchChatSessionId
    const isActive = active
    const requestedLaunch = launchToken
    // The page remains mounted to retain selection, but hidden pages must not
    // discover Repos or compute Worktree statistics while Chat is opening.
    if (isActive && requestedLaunch <= 0) untrack(() => void loadTargets())
  })
  $effect(() => {
    const requestedLaunch = launchToken
    const isActive = active
    if (!isActive || requestedLaunch <= 0) return
    const requestedPath = launchWorktreePath
    untrack(() => {
      // Every explicit launch starts from fresh discovery. Quick Actions omit a
      // Worktree and intentionally return to the picker; the status bar supplies
      // the current Worktree and opens it directly.
      selectedTarget = null; summary = null; diff = null; selectedPath = null; selectedRows = []
      if (!requestedPath) return
      void (async () => {
        await loadTargets()
        const repo = repos.find((item) => item.targets.some((target) => target.worktree_root === requestedPath))
        const target = repo?.targets.find((item) => item.worktree_root === requestedPath)
        if (!repo || !target) {
          targetsError = 'The selected repository is not available in Change Walkthrough.'
          return
        }
        if (launchDiffMode) diffMode = launchDiffMode
        await chooseTarget(repo, target)
      })()
    })
  })
  $effect(() => {
    // This effect is driven only by the explicit refresh token. Calling the
    // async loader directly inside an effect also tracks every state value it
    // reads before its first await (notably `summary`). The loader then replaces
    // that value, retriggering itself forever and making the selected file flash
    // through its loading state even when the Worktree is unchanged.
    const requestedRefresh = refreshToken
    const isActive = active
    if (!isActive || requestedRefresh <= 0) return
    untrack(() => {
      if (selectedTarget) void loadSummary(true)
    })
  })
  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!active) return
      const tag = (event.target as HTMLElement)?.tagName || ''
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target as HTMLElement)?.isContentEditable) return
      if (event.key === 'j' || (event.metaKey && event.key === 'ArrowDown')) { event.preventDefault(); moveFile(1) }
      else if (event.key === 'k' || (event.metaKey && event.key === 'ArrowUp')) { event.preventDefault(); moveFile(-1) }
      else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'r') { event.preventDefault(); void loadSummary(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

{#if !selectedTarget}
  <WalkthroughTargetPicker {repos} loading={targetsLoading} error={targetsError} {selectedRepoRoot} onSelectRepo={(root) => selectedRepoRoot = selectedRepoRoot === root ? null : root} onSelectTarget={chooseTarget} onRefresh={() => loadTargets(true)} />
{:else}
  <section class="walkthrough">
    <div class="toolbar">
      <button onclick={backToPicker}>‹ Repositories</button>
      <div class="boundary">
        <strong>{summary?.branch ?? 'Detached HEAD'}</strong>
        {#if summary}<span>→ {summary.base_ref} @ {summary.merge_base_oid.slice(0, 9)}</span><span>· {summary.commit_count} commits</span>{/if}
      </div>
      {#if summary}
        <DiffViewSwitcher view={diffMode} parentBranch={summary.parent_branch} parentAvailable={summary.parent_available} masterBranch={summary.master_ref?.replace(/^refs\/(?:heads|remotes\/origin)\//, '') ?? null} masterAvailable={Boolean(summary.master_ref)} masterIsCurrent={summary.branch === summary.master_ref?.replace(/^refs\/(?:heads|remotes\/origin)\//, '')} onChange={(mode) => void changeDiffMode(mode)} />
      {/if}
      <button class:active={ignoreWhitespace} onclick={toggleWhitespace}>Ignore whitespace</button>
      <button onclick={expandContext} disabled={context >= 200}>Context {context}</button>
      <button onclick={() => void loadSummary(true)} disabled={summaryLoading}>↻ Refresh</button>
    </div>
    {#if summary?.commits.length}
      <div class="commit-provenance" aria-label="Commit information">
        {#each summary.commits as commit, index (commit.sha)}
          <article title={commit.sha}>
            <span class="commit-role">{diffMode === 'commit' ? (index === 0 ? 'Current commit' : 'Previous commit') : 'Latest commit'}</span>
            <div class="commit-summary"><code>{commit.sha.slice(0, 9)}</code><strong>{commit.message}</strong></div>
            <div class="commit-meta"><span>{commit.author.name}</span><time datetime={commit.datetime}>{new Date(commit.datetime).toLocaleString()}</time></div>
          </article>
        {/each}
      </div>
    {/if}
    {#if summaryError}<div class="page-error" role="alert">{summaryError}</div>
    {:else if summaryLoading && !summary}<div class="page-state">Reading repository changes…</div>
    {:else if summary && summary.files.length === 0}
      <div class="clean"><span>✓</span><h2>Repository is clean</h2><p>No changes exist against the displayed comparison boundary.</p></div>
    {:else if summary}
      <div class="workspace">
        <ChangeFileRail files={summary.files} totals={summary.totals} {selectedPath} hasMore={summary.has_more_files} loadingMore={moreFilesLoading} onSelect={selectFile} onLoadMore={loadMoreFiles} />
        <main>
          <header class="file-header">
            <div class="file-title"><strong>{selectedFile?.path ?? 'Choose a file'}</strong>{#if selectedFile?.old_path}<small>renamed from {selectedFile.old_path}</small>{/if}</div>
            <div class="view-switch" role="tablist" aria-label="Change presentation">
              <button role="tab" aria-selected={view === 'before'} class:active={view === 'before'} onclick={() => { view = 'before'; selectedRows = [] }}>Before Changes</button>
              <button role="tab" aria-selected={view === 'diff'} class:active={view === 'diff'} onclick={() => { view = 'diff'; selectedRows = [] }}>Diff</button>
              <button role="tab" aria-selected={view === 'with'} class:active={view === 'with'} onclick={() => { view = 'with'; selectedRows = [] }}>With Changes</button>
            </div>
            <span class="file-actions">
              <button onclick={() => moveFile(-1)} title="Previous changed file (k)">↑</button>
              <button onclick={() => moveFile(1)} title="Next changed file (j)">↓</button>
              {#if selectedFile?.kind !== 'deleted'}<button onclick={openSelected}>Open file</button>{/if}
            </span>
          </header>
          <div class="patch">
            {#if view === 'diff'}
              <UnifiedDiff {diff} loading={diffLoading} error={diffError} {selectedRows} onSelectRows={(rows) => selectedRows = rows} />
            {:else}
              <CodeVersionView side={view} {diff} loading={diffLoading} error={diffError} {selectedRows} onSelectRows={(rows) => selectedRows = rows} />
            {/if}
          </div>
          <footer class:visible={selectedRows.length > 0}>
            <span>{selectedRows.length} lines selected</span>
            {#if launchChatSessionId && !canAsk && selectedRows.length}<span class="reason">The launch Chat Session does not represent this Repo.</span>{/if}
            <button onclick={askAgent} disabled={!canAsk}>Ask agent about {selectedRows.length} lines</button>
          </footer>
        </main>
      </div>
    {/if}
  </section>
{/if}

<style>
  .walkthrough{box-sizing:border-box;width:100%;max-width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;background:var(--arbol-color-bg)}button{font:inherit;color:inherit}.toolbar{box-sizing:border-box;width:100%;max-width:100%;min-width:0;flex:none;display:flex;align-items:center;gap:7px;padding:8px 10px;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface)}.toolbar button,.file-header button,footer button{border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);border-radius:7px;padding:6px 9px;cursor:pointer;font-size:11px}.toolbar button.active{border-color:var(--arbol-color-accent);color:var(--arbol-color-accent)}.boundary{min-width:120px;display:flex;gap:7px;align-items:center;flex:1 1 auto;font:10px/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted);overflow:hidden}.boundary strong{color:var(--arbol-color-text);overflow:hidden;text-overflow:ellipsis}.workspace{box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:0;overflow:hidden;display:grid;flex:1 1 0;grid-template-columns:clamp(220px,28%,360px) minmax(0,1fr)}main{width:100%;max-width:100%;min-width:0;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.file-header{box-sizing:border-box;width:100%;min-width:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface)}.file-title{min-width:100px;flex:1 1 180px;display:grid;gap:3px}.file-actions{flex:none;display:flex;gap:5px}.view-switch{flex:none;display:flex;gap:2px;padding:2px;border:1px solid var(--arbol-color-border);border-radius:7px;background:var(--arbol-color-surface-2)}.view-switch button{border:0;background:transparent;padding:5px 8px;color:var(--arbol-color-text-muted);white-space:nowrap}.view-switch button.active{background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink)}.file-header strong{overflow:hidden;text-overflow:ellipsis;font:600 12px/1.2 var(--arbol-font-mono)}.file-header small{color:var(--arbol-color-text-muted);font:9px/1 var(--arbol-font-mono)}.patch{box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:0;overflow:hidden}footer{display:none;align-items:center;gap:12px;padding:8px 12px;border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-surface);font-size:11px}footer.visible{display:flex}footer button{margin-left:auto;border-color:var(--arbol-color-accent);background:var(--arbol-color-accent);color:white;font-weight:650}button:disabled{opacity:.45;cursor:not-allowed}.reason{color:var(--arbol-color-text-muted)}.clean,.page-state,.page-error{min-width:0;min-height:0;flex:1 1 auto;display:grid;place-items:center;align-content:center;text-align:center;color:var(--arbol-color-text-muted);padding:30px}.clean span{font-size:44px;color:var(--arbol-color-ok)}.clean h2{margin:8px 0 0;color:var(--arbol-color-text)}.clean p{margin:6px}.page-error{color:var(--arbol-color-err)}
  @media(max-width:760px){.workspace{grid-template-columns:clamp(170px,36%,260px) minmax(0,1fr)}.boundary span:last-child{display:none}}
  .commit-provenance{box-sizing:border-box;width:100%;max-width:100%;min-width:0;flex:none;display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);overflow-x:auto}.commit-provenance article{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:3px 9px;min-width:min(430px,45vw);padding:6px 9px;border:1px solid var(--arbol-color-border);border-radius:7px;background:var(--arbol-color-surface)}.commit-role{grid-row:1 / span 2;align-self:stretch;display:flex;align-items:center;padding-right:9px;border-right:1px solid var(--arbol-color-border);font:600 9px/1.2 var(--arbol-font-ui);color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.commit-summary,.commit-meta{min-width:0;display:flex;align-items:baseline;gap:7px}.commit-summary code{flex:none;color:var(--arbol-color-accent);font:10px/1.25 var(--arbol-font-mono)}.commit-summary strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 11px/1.25 var(--arbol-font-ui)}.commit-meta{color:var(--arbol-color-text-muted);font:9px/1.25 var(--arbol-font-ui)}.commit-meta time::before{content:'·';margin-right:7px}
</style>
