<script lang="ts" module>
  /* Second column for contextual previews (currently: local files linked from chat). */
  import { type LocalFilePreview } from '../api'

  function fileName(path: string): string {
    return path.split('/').filter(Boolean).pop() || path
  }

  // GitHub-style heading slug, so a `#elma-view-page` anchor matches "## Elma View
  // Page". Slugifying both sides also lets a title (`#Elma View Page`) match. Match
  // GitHub exactly: drop punctuation, then replace EACH whitespace char with a
  // hyphen WITHOUT collapsing runs — so "Fold / Projection" (the dropped `/` leaves
  // two spaces) becomes "fold--projection", matching the `#fold--projection` anchor.
  function slugify(s: string): string {
    return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s/g, '-')
  }

  // Headings (in render order, with 1-based source line) from raw markdown, fenced
  // code skipped to stay aligned with parseMarkdown's heading detection.
  function scanHeadings(content: string): { index: number; line: number; slug: string }[] {
    const out: { index: number; line: number; slug: string }[] = []
    const lines = content.split('\n')
    let inFence = false
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue }
      if (inFence) continue
      const m = lines[i].match(/^\s{0,3}#{1,6}\s+(.*)$/)
      if (m) out.push({ index: idx++, line: i + 1, slug: slugify(m[1].trim()) })
    }
    return out
  }

  function isMarkdownFile(file: LocalFilePreview): boolean {
    const name = (file.name || file.path || '').toLowerCase()
    return /\.(md|markdown|mdown|mkd|mdx)$/.test(name) || file.mime === 'text/markdown'
  }

  function dirOf(path: string): string {
    const i = path.lastIndexOf('/')
    return i <= 0 ? '' : path.slice(0, i)
  }

  function navButtonStyle(enabled: boolean): string {
    return [
      'all:unset',
      'box-sizing:border-box',
      'width:26px',
      'height:26px',
      'display:grid',
      'place-items:center',
      `cursor:${enabled ? 'pointer' : 'default'}`,
      `opacity:${enabled ? 1 : 0.4}`,
      'border-radius:var(--arbol-radius-s)',
      'color:var(--arbol-color-text-muted)',
      'border:1px solid var(--arbol-color-border)',
      'background:var(--arbol-color-surface-2)',
      'font:700 var(--arbol-type-title)/1 var(--arbol-font-ui)',
    ].join(';')
  }

  function formatBytes(n: number | undefined): string {
    if (!Number.isFinite(n || NaN)) return ''
    const v = n || 0
    if (v < 1024) return `${v} B`
    if (v < 1024 * 1024) return `${Math.round((v / 1024) * 10) / 10} KB`
    return `${Math.round((v / (1024 * 1024)) * 10) / 10} MB`
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', 'true')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { detachLocalFile, writeLocalFile, type LocalFilePreview } from '../api'
  import { MarkdownBlocks, BlueprintDoc, Frontmatter, isBlueprint, parseFrontmatter, parseDocMarkdown, countSourceRefs } from '@arbol/design-system'

  let {
    file,
    loading,
    onClose,
    onOpenLocalFile,
    onEditingChange,
    previewNav,
    fullscreen,
    onToggleFullscreen,
    repoName,
    repoPath,
    theme,
  }: {
    file?: LocalFilePreview | null
    loading?: boolean
    onClose?: () => void
    onOpenLocalFile?: (path: string) => void
    onEditingChange?: (editing: boolean) => void
    previewNav?: { canBack: boolean; canForward: boolean; onBack: () => void; onForward: () => void }
    fullscreen?: boolean
    onToggleFullscreen?: () => void
    repoName?: string
    repoPath?: string
    theme?: string
  } = $props()

  let scrollEl: HTMLDivElement | null = $state(null)
  let editing = $state(false)
  let draft = $state('')
  let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle')
  let saveError = $state('')
  let copiedPath = $state(false)
  let detaching = $state(false)
  let detachError = $state('')
  let copiedTimer: number | null = null

  const content = $derived(file?.content)
  const line = $derived(file?.line)
  const anchor = $derived(file?.anchor)
  const markdown = $derived(file ? isMarkdownFile(file) : false)
  // A blueprint (frontmatter `role: blueprint`) gets its typed-contract view;
  // it is a markdown file, so this is a refinement of the markdown branch.
  const blueprint = $derived(markdown && !!file?.content && isBlueprint(file.content))
  // Any other markdown doc: lift YAML frontmatter into a metadata strip and
  // render the remaining body as markdown.
  const frontmatter = $derived(markdown && !blueprint && file?.content ? parseFrontmatter(file.content) : null)
  // `<!-- sources: … -->` refs are invisible by default (their design intent);
  // the Sources toggle reveals them as chips, off on every newly opened file.
  let showSources = $state(false)
  const sourceCount = $derived(markdown && file?.content ? countSourceRefs(file.content) : 0)
  const canEdit = $derived(!!file?.ok && !file.isDirectory && !loading && !file.truncated)
  const title = $derived(file?.name || (file?.path ? fileName(file.path) : 'Loading file…'))

  function setEditingState(next: boolean) {
    // Always begin with the latest preview content. The parent keeps the file
    // live while it is in preview mode, but pauses those refreshes while editing.
    if (next && !editing) {
      draft = file?.content || ''
      saveState = 'idle'
      saveError = ''
    }
    editing = next
    onEditingChange?.(next)
  }

  async function detach() {
    if (!file?.ok || file.isDirectory || detaching) return
    detaching = true
    detachError = ''
    try {
      const result = await detachLocalFile(file.path, { repoName, repoPath, theme })
      if (!result.ok) throw new Error(result.error || 'Could not detach artifact')
    } catch (e) {
      detachError = e instanceof Error ? e.message : String(e)
    } finally {
      detaching = false
    }
  }

  function copyPath() {
    if (!file?.path) return
    void copyTextToClipboard(file.path).then(() => {
      copiedPath = true
      if (copiedTimer != null) window.clearTimeout(copiedTimer)
      copiedTimer = window.setTimeout(() => (copiedPath = false), 1400)
    })
  }

  // Cleanup the copied-path timer on unmount.
  $effect(() => () => {
    if (copiedTimer != null) window.clearTimeout(copiedTimer)
  })

  // Reset editor state when the preview navigates to another file. Do not
  // depend on `file.content`: a successful autosave updates that value, and
  // treating the acknowledgement as a new preview would close the editor.
  $effect(() => {
    void file?.path
    editing = false
    onEditingChange?.(false)
    draft = untrack(() => file?.content || '')
    saveState = 'idle'
    saveError = ''
    copiedPath = false
    detaching = false
    detachError = ''
    showSources = false
  })

  // Debounced autosave while editing.
  $effect(() => {
    const next = draft
    if (!editing || !file?.ok || loading) return
    if (next === (file.content || '')) {
      saveState = 'idle'
      saveError = ''
      return
    }
    saveState = 'saving'
    saveError = ''
    const timer = window.setTimeout(() => {
      void writeLocalFile(file.path, next)
        .then((r) => {
          if (!r.ok) throw new Error(r.error || 'Could not save file')
          if (file) {
            file.content = next
            if (r.size !== undefined) file.size = r.size
          }
          saveState = 'saved'
        })
        .catch((e) => {
          saveState = 'error'
          saveError = e instanceof Error ? e.message : String(e)
        })
    }, 450)
    return () => window.clearTimeout(timer)
  })

  // Scroll to the link's in-document locator once content is rendered. For
  // markdown we jump to the matching heading (by id/title slug, or the section
  // enclosing a line number); otherwise (and as a fallback) we scroll the raw
  // text proportionally to the line.
  $effect(() => {
    const container = scrollEl
    const c = content
    const ln = line
    const an = anchor
    if (!container || loading || !c || (ln == null && !an)) return
    const raf = requestAnimationFrame(() => {
      const flash = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect()
        const top = container.getBoundingClientRect().top
        container.scrollTop += rect.top - top - 8
        el.style.transition = 'background-color 0.25s ease'
        el.style.backgroundColor = 'var(--arbol-color-accent-soft)'
        setTimeout(() => { el.style.backgroundColor = '' }, 1100)
      }
      if (markdown) {
        const headings = scanHeadings(c)
        let target = -1
        if (an) {
          const a = slugify(an)
          target = headings.find((h) => h.slug === a)?.index ?? -1
        } else if (ln != null) {
          for (const h of headings) { if (h.line <= ln) target = h.index; else break }
        }
        const els = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
        if (target >= 0 && els[target]) { flash(els[target]); return }
      }
      if (ln != null) {
        const total = c.split('\n').length || 1
        container.scrollTop = ((ln - 1) / total) * container.scrollHeight
      }
    })
    return () => cancelAnimationFrame(raf)
  })
