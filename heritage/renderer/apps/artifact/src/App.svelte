<script lang="ts">
  import { entityLinkTarget } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import { callNative, MarkdownBlocks, BlueprintDoc, Frontmatter, isBlueprint, parseFrontmatter, parseDocMarkdown, splitLocator } from '@arbol/design-system'

  type Launch = { path: string; repo_name: string; repo_path: string; theme: string }
  type Preview = { ok?: boolean; path: string; name?: string; content?: string; size?: number; truncated?: boolean; error?: string }
  type PageEntry = { path: string; anchor?: string; line?: number }

  const launch: Launch = (() => {
    try { return JSON.parse(new URLSearchParams(location.search).get('artifact') || '{}') }
    catch { return {} as Launch }
  })()
  const detachedNumber = new URLSearchParams(location.search).get('detached_number')
  document.documentElement.setAttribute('data-theme', launch.theme || 'redwood')

  let file = $state<Preview>({ path: launch.path || '' })
  let history = $state<PageEntry[]>(launch.path ? [{ path: launch.path }] : [])
  let historyIndex = $state(launch.path ? 0 : -1)
  let locator = $state<{ anchor?: string; line?: number }>({})
  let loading = $state(true)
  let refreshing = $state(false)
  let editing = $state(false)
  let draft = $state('')
  let saving = $state(false)
  let saved = $state(false)
  let error = $state('')
  let mainEl: HTMLElement | undefined = $state()
  let searchInputEl: HTMLInputElement | undefined = $state()
  let searchOpen = $state(false)
  let searchQuery = $state('')
  let searchCount = $state(0)
  let activeSearchIndex = $state(0)
  let searchFrame = 0
  let loadGeneration = 0
  let lastLoadedAt = 0

  const currentPath = $derived(file.path || history[historyIndex]?.path || launch.path || '')
  const name = $derived(file.name || currentPath.split('/').filter(Boolean).pop() || 'Artifact')
  const directory = $derived(currentPath.slice(0, Math.max(0, currentPath.lastIndexOf('/') + 1)))
  const canGoBack = $derived(historyIndex > 0)
  const canGoForward = $derived(historyIndex >= 0 && historyIndex < history.length - 1)
  const markdown = $derived(/\.(md|markdown|mdown|mkd|mdx)$/i.test(name))
  const blueprint = $derived(markdown && !!file.content && isBlueprint(file.content))
  const frontmatter = $derived(markdown && !blueprint && file.content ? parseFrontmatter(file.content) : null)

  function clearSearchMarks() {
    if (!mainEl) return
    for (const mark of mainEl.querySelectorAll<HTMLElement>('mark[data-artifact-search-hit]')) {
      const parent = mark.parentNode
      mark.replaceWith(document.createTextNode(mark.textContent || ''))
      parent?.normalize()
    }
  }

  function activateSearchHit(index: number, scroll = true) {
    if (!mainEl) return
    const hits = [...mainEl.querySelectorAll<HTMLElement>('mark[data-artifact-search-hit]')]
    if (!hits.length) { activeSearchIndex = 0; return }
    activeSearchIndex = ((index % hits.length) + hits.length) % hits.length
    hits.forEach((hit, i) => {
      if (i === activeSearchIndex) hit.setAttribute('data-active', 'true')
      else hit.removeAttribute('data-active')
    })
    if (scroll) hits[activeSearchIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  // Search the text the View Page actually renders. Walking text nodes keeps the
  // feature format-agnostic: Markdown, Blueprint cards, frontmatter, and plain
  // files all participate without changing their individual renderers.
  function applySearch(preferredIndex = 0) {
    cancelAnimationFrame(searchFrame)
    clearSearchMarks()
    const query = searchQuery.trim()
    if (!searchOpen || !query || editing || !mainEl) {
      searchCount = 0
      activeSearchIndex = 0
      return
    }

    const nodes: Text[] = []
    const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue || ''
        const parent = node.parentElement
        if (!text || !parent || parent.closest('script,style,textarea,mark[data-artifact-search-hit]')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    })
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)

    const needle = query.toLowerCase()
    for (const node of nodes) {
      const text = node.nodeValue || ''
      const lower = text.toLowerCase()
      let from = 0
      let index = lower.indexOf(needle)
      if (index < 0) continue
      const fragment = document.createDocumentFragment()
      while (index >= 0) {
        if (index > from) fragment.append(document.createTextNode(text.slice(from, index)))
        const mark = document.createElement('mark')
        mark.setAttribute('data-artifact-search-hit', '')
        mark.textContent = text.slice(index, index + query.length)
        fragment.append(mark)
        from = index + query.length
        index = lower.indexOf(needle, from)
      }
      if (from < text.length) fragment.append(document.createTextNode(text.slice(from)))
      node.replaceWith(fragment)
    }

    searchCount = mainEl.querySelectorAll('mark[data-artifact-search-hit]').length
    activateSearchHit(Math.min(preferredIndex, Math.max(0, searchCount - 1)), searchCount > 0)
  }

  function scheduleSearch(preferredIndex = activeSearchIndex) {
    cancelAnimationFrame(searchFrame)
    searchFrame = requestAnimationFrame(() => applySearch(preferredIndex))
  }

  function openSearch() {
    if (editing) return
    searchOpen = true
    scheduleSearch()
    requestAnimationFrame(() => {
      searchInputEl?.focus()
      searchInputEl?.select()
    })
  }

  function closeSearch() {
    cancelAnimationFrame(searchFrame)
    searchOpen = false
    clearSearchMarks()
    searchCount = 0
    activeSearchIndex = 0
  }

  function moveSearch(delta: number) {
    if (!searchCount) return
    activateSearchHit(activeSearchIndex + delta)
  }

  function beginHeaderDrag(event: MouseEvent) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button,input,textarea,select,a,[role=button]')) return
    void callNative('app.beginWindowDrag', {})
  }

  function parseEntry(target: string): PageEntry {
    const { filePart, suffix } = splitLocator(target)
    if (suffix.startsWith('#')) {
      const value = suffix.slice(1)
      const line = value.match(/^L?(\d+)$/)
      return { path: filePart || currentPath, ...(line ? { line: Number(line[1]) } : { anchor: value }) }
    }
    if (suffix.startsWith(':')) return { path: filePart || currentPath, line: Number(suffix.slice(1)) }
    return { path: filePart || currentPath }
  }

  function slug(value: string) {
    return value.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-')
  }

  function scrollToLocator() {
    if (!mainEl || (!locator.anchor && locator.line == null)) return
    requestAnimationFrame(() => {
      const headings = [...mainEl!.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')]
      let target: HTMLElement | undefined
      if (locator.anchor) {
        const wanted = slug(locator.anchor)
        target = headings.find((heading) => heading.id === locator.anchor || slug(heading.id || heading.textContent || '') === wanted)
      } else if (locator.line != null && file.content) {
        const sourceHeadings = file.content.split('\n').flatMap((line, index) => {
          const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
          return match ? [{ line: index + 1, slug: slug(match[1]) }] : []
        })
        const sourceTarget = sourceHeadings.filter((heading) => heading.line <= locator.line!).pop()
        if (sourceTarget) target = headings.find((heading) => slug(heading.id || heading.textContent || '') === sourceTarget.slug)
      }
      if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' })
      else if (locator.line != null && file.content) {
        const total = file.content.split('\n').length || 1
        mainEl!.scrollTop = ((locator.line - 1) / total) * mainEl!.scrollHeight
      }
    })
  }

  async function load(
    entry: PageEntry = history[historyIndex] || { path: launch.path },
    refresh = false,
  ) {
    const generation = ++loadGeneration
    clearSearchMarks()
    closeSearch()
    editing = false
    locator = { anchor: entry.anchor, line: entry.line }
    if (refresh) refreshing = true
    else loading = true
    error = ''
    try {
      const result = await callNative('file.readPreview', { path: entry.path }) as Preview
      if (generation !== loadGeneration) return
      file = { ...result, path: result.path || entry.path }
      draft = file.content || ''
      if (!result.ok) error = result.error || 'Could not read artifact'
      else scrollToLocator()
    } catch (e) {
      if (generation === loadGeneration) error = e instanceof Error ? e.message : String(e)
    } finally {
      if (generation === loadGeneration) {
        loading = false
        refreshing = false
        lastLoadedAt = Date.now()
        if (searchOpen) scheduleSearch(0)
      }
    }
  }

  function refresh() {
    // Re-read only on demand or when this window becomes active. This avoids a
    // resident file watcher while ensuring changes made by agents/editors do not
    // leave a detached view stale. Never replace an in-progress local edit.
    if (editing || saving || loading || refreshing) return
    void load(history[historyIndex] || { path: currentPath || launch.path }, true)
  }

  function openLocalFile(target: string) {
    const entry = parseEntry(target)
    const current = history[historyIndex]
    if (current?.path === entry.path && current.anchor === entry.anchor && current.line === entry.line) {
      locator = { anchor: entry.anchor, line: entry.line }
      scrollToLocator()
      return
    }
    history = [...history.slice(0, historyIndex + 1), entry]
    historyIndex = history.length - 1
    void load(entry)
  }

  function navigateHistory(delta: -1 | 1) {
    const next = historyIndex + delta
    if (next < 0 || next >= history.length) return
    historyIndex = next
    void load(history[next])
  }

  function startEdit() {
    if (!file.ok || file.truncated) return
    closeSearch()
    draft = file.content || ''; saved = false; editing = true
  }

  async function save() {
    if (saving) return
    saving = true; saved = false; error = ''
    try {
      const result = await callNative('file.write', { path: currentPath, content: draft }) as { ok?: boolean; error?: string; size?: number }
      if (!result.ok) throw new Error(result.error || 'Could not save artifact')
      file = { ...file, content: draft, size: result.size ?? file.size }
      saved = true; editing = false
    } catch (e) { error = e instanceof Error ? e.message : String(e) }
    finally { saving = false }
  }

  function close() { void callNative('app.closeWindow', {}) }

  onMount(() => {
    void load()
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (event.metaKey && key === 'w') { event.preventDefault(); close(); return }
      if (event.metaKey && key === 'f' && !editing) { event.preventDefault(); openSearch(); return }
      if (event.metaKey && key === 'r') { event.preventDefault(); refresh(); return }
      if (editing && event.metaKey && key === 's') { event.preventDefault(); void save(); return }
      if (editing && event.key === 'Escape') { event.preventDefault(); editing = false; draft = file.content || ''; return }
      if (searchOpen && event.key === 'Escape') { event.preventDefault(); closeSearch(); return }
      if (event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); navigateHistory(-1); return }
      if (event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'ArrowRight') { event.preventDefault(); navigateHistory(1) }
    }
    const refreshWhenActive = () => {
      // Focus and visibility can fire together; suppress immediate duplicate
      // reads while still refreshing after every meaningful return to the view.
      if (!document.hidden && Date.now() - lastLoadedAt > 500) refresh()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenActive)
    return () => {
      cancelAnimationFrame(searchFrame)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenActive)
    }
  })
