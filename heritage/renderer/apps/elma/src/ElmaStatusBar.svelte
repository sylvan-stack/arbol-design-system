<script lang="ts">
  /* Elma status bar: concise chat context and Worktree change statistics.
   * Session activity belongs in the shell header; build provenance is supplied
   * by UIShell as the third status-bar section. */
  import { RingsMark } from '@arbol/design-system'
  import WorktreeDiffMode from './WorktreeDiffMode.svelte'
  import type { WorktreeDiffMode as DiffMode } from './change-walkthrough/types'
  import RepoGlyph from './RepoGlyph.svelte'
  import type { WorktreeInfo } from './api'

  let {
    changeWalkthroughEnabled = false,
    activeRepo, worktreeBranch, worktrees, worktreeBusy,
    onOpenWalkthrough, ipLabel, modelLabel, thinking, fastMode = false, fastModeAvailable = false, onToggleFastMode = () => {},
    affectedFiles = 0, affectedLines = 0, worktreeStatsError = null, worktreeStatsLoading = false, onRetryWorktreeStats = () => {},
    diffMode = 'uncommitted', parentBranch = null, parentAvailable = false,
    masterBranch = null, masterAvailable = false, masterIsCurrent = false,
    onDiffModeChange = () => {},
    embedPending = 0, embedRunning = false, onEmbed = () => {},
  }: {
    changeWalkthroughEnabled?: boolean
    activeRepo: string
    worktreeBranch: string
    worktrees: WorktreeInfo[]
    worktreeBusy: boolean
    onOpenWalkthrough: () => void
    ipLabel: string
    modelLabel: string
    thinking: string
    fastMode?: boolean
    fastModeAvailable?: boolean
    onToggleFastMode?: () => void
    affectedFiles?: number
    affectedLines?: number
    worktreeStatsError?: string | null
    worktreeStatsLoading?: boolean
    onRetryWorktreeStats?: () => void
    diffMode?: DiffMode
    parentBranch?: string | null
    parentAvailable?: boolean
    masterBranch?: string | null
    masterAvailable?: boolean
    masterIsCurrent?: boolean
    onDiffModeChange?: (mode: DiffMode) => void
    embedPending?: number
    embedRunning?: boolean
    onEmbed?: () => void
  } = $props()

</script>

