<script lang="ts" module>
  export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
  export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
  export const DEFAULT_STATIONS_PAGE_SIZE: PageSize = 25
</script>

<script lang="ts">
  /* Station-grid pagination (classes from willo.css: .willo-pagination). */
  import { Button } from '@arbol/design-system'

  let { page, pageCount, total, pageSize, onPage, onPageSizeChange }: {
    page: number
    pageCount: number
    total: number
    pageSize: PageSize
    onPage: (page: number) => void
    onPageSizeChange: (pageSize: PageSize) => void
  } = $props()

  const first = $derived(total === 0 ? 0 : page * pageSize + 1)
  const last = $derived(Math.min(total, (page + 1) * pageSize))
</script>

<div class="willo-pagination" aria-label="Stations pagination">
  <div class="willo-pagination-nav is-back">
    <Button size="s" kind="ghost" disabled={page <= 0} onclick={() => onPage(0)}>First</Button>
    <Button size="s" kind="ghost" disabled={page <= 0} onclick={() => onPage(page - 1)}>Prev</Button>
  </div>
  <span class="willo-pagination-range">{first}-{last} of {total}</span>
  <div class="willo-pagination-nav is-forward">
    <Button size="s" kind="ghost" disabled={page >= pageCount - 1} onclick={() => onPage(page + 1)}>Next</Button>
    <Button size="s" kind="ghost" disabled={page >= pageCount - 1} onclick={() => onPage(pageCount - 1)}>Last</Button>
  </div>
  <label class="willo-page-size">
    <span>Per page</span>
    <select value={pageSize} onchange={(e) => onPageSizeChange(Number(e.currentTarget.value) as PageSize)}>
      {#each PAGE_SIZE_OPTIONS as size (size)}<option value={size}>{size}</option>{/each}
    </select>
  </label>
</div>
