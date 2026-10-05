<script lang="ts">
  import type {
    ChangeWalkthroughDiff,
    CodeVersionLineRow,
    CodeVersionSide,
    SelectedDiffRow,
  } from './types'
  import { projectCodeVersion, projectFullCodeVersion, selectCodeVersionRange } from './state'

  let { side, diff, loading, error, selectedRows, onSelectRows }: {
    side: CodeVersionSide
    diff: ChangeWalkthroughDiff | null
    loading: boolean
    error?: string | null
    selectedRows: SelectedDiffRow[]
    onSelectRows: (rows: SelectedDiffRow[]) => void
  } = $props()

  let anchor = $state<number | null>(null)
  const hunks = $derived(diff?.status === 'ok' ? (diff.code_versions ? projectFullCodeVersion(side === 'before' ? diff.code_versions.before : diff.code_versions.with_changes, diff.hunks, side) : projectCodeVersion(diff.hunks, side)) : [])
  const selectableRows = $derived(hunks.flatMap((hunk) => hunk.rows.filter((row): row is CodeVersionLineRow => row.kind === 'line')))
  const selected = $derived(new Set(selectedRows.map((row) => row.index)))

  $effect(() => { if (!selectedRows.length) anchor = null })

  function choose(row: CodeVersionLineRow, event: MouseEvent | KeyboardEvent) {
    // WebKit treats button contents as controls rather than selectable text.
    // Keep click/keyboard row selection while allowing ordinary drag-to-copy.
    if (event instanceof MouseEvent && window.getSelection()?.isCollapsed === false) return
    const index = selectableRows.findIndex((candidate) => candidate.source_index === row.source_index)
    if (index < 0) return
    const nextAnchor = event.shiftKey && anchor != null ? anchor : index
    anchor = nextAnchor
    onSelectRows(selectCodeVersionRange(selectableRows, nextAnchor, index))
  }
  function chooseWithKeyboard(row: CodeVersionLineRow, event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    choose(row, event)
  }
</script>

<div class="code-version" aria-label={side === 'before' ? 'Code before changes' : 'Code with changes'}>
  {#if loading}<div class="placeholder">Loading code…</div>
  {:else if error}<div class="placeholder error">{error}</div>
  {:else if !diff}<div class="placeholder">Select a changed file.</div>
  {:else if diff.status === 'stale'}<div class="placeholder">The repository changed. Refreshing…</div>
  {:else if diff.warning || diff.truncated}<div class="placeholder">{diff.warning ?? 'Code is too large to display.'}</div>
  {:else if !diff.hunks.length}<div class="placeholder">No textual changes to display with the current whitespace setting.</div>
  {:else}
    {#each hunks as hunk}
      {#if !diff.code_versions}
        <div class="hunk-header">
          <span>{side === 'before' ? `lines ${hunk.old_start}–${Math.max(hunk.old_start, hunk.old_start + hunk.old_count - 1)}` : `lines ${hunk.new_start}–${Math.max(hunk.new_start, hunk.new_start + hunk.new_count - 1)}`}</span>
          <span class="omitted">full code version is unavailable; showing changed sections</span>
        </div>
      {/if}
      {#each hunk.rows as row}
        {#if row.kind === 'cue'}
          <div class="cue {row.tone}" aria-label={row.tone === 'added' ? `${row.count} lines added here` : `${row.count} lines removed here`}>
            <span></span><strong>{row.tone === 'added' ? '+' : '−'}{row.count} {row.count === 1 ? 'line' : 'lines'}</strong><span></span>
          </div>
        {:else}
          <div
            class="line {row.tone}"
            class:selected={selected.has(row.source_index)}
            role="button"
            tabindex="0"
            onclick={(event) => choose(row, event)}
            onkeydown={(event) => chooseWithKeyboard(row, event)}
            aria-label={`${row.tone} line ${row.line_number}`}
          >
            <span class="number">{row.line_number}</span>
            <span class="change-bar"></span>
            <code>{row.line.text || ' '}</code>
          </div>
        {/if}
      {/each}
    {/each}
  {/if}
</div>

<style>
  .code-version{box-sizing:border-box;width:100%;max-width:100%;height:100%;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--arbol-color-bg);font:11px/1.55 var(--arbol-font-mono);color:var(--arbol-color-text)}
  .hunk-header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;padding:6px 12px;background:color-mix(in oklch,var(--arbol-color-accent-soft) 80%,var(--arbol-color-bg));color:var(--arbol-color-accent);border-block:1px solid var(--arbol-color-border)}
  .hunk-header .omitted{color:var(--arbol-color-text-muted);font-size:9px;font-style:italic}
  .line{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:58px 4px minmax(max-content,1fr);cursor:default;min-height:20px;-webkit-user-select:text;user-select:text}
  .line:hover{filter:brightness(1.08)}
  .line.selected{outline:1px solid var(--arbol-color-accent);outline-offset:-1px;background:color-mix(in oklch,var(--arbol-color-accent-soft) 75%,transparent)!important}
  .line.removed{background:color-mix(in oklch,var(--arbol-color-err) 14%,transparent)}
  .line.added{background:color-mix(in oklch,var(--arbol-color-ok) 14%,transparent)}
  .line.edited{background:color-mix(in oklch,var(--arbol-color-link) 14%,transparent)}
  .line.removed .change-bar{background:var(--arbol-color-err)}
  .line.added .change-bar{background:var(--arbol-color-ok)}
  .line.edited .change-bar{background:var(--arbol-color-link)}
  .number{padding:2px 9px;text-align:right;user-select:none;color:var(--arbol-color-text-muted);border-right:1px solid var(--arbol-color-border)}
  code{padding:2px 12px;white-space:pre}
  .cue{display:grid;grid-template-columns:minmax(18px,1fr) auto minmax(18px,5fr);align-items:center;gap:8px;min-height:20px;padding-left:62px;user-select:none}
  .cue span{height:2px;border-radius:2px}
  .cue strong{font:650 9px/1 var(--arbol-font-ui);white-space:nowrap}
  .cue.added{color:var(--arbol-color-ok);background:color-mix(in oklch,var(--arbol-color-ok) 5%,transparent)}
  .cue.added span{background:var(--arbol-color-ok)}
  .cue.removed{color:var(--arbol-color-err);background:color-mix(in oklch,var(--arbol-color-err) 5%,transparent)}
  .cue.removed span{background:var(--arbol-color-err)}
  .placeholder{height:100%;display:grid;place-items:center;padding:30px;color:var(--arbol-color-text-muted);text-align:center}.placeholder.error{color:var(--arbol-color-err)}
</style>
