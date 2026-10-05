<script lang="ts">
  /* A GitHub-flavored markdown pipe table. Cells render inline markdown.
   * (Ported from MarkdownView's internal MarkdownTable.) */
  import InlineMarkdown from './InlineMarkdown.svelte'
  import type { TextHighlightSpec } from './markdown'

  let { header, rows, compact = false, highlight = null, onOpenLocalFile, baseDir, docPath }:
    {
      header: string[]
      rows: string[][]
      compact?: boolean
      highlight?: TextHighlightSpec | null
      onOpenLocalFile?: (path: string) => void
      baseDir?: string
      docPath?: string
    } = $props()

  const cellPadding = $derived(compact ? '0.38em 0.55em' : '0.55em 0.75em')
  const border = '1px solid var(--arbol-color-border)'
  const wrapMargin = $derived(compact ? '0.4em 0 0.55em' : '0.75em 0 1em')
</script>

<div style="margin:{wrapMargin};overflow-x:auto;border:{border};border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface-2)">
  <table style="width:100%;min-width:max-content;border-collapse:collapse;border-spacing:0;font-size:0.95em;line-height:1.45">
    <thead>
      <tr>
        {#each header as cell, j (j)}
          <th
            scope="col"
            style="padding:{cellPadding};text-align:left;vertical-align:top;border-right:{j === header.length - 1 ? 'none' : border};border-bottom:{border};background:var(--arbol-color-surface);color:var(--arbol-color-text);font-weight:700;white-space:normal"
          >
            <InlineMarkdown text={cell} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (i)}
        <tr>
          {#each header as _, j (j)}
            <td
              style="padding:{cellPadding};text-align:left;vertical-align:top;border-right:{j === header.length - 1 ? 'none' : border};border-top:{i === 0 ? 'none' : border};color:var(--arbol-color-text)"
            >
              <InlineMarkdown text={row[j] || ''} {highlight} {onOpenLocalFile} {baseDir} {docPath} />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
