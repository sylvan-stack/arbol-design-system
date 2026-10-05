<script lang="ts">
  /* Shared markdown document viewer/editor (Elma View Page + Seqoya Artifacts).
   * View renders the parsed markdown with clickable links: a same-document
   * `#anchor` scrolls to the heading; any other link target is handed to
   * `onNavigate` (the consumer opens it). Edit is a textarea with Save / Cancel. */
  import MarkdownBlocks from './MarkdownBlocks.svelte'
  import BlueprintDoc from './BlueprintDoc.svelte'
  import ChainDoc from './ChainDoc.svelte'
  import Frontmatter from './Frontmatter.svelte'
  import { isBlueprint } from './blueprint'
  import { isChain } from './chain'
  import { parseFrontmatter } from './frontmatter'
  import { countSourceRefs, parseDocMarkdown } from './sourcerefs'
  import { splitLocator } from './markdown'

  let {
    content = '',
    editable = false,
    title = '',
    baseDir,
    docPath,
    scrollTo,
    onSave,
    onNavigate,
  }: {
    content?: string
    editable?: boolean
    title?: string
    baseDir?: string
    docPath?: string
    /* When set, scroll to this heading id once the content is rendered (used to
     * land on an #anchor after a cross-document navigation). */
    scrollTo?: string
    onSave?: (content: string) => Promise<void> | void
    /* A link target that isn't a same-document anchor (a path, optionally with a
     * #anchor / :line locator). The consumer resolves + opens it. */
    onNavigate?: (target: string) => void
  } = $props()

  let editing = $state(false)
  let draft = $state('')
  let saving = $state(false)
  let error = $state<string | null>(null)
  let viewEl: HTMLDivElement | undefined = $state()

  // A blueprint gets its typed-contract rendering; anything else stays plain
  // markdown — but its YAML frontmatter (if any) is lifted into a metadata strip
  // and stripped from the rendered body. `<!-- sources: … -->` provenance
  // comments are invisible by default (their design intent); the Sources toggle
  // reveals them as chips. Editing (the textarea below) is unaffected — it
  // edits raw source, comments included.
  // A blueprint gets its typed-contract view; a chain runbook gets its Cells
  // view; anything else stays plain markdown with a frontmatter strip.
  const blueprint = $derived(isBlueprint(content))
  const chain = $derived(!blueprint && isChain(content))
  const fm = $derived(blueprint || chain ? null : parseFrontmatter(content))
  let showSources = $state(false)
  const sourceCount = $derived(countSourceRefs(content))
  const blocks = $derived(parseDocMarkdown(fm ? fm.body : content, { showSources }))

  function scrollToId(id: string) {
    requestAnimationFrame(() => viewEl?.querySelector('#' + CSS.escape(id))?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  function handleLink(target: string) {
    const { filePart, suffix } = splitLocator(target)
    const anchor = suffix.startsWith('#') ? suffix.slice(1) : ''
    if (anchor && (!filePart || filePart === docPath)) {
      scrollToId(anchor)  // same-document term jump
    } else if (filePart) {
      onNavigate?.(target) // a different document (with optional anchor)
    }
  }

  // Land on an anchor after opening a new document (cross-doc navigation).
  $effect(() => {
    void content
    if (scrollTo && !editing) scrollToId(scrollTo)
  })

  function startEdit() { draft = content; error = null; editing = true }
  function cancel() { editing = false; error = null }
  async function save() {
    if (!onSave) { editing = false; return }
    saving = true; error = null
    try {
      await onSave(draft)
      editing = false
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  const btn = 'cursor:pointer;border-radius:var(--arbol-radius-s);padding:5px 12px;' +
    'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);border:1px solid var(--arbol-color-border)'
</script>

<div style="display:flex;flex-direction:column;height:100%;min-height:0">
  <div style="display:flex;align-items:center;gap:8px;padding:0 0 8px;flex:0 0 auto">
    {#if title}<span style="font:600 var(--arbol-type-body)/1.2 var(--arbol-font-mono);color:var(--arbol-color-text-muted)">{title}</span>{/if}
    <div style="margin-left:auto;display:flex;gap:8px">
      {#if sourceCount > 0 && !editing}
        <button
          onclick={() => (showSources = !showSources)}
          aria-pressed={showSources}
          title={showSources ? 'Hide Source Refs' : 'Show Source Refs'}
          style="{btn};background:{showSources ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};color:{showSources ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'}"
        >Sources · {sourceCount}</button>
      {/if}
      {#if editable && !editing}
        <button onclick={startEdit} style="{btn};background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">Edit</button>
      {:else if editing}
        <button onclick={cancel} disabled={saving} style="{btn};background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">Cancel</button>
        <button onclick={save} disabled={saving} style="{btn};background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink);border-color:transparent">{saving ? 'Saving…' : 'Save'}</button>
      {/if}
    </div>
  </div>

  {#if error}
    <div style="margin-bottom:8px;padding:8px 10px;border-radius:var(--arbol-radius-s);background:#e3535a22;color:#e35;font-size:var(--arbol-type-label)">Failed: {error}</div>
  {/if}

  {#if editing}
    <textarea bind:value={draft}
      style="flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;
             font:13px/1.55 var(--arbol-font-mono);padding:12px;border-radius:var(--arbol-radius-s);
             border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);
             color:var(--arbol-color-text);outline:none"></textarea>
  {:else}
    <div bind:this={viewEl} style="flex:1 1 auto;min-height:0;overflow:auto;font:var(--arbol-type-body)/1.6 var(--arbol-font-ui)">
      {#if blueprint}
        <BlueprintDoc {content} {baseDir} {docPath} {showSources} onOpenLocalFile={handleLink} />
      {:else if chain}
        <ChainDoc {content} {baseDir} {docPath} {showSources} onOpenLocalFile={handleLink} />
      {:else}
        {#if fm}<Frontmatter data={fm.data} />{/if}
        <MarkdownBlocks {blocks} {baseDir} {docPath} onOpenLocalFile={handleLink} />
      {/if}
    </div>
  {/if}
</div>