</script>

{#if file || loading}
  <div
    style="border-left:1px solid var(--arbol-color-border);background:color-mix(in oklch, var(--arbol-color-surface) 30%, var(--arbol-color-bg));min-width:0;min-height:0;height:100%;display:grid;grid-template-rows:auto 1fr"
  >
    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-2);min-width:0;padding:var(--arbol-space-3) var(--arbol-space-4);border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface)"
    >
      <div style="min-width:0;flex:1">
        <div
          style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text);font:700 var(--arbol-type-body)/1.2 var(--arbol-font-ui)"
        >
          {title}
        </div>
        <button
          type="button"
          data-arbol-no-linkify
          onclick={copyPath}
          disabled={!file?.path}
          title={file?.path ? 'Copy file path' : undefined}
          style="all:unset;box-sizing:border-box;display:block;max-width:100%;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:{file?.path
            ? 'copy'
            : 'default'};color:{copiedPath ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'};font:400 var(--arbol-type-label)/1.25 var(--arbol-font-mono)"
        >
          {copiedPath ? 'Copied path' : file?.path || 'Reading…'}{!copiedPath && file?.size !== undefined
            ? ` · ${formatBytes(file.size)}`
            : ''}{!copiedPath && file?.truncated ? ' · preview truncated' : ''}
        </button>
      </div>
      {#if previewNav}
        <button
          type="button"
          onclick={previewNav.onBack}
          disabled={!previewNav.canBack}
          aria-label="Back"
          title="Back  (⌘⇧⌥5)"
          style={navButtonStyle(previewNav.canBack)}
        >
          ‹
        </button>
        <button
          type="button"
          onclick={previewNav.onForward}
          disabled={!previewNav.canForward}
          aria-label="Forward"
          title="Forward  (⌘⇧⌥6)"
          style={navButtonStyle(previewNav.canForward)}
        >
          ›
        </button>
      {/if}
      {#if file?.ok && !file.isDirectory && dirOf(file.path)}
        <button
          type="button"
          onclick={() => onOpenLocalFile?.(dirOf(file!.path))}
          aria-label="View parent folder"
          title="View parent folder content"
          style="all:unset;box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--arbol-radius-s);color:var(--arbol-color-text-muted);border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap"
        >
          <span aria-hidden="true">⌃</span>
          Folder
        </button>
      {/if}
      {#if file?.ok && !file.isDirectory}
        <button
          type="button"
          onclick={detach}
          disabled={detaching}
          title={detachError || 'Open in a separate Detached View app'}
          style="all:unset;box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;cursor:{detaching ? 'default' : 'pointer'};opacity:{detaching ? 0.6 : 1};border-radius:var(--arbol-radius-s);color:{detachError ? 'var(--arbol-color-danger, #d05c5c)' : 'var(--arbol-color-text-muted)'};border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap"
        >
          {detaching ? 'Detaching…' : 'Detach'}
        </button>
      {/if}
      {#if onToggleFullscreen}
        <button
          type="button"
          onclick={onToggleFullscreen}
          aria-pressed={fullscreen}
          title={fullscreen ? 'Exit fullscreen view' : 'Fullscreen view'}
          style="all:unset;box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;cursor:pointer;border-radius:var(--arbol-radius-s);color:{fullscreen
            ? 'var(--arbol-color-accent)'
            : 'var(--arbol-color-text-muted)'};border:{fullscreen
            ? '1px solid color-mix(in oklch, var(--arbol-color-accent) 45%, var(--arbol-color-border))'
            : '1px solid var(--arbol-color-border)'};background:{fullscreen
            ? 'var(--arbol-color-accent-soft)'
            : 'var(--arbol-color-surface-2)'};font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap"
        >
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      {/if}
      {#if file?.ok && sourceCount > 0 && !editing}
        <button
          type="button"
          onclick={() => (showSources = !showSources)}
          aria-pressed={showSources}
          title={showSources ? 'Hide Source Refs' : 'Show Source Refs'}
          style="all:unset;box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;cursor:pointer;border-radius:var(--arbol-radius-s);color:{showSources
            ? 'var(--arbol-color-accent)'
            : 'var(--arbol-color-text-muted)'};border:{showSources
            ? '1px solid color-mix(in oklch, var(--arbol-color-accent) 45%, var(--arbol-color-border))'
            : '1px solid var(--arbol-color-border)'};background:{showSources
            ? 'var(--arbol-color-accent-soft)'
            : 'var(--arbol-color-surface-2)'};font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap"
        >
          Sources · {sourceCount}
        </button>
      {/if}
      {#if file?.ok}
        <button
          type="button"
          onclick={() => canEdit && setEditingState(!editing)}
          disabled={!canEdit}
          aria-pressed={editing}
          title={file.truncated ? 'Cannot edit a truncated preview' : editing ? 'Return to preview' : 'Edit file'}
          style="all:unset;box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;cursor:{canEdit
            ? 'pointer'
            : 'default'};opacity:{canEdit ? 1 : 0.45};border-radius:var(--arbol-radius-s);color:{editing
            ? 'var(--arbol-color-accent)'
            : 'var(--arbol-color-text-muted)'};border:{editing
            ? '1px solid color-mix(in oklch, var(--arbol-color-accent) 45%, var(--arbol-color-border))'
            : '1px solid var(--arbol-color-border)'};background:{editing
            ? 'var(--arbol-color-accent-soft)'
            : 'var(--arbol-color-surface-2)'};font:700 var(--arbol-type-label)/1 var(--arbol-font-ui)"
        >
          {editing ? 'Preview' : 'Edit'}
        </button>
      {/if}
      {#if editing}
        <span
          title={saveError || undefined}
          style="color:{saveState === 'error'
            ? 'var(--arbol-color-danger, #d05c5c)'
            : 'var(--arbol-color-text-muted)'};font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);white-space:nowrap"
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Autosave'}
        </span>
      {/if}
      {#if onClose}
        <button
          type="button"
          onclick={onClose}
          aria-label="Close file preview"
          title="Close file preview"
          style="all:unset;box-sizing:border-box;width:26px;height:26px;display:grid;place-items:center;cursor:pointer;border-radius:var(--arbol-radius-s);color:var(--arbol-color-text-muted);border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);font:700 var(--arbol-type-body)/1 var(--arbol-font-ui)"
        >
          ×
        </button>
      {/if}
    </div>
    <div bind:this={scrollEl} style="min-height:0;overflow:auto;padding:{editing ? '0' : 'var(--arbol-space-4)'}">
      {#if editing && file?.ok}
        <textarea
          bind:value={draft}
          spellcheck={false}
          aria-label={`Edit ${title}`}
          style="box-sizing:border-box;display:block;width:100%;height:100%;min-height:100%;resize:none;border:none;outline:none;padding:var(--arbol-space-4);background:var(--arbol-color-surface);color:var(--arbol-color-text);font:400 0.84em/1.55 var(--arbol-font-mono);tab-size:2"
        ></textarea>
      {:else if loading}
        <div style="color:var(--arbol-color-text-muted);font:500 var(--arbol-type-body)/1.5 var(--arbol-font-ui)">Loading file…</div>
      {:else if file?.ok}
        {#if file.isDirectory}
          <div class="directory-list" aria-label={`Contents of ${file.path}`}>
            {#if dirOf(file.path)}
              <button type="button" class="file-entry parent-entry" onclick={() => onOpenLocalFile?.(dirOf(file!.path))}>
                <span class="entry-icon" aria-hidden="true">↰</span>
                <span class="entry-name">..</span>
                <span class="entry-detail">Parent folder</span>
              </button>
            {/if}
            {#each file.entries || [] as entry (entry.path)}
              <button type="button" class="file-entry" onclick={() => onOpenLocalFile?.(entry.path)} title={entry.path}>
                <span class="entry-icon" aria-hidden="true">{entry.isDirectory ? '▸' : '·'}</span>
                <span class="entry-name">{entry.name}</span>
                <span class="entry-detail">{entry.isDirectory ? 'Folder' : formatBytes(entry.size)}</span>
              </button>
            {:else}
              <div class="empty-directory">This folder is empty.</div>
            {/each}
          </div>
        {:else if blueprint}
          <div style="color:var(--arbol-color-text);font-size:var(--arbol-content-font-size);line-height:1.65">
            <BlueprintDoc
              content={file.content || ''}
              {showSources}
              {onOpenLocalFile}
              baseDir={file?.path ? dirOf(file.path) : undefined}
              docPath={file?.path}
            />
          </div>
        {:else if markdown}
          <div style="color:var(--arbol-color-text);font-size:var(--arbol-content-font-size);line-height:1.65">
            {#if frontmatter}<Frontmatter data={frontmatter.data} />{/if}
            <MarkdownBlocks
              blocks={parseDocMarkdown(frontmatter ? frontmatter.body : file.content || '', { showSources })}
              {onOpenLocalFile}
              baseDir={file?.path ? dirOf(file.path) : undefined}
              docPath={file?.path}
            />
          </div>
        {:else}
          <pre style="margin:0;color:var(--arbol-color-text);white-space:pre-wrap;word-break:break-word;font:400 0.84em/1.55 var(--arbol-font-mono)">{file.content || ''}</pre>
        {/if}
      {:else}
        <div
          style="border:1px solid color-mix(in oklch, var(--arbol-color-danger, #d05c5c) 45%, var(--arbol-color-border));border-radius:var(--arbol-radius-m);padding:var(--arbol-space-4);color:color-mix(in oklch, var(--arbol-color-danger, #d05c5c) 80%, var(--arbol-color-text));background:color-mix(in oklch, var(--arbol-color-danger, #d05c5c) 9%, var(--arbol-color-surface));font:500 var(--arbol-type-body)/1.45 var(--arbol-font-ui)"
        >
          {file?.error || 'Could not read this file.'}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div
    style="border-left:1px solid var(--arbol-color-border);background:color-mix(in oklch, var(--arbol-color-surface) 30%, var(--arbol-color-bg));display:grid;place-items:center;padding:var(--arbol-space-6);min-width:0"
  >
    <div style="text-align:center;color:var(--arbol-color-text-muted);max-width:260px;opacity:0.8">
      <div style="width:30px;height:30px;margin:0 auto var(--arbol-space-3);opacity:0.5">
        <!-- ElmaLeafGlyph (inlined pure-SVG; ../components is still React) -->
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19.85 4.35C14.05 4.55 8.95 6.8 6.25 10.45c-2.15 2.9-2.25 6.25-.35 8.55 2.75 1.2 6.15.35 8.6-2.25 3.05-3.25 4.55-7.4 5.35-12.4Z" />
          <path d="M6.25 18.75C9.35 14.25 12.6 10.9 17.85 6.45" />
          <path d="M9.05 14.85c-1.15-.15-2.25-.55-3.3-1.2" />
          <path d="M11.2 12.35c-1.25-.2-2.45-.7-3.55-1.5" />
          <path d="M13.55 10.05c1.25.05 2.45-.15 3.6-.6" />
          <path d="M11.3 15.45c1.15.15 2.35.05 3.6-.3" />
        </svg>
      </div>
      <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px">
        File preview
      </div>
      <div style="font:400 var(--arbol-type-label)/1.5 var(--arbol-font-ui)">
        Click a local file link in chat to preview it here.
      </div>
    </div>
  </div>
{/if}

<style>
  .directory-list { display:flex; flex-direction:column; gap:2px; }
  .file-entry { all:unset; box-sizing:border-box; min-height:34px; display:grid; grid-template-columns:20px minmax(0, 1fr) auto; align-items:center; gap:8px; padding:5px 9px; border-radius:var(--arbol-radius-s); color:var(--arbol-color-text); cursor:pointer; font:500 var(--arbol-type-body)/1.25 var(--arbol-font-ui); }
  .file-entry:hover, .file-entry:focus-visible { background:var(--arbol-color-accent-soft); outline:none; }
  .entry-icon { color:var(--arbol-color-text-muted); text-align:center; font-family:var(--arbol-font-mono); }
  .entry-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .entry-detail { color:var(--arbol-color-text-muted); font:500 var(--arbol-type-label)/1 var(--arbol-font-mono); }
  .parent-entry .entry-name { color:var(--arbol-color-text-muted); }
  .empty-directory { padding:var(--arbol-space-4); color:var(--arbol-color-text-muted); font:500 var(--arbol-type-body)/1.5 var(--arbol-font-ui); }
</style>
