<script lang="ts">
  /* A fenced code block. Pretty JSON delegates to JsonCodeBlock; a block that is
   * a single explicit local-file reference becomes an actionable link while
   * keeping code-block styling; everything else is a plain <pre>. */
  import { onMount } from 'svelte'
  import HighlightedText from './HighlightedText.svelte'
  import JsonCodeBlock from './JsonCodeBlock.svelte'
  import CopyBlockButton from './CopyBlockButton.svelte'
  import WrapBlockButton from './WrapBlockButton.svelte'
  import { prettyJson, localPathInCode, resolveLink, BASE_CODE_STYLE, type TextHighlightSpec } from './markdown'
  import {
    CODE_BLOCK_WRAP_CHANGE_EVENT,
    CODE_BLOCK_WRAP_STORAGE_KEY,
    loadCodeBlockWrapPreference,
    saveCodeBlockWrapPreference,
  } from './wrapPreference'

  let { text, style = '', highlight = null, onOpenLocalFile, baseDir, copyable = false }:
    {
      text: string
      style?: string
      highlight?: TextHighlightSpec | null
      onOpenLocalFile?: (path: string) => void
      baseDir?: string
      copyable?: boolean
    } = $props()

  let wrapped = $state(false)
  const pretty = $derived(prettyJson(text))
  const codePath = $derived(pretty ? null : localPathInCode(text))
  const resolved = $derived(codePath ? resolveLink(codePath, baseDir) : '')
  const wrapStyle = $derived(wrapped ? 'white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;overflow-x:hidden' : '')

  onMount(() => {
    wrapped = loadCodeBlockWrapPreference(window.localStorage)

    const applyPreference = (event: Event) => {
      wrapped = Boolean((event as CustomEvent<{ wrapped: boolean }>).detail?.wrapped)
    }
    const applyStoredPreference = (event: StorageEvent) => {
      if (event.key === CODE_BLOCK_WRAP_STORAGE_KEY) wrapped = event.newValue === 'true'
    }

    window.addEventListener(CODE_BLOCK_WRAP_CHANGE_EVENT, applyPreference)
    window.addEventListener('storage', applyStoredPreference)
    return () => {
      window.removeEventListener(CODE_BLOCK_WRAP_CHANGE_EVENT, applyPreference)
      window.removeEventListener('storage', applyStoredPreference)
    }
  })

  function toggleWrapping() {
    wrapped = !wrapped
    saveCodeBlockWrapPreference(window.localStorage, wrapped)
    window.dispatchEvent(new CustomEvent(CODE_BLOCK_WRAP_CHANGE_EVENT, { detail: { wrapped } }))
  }

  function openLocalFile(path: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenLocalFile) onOpenLocalFile(path)
    else window.dispatchEvent(new CustomEvent('arbol-open-link', { detail: { kind: 'file', target: path, text: path } }))
  }
</script>

<div class="code-block" class:copyable class:wrapped>
  {#if copyable}
    <div class="block-actions">
      <WrapBlockButton {wrapped} onToggle={toggleWrapping} />
      <CopyBlockButton {text} label="Copy Markdown block" inline />
    </div>
  {/if}
  {#if pretty}
    <JsonCodeBlock {text} style="{style};{wrapStyle}" {highlight} />
  {:else if codePath}
    <pre style="{BASE_CODE_STYLE};color:var(--arbol-color-text);{style};{wrapStyle}"><a href={resolved} title={resolved} onclick={(e) => openLocalFile(resolved, e)} class="arbol-link" style="color:var(--arbol-color-link)">{#if highlight?.query}<HighlightedText {text} {highlight} />{:else}{text}{/if}</a></pre>
  {:else}
    <pre style="{BASE_CODE_STYLE};color:var(--arbol-color-text);{style};{wrapStyle}">{#if highlight?.query}<HighlightedText {text} {highlight} />{:else}{text}{/if}</pre>
  {/if}
</div>

<style>
  .code-block { position: relative; }
  .code-block :global(pre) { margin: 0.65em 0; }
  .code-block.copyable :global(pre) { padding-right: 80px !important; }
  .code-block.copyable.wrapped :global(pre) { padding-right: 80px !important; }

  .block-actions {
    position: sticky;
    z-index: 2;
    top: 0;
    box-sizing: border-box;
    height: 36px;
    margin-bottom: -36px;
    padding: 8px 8px 0 0;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
  }

  .block-actions :global(button) { pointer-events: auto; }
</style>
