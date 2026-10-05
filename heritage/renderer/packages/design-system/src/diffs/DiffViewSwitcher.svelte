<script lang="ts">
  /** The shared control for choosing the Git boundary of a diff. Hosts own data loading. */
  import type { DiffView } from './types'
  let { view, parentBranch = null, parentAvailable = false, masterBranch = null, masterAvailable = true, masterIsCurrent = false, busy = false, compact = false, onChange }: {
    view: DiffView; parentBranch?: string | null; parentAvailable?: boolean; masterBranch?: string | null; masterAvailable?: boolean; masterIsCurrent?: boolean; busy?: boolean; compact?: boolean; onChange: (view: DiffView) => void
  } = $props()
  // Hosts should resolve the primary branch before enabling this option. The
  // fallback is deliberately a single label: the switcher must never present
  // the synthetic and ambiguous `master/main` name.
  const masterLabel = $derived(masterBranch ?? 'master')

  $effect(() => {
    // A disabled option cannot remain selected. This is especially important
    // when opening the primary Worktree while another Worktree had `master`
    // selected: its meaningful default is the working-copy-only view.
    if (busy) return
    if ((view === 'parent' && !parentAvailable) ||
        (view === 'master' && (!masterAvailable || masterIsCurrent))) {
      onChange('uncommitted')
    }
  })
</script>
<span class:compact class="diff-view-switcher" role="group" aria-label="Diff view">
  <button type="button" class:active={view === 'uncommitted'} aria-pressed={view === 'uncommitted'} disabled={busy} title="Uncommitted and unstaged changes only" onclick={() => view !== 'uncommitted' && onChange('uncommitted')}>uncommited</button>
  <button type="button" class:active={view === 'commit'} aria-pressed={view === 'commit'} disabled={busy} title="Current commit compared with its previous commit; working-copy changes are excluded" onclick={() => view !== 'commit' && onChange('commit')}>commit</button>
  <button type="button" class:active={view === 'parent'} aria-pressed={view === 'parent'} disabled={busy || !parentAvailable} title={parentAvailable ? `All branch changes against ${parentBranch}` : 'Parent branch is unknown or unavailable'} onclick={() => view !== 'parent' && onChange('parent')}>parent</button>
  <button type="button" class:active={view === 'master'} aria-pressed={view === 'master'} disabled={busy || !masterAvailable || masterIsCurrent} title={masterIsCurrent ? `Already on ${masterLabel}` : `All changes against ${masterLabel}`} onclick={() => view !== 'master' && onChange('master')}>{masterLabel}</button>
</span>
<style>
.diff-view-switcher{position:relative;z-index:2;display:inline-flex;align-items:center;padding:2px;border:1px solid var(--arbol-color-border);border-radius:6px;background:var(--arbol-color-surface)}button{border:0;border-radius:4px;padding:3px 6px;background:transparent;color:var(--arbol-color-text-muted);font:600 9px/1 var(--arbol-font-mono);cursor:pointer;white-space:nowrap}button:hover:not(:disabled),button:focus-visible{color:var(--arbol-color-text);outline:none}button.active{background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink)}button:disabled{opacity:.38;cursor:default}.compact button{padding:3px 5px}
</style>
