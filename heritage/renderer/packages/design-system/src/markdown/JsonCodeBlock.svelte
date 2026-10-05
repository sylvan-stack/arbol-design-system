<script lang="ts">
  /* A <pre> that pretty-prints + syntax-colors JSON. When a search query is
   * active the raw text is shown with highlight marks instead (so matches in the
   * original payload still register). (Ported from MarkdownView's JsonCodeBlock.) */
  import HighlightedText from './HighlightedText.svelte'
  import { prettyJson, tokenizeJson, BASE_CODE_STYLE, type TextHighlightSpec } from './markdown'

  let { text, style = '', highlight = null }:
    { text: string; style?: string; highlight?: TextHighlightSpec | null } = $props()

  const pretty = $derived(prettyJson(text))
  const display = $derived(pretty || text)
  const tokens = $derived(pretty ? tokenizeJson(pretty) : [])

  const KEY_STYLE = 'color:var(--arbol-color-accent);font-weight:600'
  const STRING_STYLE = 'color:var(--arbol-color-text)'
  const PRIMITIVE_STYLE = 'color:color-mix(in oklch, var(--arbol-color-accent) 70%, var(--arbol-color-text))'
  function tokenStyle(kind: string): string {
    return kind === 'key' ? KEY_STYLE : kind === 'string' ? STRING_STYLE : PRIMITIVE_STYLE
  }
</script>

<pre style="{BASE_CODE_STYLE};{style}">{#if highlight?.query}<HighlightedText text={display} {highlight} />{:else if pretty}{#each tokens as tok, i (i)}{#if tok.kind === 'plain'}{tok.text}{:else}<span style={tokenStyle(tok.kind)}>{tok.text}</span>{/if}{/each}{:else}{text}{/if}</pre>
