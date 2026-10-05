<script lang="ts">
  import type { ChangeWalkthroughFile, WalkthroughTotals } from './types'
  let { files, totals, selectedPath, hasMore = false, loadingMore = false, onSelect, onLoadMore }: {
    files: ChangeWalkthroughFile[]; totals: WalkthroughTotals; selectedPath: string | null
    hasMore?: boolean; loadingMore?: boolean
    onSelect: (path: string) => void
    onLoadMore?: () => void
  } = $props()
  function maybeLoadMore(event: Event) {
    const node = event.currentTarget as HTMLElement
    if (hasMore && !loadingMore && node.scrollHeight - node.scrollTop - node.clientHeight < 240) onLoadMore?.()
  }
  const basename = (path: string) => path.split('/').pop() || path
  const dirname = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const badge = (kind: string) => ({ added:'A', modified:'M', deleted:'D', renamed:'R', untracked:'U', 'type-changed':'T', conflicted:'!' }[kind] || 'M')
</script>

<aside class="rail" aria-label="Changed files">
  <header><strong>{totals.files} changed files</strong><span><b>+{totals.additions}</b> <i>−{totals.deletions}</i></span></header>
  <div class="files" onscroll={maybeLoadMore}>
    {#each files as file (file.id)}
      <button class:selected={file.path === selectedPath} onclick={() => onSelect(file.path)} title={file.path}>
        <span class:deleted={file.kind === 'deleted'} class="badge">{badge(file.kind)}</span>
        <span class="name"><strong>{basename(file.path)}</strong><small>{dirname(file.path)}</small></span>
        <span class="delta">{#if file.binary}BIN{:else}<b>+{file.additions ?? 0}</b> <i>−{file.deletions ?? 0}</i>{/if}</span>
      </button>
    {/each}
    {#if hasMore}
      <button class="load-more" disabled={loadingMore} onclick={() => onLoadMore?.()}>
        {loadingMore ? 'Loading more files…' : `Load more (${files.length} of ${totals.files})`}
      </button>
    {/if}
  </div>
</aside>

<style>
  .rail{height:100%;min-width:0;min-height:0;overflow:hidden;border-right:1px solid var(--arbol-color-border);background:var(--arbol-color-surface);display:grid;grid-template-rows:auto minmax(0,1fr)}.rail>header{padding:13px 14px;border-bottom:1px solid var(--arbol-color-border);display:flex;justify-content:space-between;gap:8px;font-size:12px}.rail header span,.delta{font:10px/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)}b{color:var(--arbol-color-ok);font-style:normal}i{color:var(--arbol-color-err);font-style:normal}.files{min-height:0;overflow:auto;overscroll-behavior:contain;padding:6px}.files button{width:100%;border:0;background:transparent;color:var(--arbol-color-text);display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:6px;padding:8px;border-radius:7px;text-align:left;cursor:pointer}.files button:hover{background:var(--arbol-color-surface-2)}.files button.selected{background:var(--arbol-color-accent-soft);outline:1px solid color-mix(in oklch,var(--arbol-color-accent) 40%,transparent)}.badge{font:700 10px/1 var(--arbol-font-mono);color:var(--arbol-color-accent)}.badge.deleted{color:var(--arbol-color-err)}.name{min-width:0;display:grid;gap:3px}.name strong{overflow:hidden;text-overflow:ellipsis;font-size:12px}.name small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font:9px/1 var(--arbol-font-mono)}.files button.load-more{display:block;margin:6px 0;text-align:center;color:var(--arbol-color-text-muted);border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2)}.files button.load-more:disabled{opacity:.6;cursor:wait}
</style>