</script>

<div class="page">
  <header onmousedown={beginHeaderDrag} role="presentation">
    <div class="path" title={currentPath}>
      <span class="directory">{directory}</span><strong>{name}</strong>
    </div>
    <div class="actions">
      <div class="navigation" aria-label="Artifact navigation">
        <button class="nav-button" onclick={() => navigateHistory(-1)} disabled={!canGoBack} title="Back (Cmd+Left)" aria-label="Back">‹</button>
        <button class="nav-button" onclick={() => navigateHistory(1)} disabled={!canGoForward} title="Forward (Cmd+Right)" aria-label="Forward">›</button>
      </div>
      {#if error}<span class="error">{error}</span>{/if}
      {#if saved}<span class="saved">Saved</span>{/if}
      {#if searchOpen}
        <div class="search" role="search">
          <input
            bind:this={searchInputEl}
            value={searchQuery}
            oninput={(event) => { searchQuery = event.currentTarget.value; applySearch(0) }}
            onkeydown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); moveSearch(event.shiftKey ? -1 : 1) }
            }}
            placeholder="Find in page"
            aria-label="Find in page"
          />
          <span class:no-results={!!searchQuery.trim() && searchCount === 0} class="search-count">
            {searchQuery.trim() ? (searchCount ? `${activeSearchIndex + 1}/${searchCount}` : 'No results') : ''}
          </span>
          <button class="search-button" onclick={() => moveSearch(-1)} disabled={!searchCount} title="Previous match (Shift+Enter)" aria-label="Previous match">↑</button>
          <button class="search-button" onclick={() => moveSearch(1)} disabled={!searchCount} title="Next match (Enter)" aria-label="Next match">↓</button>
          <button class="search-button close-search" onclick={closeSearch} title="Close find (Escape)" aria-label="Close find">×</button>
        </div>
      {:else if !editing}
        <button class="find-button" onclick={openSearch} title="Find in page (Cmd+F)" aria-label="Find in page">Find</button>
      {/if}
      {#if !editing}
        <button onclick={refresh} disabled={loading || refreshing} title="Reload from disk (Cmd+R)">{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      {/if}
      {#if editing}
        <button class="primary" onclick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      {:else}
        <button onclick={startEdit} disabled={!file.ok || !!file.truncated}>Edit</button>
      {/if}
      <span class="hint">Cmd+W to close</span>
    </div>
  </header>

  <main bind:this={mainEl} use:entityLinkTarget={{ repo: 'Arbol', kind: 'artifact', entityId: currentPath, title: name || 'Artifact', lookup: { filePath: currentPath } }}>
    {#if loading}
      <div class="state">Loading artifact…</div>
    {:else if editing}
      <textarea bind:value={draft} spellcheck={false} aria-label={`Edit ${name}`}></textarea>
    {:else if !file.ok}
      <div class="state error-card">{error || file.error || 'Could not open artifact.'}</div>
    {:else if blueprint}
      <article><BlueprintDoc content={file.content || ''} baseDir={directory} docPath={currentPath} onOpenLocalFile={openLocalFile} /></article>
    {:else if markdown}
      <article>
        {#if frontmatter}<Frontmatter data={frontmatter.data} />{/if}
        <MarkdownBlocks blocks={parseDocMarkdown(frontmatter ? frontmatter.body : file.content || '')} baseDir={directory} docPath={currentPath} onOpenLocalFile={openLocalFile} />
      </article>
    {:else}
      <pre>{file.content || ''}</pre>
    {/if}
  </main>

  <footer>
    <strong>{launch.repo_name || 'Repository'}</strong>
    <span>{detachedNumber ? `Detached View ${detachedNumber}` : 'Repo Artifacts'}</span>
  </footer>
</div>

<style>
  :global(html), :global(body), :global(#root) { height:100%; overflow:hidden; }
  button { border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-surface-2); color:var(--arbol-color-text); height:28px; padding:0 12px; font:700 var(--arbol-type-label)/1 var(--arbol-font-ui); cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--arbol-color-accent); }
  button:disabled { opacity:.42; cursor:default; }
  button.primary { background:var(--arbol-color-accent); color:var(--arbol-color-accent-ink); border-color:transparent; }
  .page { height:100%; display:grid; grid-template-rows:var(--arbol-control-bar-height) 1fr var(--arbol-control-bar-height); background:var(--arbol-color-bg); color:var(--arbol-color-text); }
  header { display:flex; align-items:center; gap:16px; padding:0 16px 0 var(--arbol-traffic-light-gutter); border-bottom:1px solid var(--arbol-color-border); background:var(--arbol-color-surface); min-width:0; user-select:none; }
  .path { min-width:60px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:500 var(--arbol-type-body)/1 var(--arbol-font-mono); }
  .directory { color:var(--arbol-color-text-muted); }
  .path strong { color:var(--arbol-color-accent); background:var(--arbol-color-accent-soft); border-radius:4px; padding:2px 5px; }
  .actions { display:flex; align-items:center; gap:10px; white-space:nowrap; }
  .navigation { display:flex; align-items:center; gap:4px; }
  button.nav-button { width:28px; padding:0; font:700 20px/1 var(--arbol-font-ui); }
  .hint, .saved, .error { font:600 var(--arbol-type-label)/1 var(--arbol-font-mono); color:var(--arbol-color-text-muted); }
  .saved { color:var(--arbol-color-ok); }.error { color:var(--arbol-color-err); max-width:220px; overflow:hidden; text-overflow:ellipsis; }
  .find-button { color:var(--arbol-color-text-muted); }
  .search { display:flex; align-items:center; height:30px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); overflow:hidden; }
  .search:focus-within { border-color:var(--arbol-color-accent); box-shadow:0 0 0 1px var(--arbol-color-accent-soft); }
  .search input { width:150px; height:100%; box-sizing:border-box; border:0; outline:0; padding:0 8px; background:transparent; color:var(--arbol-color-text); font:500 var(--arbol-type-label)/1 var(--arbol-font-ui); user-select:text; }
  .search-count { min-width:42px; padding:0 5px; text-align:right; color:var(--arbol-color-text-muted); font:600 10px/1 var(--arbol-font-mono); }
  .search-count.no-results { min-width:58px; color:var(--arbol-color-err); }
  button.search-button { width:27px; height:28px; padding:0; border-width:0 0 0 1px; border-radius:0; }
  button.close-search { font-size:17px; font-weight:500; }
  main { min-height:0; overflow:auto; }
  :global(mark[data-artifact-search-hit]) { padding:0; border-radius:2px; background:color-mix(in oklch, var(--arbol-color-warn) 48%, transparent); color:inherit; box-shadow:inset 0 0 0 1px color-mix(in oklch, var(--arbol-color-warn) 55%, transparent); }
  :global(mark[data-artifact-search-hit][data-active="true"]) { background:var(--arbol-color-accent); color:var(--arbol-color-accent-ink); box-shadow:0 0 0 2px var(--arbol-color-accent-soft); }
  article { max-width:var(--arbol-text-area-max-width); margin:0 auto; padding:32px 28px 64px; font-size:var(--arbol-content-font-size); line-height:1.65; }
  pre { max-width:1000px; min-height:100%; margin:0 auto; padding:32px; white-space:pre-wrap; word-break:break-word; color:var(--arbol-color-text); font:400 .9em/1.6 var(--arbol-font-mono); }
  textarea { display:block; width:100%; height:100%; border:0; outline:0; resize:none; padding:32px max(32px, calc((100% - 900px)/2)); background:var(--arbol-color-surface); color:var(--arbol-color-text); font:400 .9em/1.6 var(--arbol-font-mono); tab-size:2; }
  .state { display:grid; place-items:center; height:100%; color:var(--arbol-color-text-muted); font:600 var(--arbol-type-body)/1.5 var(--arbol-font-ui); }
  .error-card { color:var(--arbol-color-err); }
  footer { display:flex; align-items:center; justify-content:space-between; padding:0 18px; border-top:1px solid var(--arbol-color-border); background:var(--arbol-color-surface); color:var(--arbol-color-text-muted); font:600 var(--arbol-type-label)/1 var(--arbol-font-mono); }
  footer strong { color:var(--arbol-color-text); }

  @media (max-width:760px) {
    .hint, .directory { display:none; }
    .search input { width:120px; }
  }
</style>