<div class="status-sections">
  <section class="status-section chat-settings" aria-label="Chat settings">
    <span class="repo"><RepoGlyph name={activeRepo || '·'} size={14} />{activeRepo || 'No repo'}</span>
    <span class="dash">–</span>
    <span class="ip" title={`Intelligence Provider: ${ipLabel || 'unavailable'}`} data-ip-label={ipLabel?.trim() || 'No IP'}>
      <RingsMark size={12} color="var(--arbol-color-accent)" />
      <span class="ip-prefix">IP:</span><span class="ip-name">{ipLabel?.trim() || 'No IP'}</span>
    </span>
    <span class="dash">–</span>
    {#if fastModeAvailable}
      <button class="mode mono" type="button" aria-pressed={fastMode} title={fastMode ? 'Disable Fast mode' : 'Enable Fast mode (about 50% faster; consumes more usage)'} onclick={onToggleFastMode}>
        {modelLabel}::{thinking}{fastMode ? '::fast' : ''}
      </button>
    {:else}
      <span class="mono">{modelLabel}::{thinking}</span>
    {/if}
  </section>

  {#if changeWalkthroughEnabled}
  <section class="status-section worktree-info">
    <button
      class="walkthrough-hit"
      type="button"
      aria-label="Open Change Walkthrough for this repository"
      title="Open Change Walkthrough for this repository"
      onclick={onOpenWalkthrough}
    ></button>
    <span class="picker mono">{worktreeBranch || 'Repository'}</span>
    <span class="diff-mode"><WorktreeDiffMode mode={diffMode} {parentBranch} {parentAvailable} {masterBranch} {masterAvailable} {masterIsCurrent} onChange={onDiffModeChange} compact /></span>
    {#if worktreeStatsLoading}
      <span class="metric"><strong>Loading changes…</strong></span>
    {:else if worktreeStatsError}
      <span class="stats-error" role="alert" title={worktreeStatsError}>Unable to load changes</span>
      <button class="retry-stats" type="button" onclick={onRetryWorktreeStats}>Retry</button>
    {:else if affectedFiles === 0}
      <span class="metric"><strong>No changes</strong></span>
    {:else}
      <span class="metric"><strong>Files:</strong> {affectedFiles}</span>
      <span class="metric"><strong>Lines:</strong> {affectedLines}</span>
    {/if}
    <!-- Overlay embedding is on-demand: pending chunks accumulate silently and
         only this click spends embedding compute on them. Sits above the
         walkthrough hit like .picker so the click stays its own action. -->
    {#if embedRunning && embedPending > 0}
      <button class="embed-btn" type="button" disabled>Embedding {embedPending.toLocaleString()}…</button>
    {:else if embedPending > 0}
      <button
        class="embed-btn"
        type="button"
        title="Embed this Worktree's pending overlay chunks so search sees the branch delta"
        onclick={onEmbed}
      >Embed {embedPending.toLocaleString()} chunks</button>
    {/if}
  </section>
  {/if}
</div>

<style>
  /* Keep both sections as direct flex items of the shared shell bar. The
     Worktree section uses equal auto margins to center itself in the space left
     after the fixed, left-aligned Chat settings section. */
  .status-sections { display: contents; }
  .status-section {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    height: 24px;
    padding: 0 10px;
    flex: 0 1 auto;
    border: 1px solid var(--arbol-color-border);
    border-radius: 7px;
    white-space: nowrap;
  }
  .chat-settings {
    /* Repo/IP/model are the routing contract and must never be squeezed out by
       Worktree metrics or build provenance. The Worktree section yields first. */
    flex-shrink: 0;
    background: color-mix(in srgb, var(--arbol-color-surface-2) 74%, transparent);
    color: var(--arbol-color-text-muted);
  }
  .worktree-info {
    position: relative;
    flex: 0 1 auto;
    width: fit-content;
    margin-inline: auto;
    overflow: hidden;
    background: color-mix(in srgb, var(--arbol-color-accent-soft) 58%, var(--arbol-color-surface));
    border-color: color-mix(in srgb, var(--arbol-color-accent) 24%, var(--arbol-color-border));
    cursor: pointer;
    transition: border-color .12s ease, background .12s ease;
  }
  .worktree-info:has(.walkthrough-hit:hover), .worktree-info:has(.walkthrough-hit:focus-visible) {
    border-color: color-mix(in srgb, var(--arbol-color-accent) 62%, var(--arbol-color-border));
    background: color-mix(in srgb, var(--arbol-color-accent-soft) 85%, var(--arbol-color-surface));
  }
  .walkthrough-hit {
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .walkthrough-hit:focus-visible { outline: 2px solid var(--arbol-color-accent); outline-offset: 1px; }
  .picker, .diff-mode { position: relative; z-index: 1; display: inline-flex; cursor: default; }
  .metric { position: relative; z-index: 1; pointer-events: none; }
  .stats-error, .retry-stats { position: relative; z-index: 1; }
  .stats-error { color: var(--arbol-color-err); font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui); }
  .retry-stats { padding: 2px 6px; border: 1px solid var(--arbol-color-border); border-radius: 4px; background: var(--arbol-color-surface); color: var(--arbol-color-text); font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui); cursor: pointer; }
  .retry-stats:hover, .retry-stats:focus-visible { border-color: var(--arbol-color-accent); outline: none; }
  .embed-btn {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--arbol-color-accent) 45%, var(--arbol-color-border));
    border-radius: 5px;
    background: var(--arbol-color-surface);
    color: var(--arbol-color-text);
    font: 600 var(--arbol-type-label)/1.2 var(--arbol-font-mono);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .embed-btn:hover:not(:disabled), .embed-btn:focus-visible {
    background: var(--arbol-color-accent-soft);
    outline: none;
  }
  .embed-btn:disabled { opacity: .6; cursor: default; }
  .repo, .ip { display: inline-flex; align-items: center; gap: 5px; }
  .repo { color: var(--arbol-color-text); font-family: var(--arbol-font-mono); }
  .ip-prefix, .ip-name {
    display: inline-block;
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
    font-weight: 700;
    opacity: 1;
  }
  .ip-name { min-width: 4ch; }
  .mono { font-family: var(--arbol-font-mono); }
  .mode { padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
  .mode:hover, .mode:focus-visible { color: var(--arbol-color-text); outline: none; text-decoration: underline; text-underline-offset: 2px; }
  .dash { opacity: .38; }
  .metric { font-family: var(--arbol-font-mono); font-variant-numeric: tabular-nums; }
  .metric strong { color: var(--arbol-color-text); font-weight: 650; }

  @media (max-width: 980px) {
    .worktree-info { overflow: hidden; }
  }
</style>
