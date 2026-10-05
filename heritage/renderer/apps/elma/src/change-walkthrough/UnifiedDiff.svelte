<script lang="ts">
  import type { ChangeWalkthroughDiff, ChangeWalkthroughLine, SelectedDiffRow } from './types'
  import { contiguousRange } from './state'
  let { diff, loading, error, selectedRows, onSelectRows }: {
    diff: ChangeWalkthroughDiff | null; loading: boolean; error?: string | null
    selectedRows: SelectedDiffRow[]; onSelectRows: (rows: SelectedDiffRow[]) => void
  } = $props()

  let anchor = $state<number | null>(null)
  const lines = $derived(diff?.status === 'ok' ? diff.hunks.flatMap((hunk) => hunk.lines) : [])
  const selected = $derived(new Set(selectedRows.map((row) => row.index)))
  $effect(() => { if (!selectedRows.length) anchor = null })
  function choose(index: number, event: MouseEvent | KeyboardEvent) {
    // A drag over source text is a native text-selection gesture, not a request
    // to replace the rows selected for “Ask agent”. Generic elements (unlike
    // buttons in WebKit) also allow that selection to begin in the first place.
    if (event instanceof MouseEvent && window.getSelection()?.isCollapsed === false) return
    const nextAnchor = event.shiftKey && anchor != null ? anchor : index
    anchor = nextAnchor
    onSelectRows(contiguousRange(lines, nextAnchor, index))
  }
  function chooseWithKeyboard(index: number, event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    choose(index, event)
  }
  const sign = (line: ChangeWalkthroughLine) => line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '−' : line.kind === 'no-newline' ? '\\' : ' '
</script>

<div class="diff" aria-label="Unified diff">
  {#if loading}<div class="placeholder">Loading diff…</div>
  {:else if error}<div class="placeholder error">{error}</div>
  {:else if !diff}<div class="placeholder">Select a changed file.</div>
  {:else if diff.status === 'stale'}<div class="placeholder">The repository changed. Refreshing…</div>
  {:else if diff.warning || diff.truncated}<div class="placeholder">{diff.warning ?? 'Diff is too large to display.'}</div>
  {:else if !diff.hunks.length}<div class="placeholder">No textual differences to display with the current whitespace setting.</div>
  {:else}
    {@const flatStarts = new Map(diff.hunks.map((hunk, i) => [hunk, diff.hunks.slice(0, i).reduce((n, x) => n + x.lines.length, 0)]))}
    {#each diff.hunks as hunk}
      <div class="hunk-header">@@ −{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@</div>
      {#each hunk.lines as line, local}
        {@const index = (flatStarts.get(hunk) ?? 0) + local}
        <div
          class="line {line.kind}"
          class:selected={selected.has(index)}
          role="button"
          tabindex="0"
          onclick={(event) => choose(index, event)}
          onkeydown={(event) => chooseWithKeyboard(index, event)}
          aria-label={`${line.kind} line ${line.old_line ?? ''} ${line.new_line ?? ''}`}
        >
          <span class="old">{line.old_line ?? ''}</span><span class="new">{line.new_line ?? ''}</span><span class="sign">{sign(line)}</span><code>{line.text || ' '}</code>
        </div>
      {/each}
    {/each}
  {/if}
</div>

<style>
  .diff{box-sizing:border-box;width:100%;max-width:100%;height:100%;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--arbol-color-bg);font:11px/1.55 var(--arbol-font-mono);color:var(--arbol-color-text)}.hunk-header{position:sticky;top:0;z-index:2;padding:6px 12px;background:color-mix(in oklch,var(--arbol-color-accent-soft) 80%,var(--arbol-color-bg));color:var(--arbol-color-accent);border-block:1px solid var(--arbol-color-border)}
  .line{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:48px 48px 22px minmax(max-content,1fr);cursor:default;min-height:20px;-webkit-user-select:text;user-select:text}.line:hover{filter:brightness(1.08)}.line.selected{outline:1px solid var(--arbol-color-accent);outline-offset:-1px;background:color-mix(in oklch,var(--arbol-color-accent-soft) 75%,transparent)!important}.line.addition{background:color-mix(in oklch,var(--arbol-color-ok) 12%,transparent)}.line.deletion{background:color-mix(in oklch,var(--arbol-color-err) 12%,transparent)}.line.no-newline{color:var(--arbol-color-text-muted);font-style:italic}.old,.new{padding:2px 8px;text-align:right;user-select:none;color:var(--arbol-color-text-muted);border-right:1px solid var(--arbol-color-border)}.sign{padding:2px 6px;user-select:none}code{padding:2px 12px 2px 0;white-space:pre}.placeholder{height:100%;display:grid;place-items:center;padding:30px;color:var(--arbol-color-text-muted);text-align:center}.placeholder.error{color:var(--arbol-color-err)}
</style>
