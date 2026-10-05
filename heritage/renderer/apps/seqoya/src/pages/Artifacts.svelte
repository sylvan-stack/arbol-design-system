<script lang="ts">
  /* Artifacts (Seqoya Lab): browse the repo's Artifact Corpus (~/Artifacts/<repo>)
   * plus the shared ~/Artifacts/mycel corpus, which rides along for every repo.
   * A file/folder tree per corpus on the left, the selected artifact rendered on
   * the right with Edit→Save. Save writes the file and re-ingests, so editing
   * flags any derived chunks that drifted. */
  import { onMount } from 'svelte'

  let { repo = 'Arbol', openTarget = null }: { repo?: string; openTarget?: { corpus: string; path: string } | null } = $props()
  import { MarkdownDoc, splitLocator } from '@arbol/design-system'
  import { api, type ArtifactNode, type ArtifactTree } from '../api'

  const SHARED = 'mycel'
  const corpora = $derived([
    repo,
    ...(repo === SHARED ? [] : [SHARED]),
  ])

  let trees = $state<Record<string, ArtifactTree>>({})
  let treeErrors = $state<Record<string, string>>({})
  let selected = $state<{ corpus: string; path: string } | null>(null)
  let content = $state('')
  let selectedReadOnly = $state(false)
  let selectedLinked = $state(false)
  let scrollAnchor = $state<string | undefined>(undefined)
  let loadingDoc = $state(false)
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  let openedTarget = $state<string | null>(null)
  let refreshingTrees = $state(false)
  let syncNotice = $state<string | null>(null)
  let folderOpen = $state<Record<string, boolean>>({})
  let contextMenu = $state<{ corpus: string; node: ArtifactNode; x: number; y: number } | null>(null)
  let mutatingPath = $state<string | null>(null)
  let detaching = $state(false)

  const baseDir = $derived(selected ? selected.path.split('/').slice(0, -1).join('/') : '')

  const folderKey = (corpus: string, path: string) => `${corpus}:${path}`

  function isFolderOpen(corpus: string, n: ArtifactNode, depth: number): boolean {
    return folderOpen[folderKey(corpus, n.path)] ?? depth === 0
  }

  function rememberFolderState(corpus: string, path: string, event: ToggleEvent) {
    const open = (event.currentTarget as HTMLDetailsElement).open
    const key = folderKey(corpus, path)
    if (folderOpen[key] === open) return
    folderOpen = { ...folderOpen, [key]: open }
  }

  function showContextMenu(event: MouseEvent, corpus: string, node: ArtifactNode) {
    event.preventDefault()
    event.stopPropagation()
    const width = 180
    const height = 112
    contextMenu = {
      corpus, node,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    }
  }

  const pathIsWithin = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`)

  function renamedPath(path: string, oldPath: string, nextPath: string): string {
    return path === oldPath ? nextPath : `${nextPath}${path.slice(oldPath.length)}`
  }

  function reportActionError(value: unknown) {
    const message = value instanceof Error ? value.message : String(value)
    error = message
    syncNotice = message
  }

  async function editName() {
    const item = contextMenu
    contextMenu = null
    if (!item || item.node.read_only) return
    const name = window.prompt('Edit name', item.node.name)?.trim()
    if (!name || name === item.node.name) return
    mutatingPath = item.node.path
    error = null
    try {
      const result = await api.artifacts.rename(item.node.path, name, item.corpus)
      if (selected?.corpus === item.corpus && pathIsWithin(selected.path, item.node.path)) {
        const next = renamedPath(selected.path, item.node.path, result.path)
        selected = { corpus: item.corpus, path: next }
        if (item.node.type === 'file') await open(item.corpus, next)
      }
      const oldFolderKey = folderKey(item.corpus, item.node.path)
      if (folderOpen[oldFolderKey] !== undefined) {
        const { [oldFolderKey]: wasOpen, ...rest } = folderOpen
        folderOpen = { ...rest, [folderKey(item.corpus, result.path)]: wasOpen }
      }
      syncNotice = `Renamed ${item.node.name} to ${name}.`
      await refreshTrees()
    } catch (e) { reportActionError(e) }
    finally { mutatingPath = null }
  }

  async function removeItem() {
    const item = contextMenu
    contextMenu = null
    if (!item || item.node.read_only) return
    const kind = item.node.type === 'dir' ? 'folder and all of its contents' : 'file'
    if (!window.confirm(`Remove ${item.node.name}? This will permanently delete the ${kind}.`)) return
    mutatingPath = item.node.path
    error = null
    try {
      await api.artifacts.remove(item.node.path, item.corpus)
      if (selected?.corpus === item.corpus && pathIsWithin(selected.path, item.node.path)) {
        selected = null
        content = ''
        selectedReadOnly = false
        selectedLinked = false
        note = null
      }
      syncNotice = `${item.node.name} was removed.`
      await refreshTrees()
    } catch (e) { reportActionError(e) }
    finally { mutatingPath = null }
  }

  async function openInFinder() {
    const item = contextMenu
    contextMenu = null
    if (!item) return
    const root = trees[item.corpus]?.root
    if (!root) return
    const fullPath = item.node.path ? `${root}/${item.node.path}` : root
    try {
      const result = await api.artifacts.reveal(fullPath)
      if (!result?.ok) throw new Error(result?.error || 'Could not open Finder')
    } catch (e) { reportActionError(e) }
  }

  function openRequestedTarget() {
    if (!openTarget) return
    const key = `${openTarget.corpus}:${openTarget.path}`
    if (openedTarget === key) return
    openedTarget = key
    const { filePart, suffix } = splitLocator(openTarget.path)
    if (filePart) void open(openTarget.corpus, filePart, suffix.startsWith('#') ? suffix.slice(1) : undefined)
  }

  function containsFile(nodes: ArtifactNode[], path: string): boolean {
    return nodes.some((n) => n.type === 'file' ? n.path === path : containsFile(n.children ?? [], path))
  }

  async function refreshTrees() {
    if (refreshingTrees) return
    refreshingTrees = true
    try {
      // Each corpus tree loads independently — the shared tree must not block
      // the repo tree (or vice versa).
      await Promise.all(corpora.map(async (corpus) => {
        try {
          const t = await api.artifacts.tree(corpus)
          trees = { ...trees, [corpus]: t }
          const { [corpus]: _old, ...remainingErrors } = treeErrors
          treeErrors = remainingErrors

          if (selected?.corpus === corpus && !containsFile(t.tree, selected.path)) {
            const removed = selected.path
            selected = null
            content = ''
            selectedReadOnly = false
            selectedLinked = false
            error = null
            note = null
            syncNotice = `${removed} was removed from disk.`
          }
          openRequestedTarget()
        } catch (e) {
          treeErrors = { ...treeErrors, [corpus]: e instanceof Error ? e.message : String(e) }
        }
      }))
    } finally {
      refreshingTrees = false
    }
  }

  onMount(() => {
    void refreshTrees()

    // The RPC transport has no filesystem event stream. Poll while this page is
    // mounted and refresh immediately when the app regains focus/visibility.
    const timer = window.setInterval(() => { if (!document.hidden) void refreshTrees() }, 3000)
    const onFocus = () => void refreshTrees()
    const onVisibility = () => { if (!document.hidden) void refreshTrees() }
    const closeContextMenu = () => { contextMenu = null }
    const closeContextMenuOnKey = (event: KeyboardEvent) => { if (event.key === 'Escape') contextMenu = null }
    window.addEventListener('focus', onFocus)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('blur', closeContextMenu)
    window.addEventListener('keydown', closeContextMenuOnKey)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('scroll', closeContextMenu, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('blur', closeContextMenu)
      window.removeEventListener('keydown', closeContextMenuOnKey)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('scroll', closeContextMenu, true)
    }
  })

  $effect(() => {
    void openTarget
    openRequestedTarget()
  })

  $effect(() => {
    void selected
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-artifact-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
  })

  async function open(corpus: string, path: string, anchor?: string) {
    selected = { corpus, path }; error = null; note = null; syncNotice = null; loadingDoc = true; scrollAnchor = anchor
    try {
      const file = await api.artifacts.read(path, corpus)
      if (!file.exists) {
        syncNotice = `${path} no longer exists on disk.`
        selected = null
        content = ''
        selectedReadOnly = false
        selectedLinked = false
        void refreshTrees()
        return
      }
      content = file.content
      selectedReadOnly = file.read_only === true
      selectedLinked = file.linked === true
    } catch (e) { error = e instanceof Error ? e.message : String(e) }
    finally { loadingDoc = false }
  }

  // A link to a different artifact (path + optional #anchor); open + land on it.
  // Cross-doc links stay within the corpus of the doc that holds them.
  function navigate(target: string) {
    if (!selected) return
    const { filePart, suffix } = splitLocator(target)
    if (!filePart) return
    const parts = (filePart.startsWith('/') ? filePart.slice(1) : `${baseDir}/${filePart}`).split('/')
    const normalized: string[] = []
    for (const part of parts) {
      if (!part || part === '.') continue
      if (part === '..') normalized.pop()
      else normalized.push(part)
    }
    open(selected.corpus, normalized.join('/'), suffix.startsWith('#') ? suffix.slice(1) : undefined)
  }

  async function detachSelected() {
    if (!selected || detaching) return
    const root = trees[selected.corpus]?.root
    if (!root) return
    detaching = true
    error = null
    try {
      const fullPath = selected.path ? `${root}/${selected.path}` : root
      const result = await api.artifacts.detach(
        fullPath,
        selected.corpus,
        undefined,
        document.documentElement.getAttribute('data-theme') || undefined,
      )
      if (!result.ok) throw new Error(result.error || 'Could not detach artifact')
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      detaching = false
    }
  }

  async function save(next: string) {
    if (!selected) return
    const r = await api.artifacts.write(selected.path, next, selected.corpus)
    content = next
    note = r.stale.length ? `Saved · ${r.stale.length} chunk(s) now stale` : 'Saved · no drifts'
  }

  const fileGlyph = (n: ArtifactNode) => n.linked ? '↗' : (n.name.endsWith('.md') ? '📄' : '•')
</script>

{#snippet treeNode(corpus: string, n: ArtifactNode, depth: number)}
  {#if n.type === 'dir'}
    <details open={isFolderOpen(corpus, n, depth)} ontoggle={(event) => rememberFolderState(corpus, n.path, event)}>
      <summary oncontextmenu={(event) => showContextMenu(event, corpus, n)}
        style="cursor:pointer;padding:3px 4px;font:500 var(--arbol-type-label)/1.4 var(--arbol-font-mono);
                      color:var(--arbol-color-text-muted);user-select:none">{n.name}/</summary>
      <div style="padding-left:12px">
        {#each n.children ?? [] as c (c.path)}{@render treeNode(corpus, c, depth + 1)}{/each}
      </div>
    </details>
  {:else}
    {@const active = selected?.corpus === corpus && selected?.path === n.path}
    <button data-artifact-selected={active ? 'true' : undefined} onclick={() => open(corpus, n.path)}
      oncontextmenu={(event) => showContextMenu(event, corpus, n)} disabled={mutatingPath === n.path}
      style="display:block;width:100%;text-align:left;cursor:pointer;border:none;border-radius:var(--arbol-radius-s);
             padding:3px 6px;font:500 var(--arbol-type-label)/1.4 var(--arbol-font-mono);
             background:{active ? 'var(--arbol-color-surface-2)' : 'transparent'};
             color:{active ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'}">
      {fileGlyph(n)} {n.name}{n.linked ? ' · linked' : ''}
    </button>
  {/if}
{/snippet}

<div style="display:grid;grid-template-columns:300px 1fr;height:100%;min-height:0">
  <!-- Left: selected repo plus the shared corpus. -->
  <div style="border-right:1px solid var(--arbol-color-border);overflow:auto;padding:var(--arbol-space-3)">
    {#each corpora as corpus (corpus)}
      {@const sharedSection = corpus !== repo}
      <div style="margin:{sharedSection ? 'var(--arbol-space-3) calc(-1 * var(--arbol-space-2)) 0' : '0'};
                  padding:{sharedSection ? 'var(--arbol-space-2)' : '0'};
                  border-radius:{sharedSection ? 'var(--arbol-radius-m)' : '0'};
                  background:{sharedSection ? 'color-mix(in oklch, var(--arbol-color-surface) 55%, transparent)' : 'transparent'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px">
          <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);text-transform:uppercase;letter-spacing:0.5px;
                      color:var(--arbol-color-text-muted)">
            {corpus === SHARED && sharedSection ? `${SHARED} · shared` : `Artifacts · ${corpus}`}
          </div>
          {#if corpus === corpora[0]}
            <button onclick={() => refreshTrees()} disabled={refreshingTrees} title="Refresh from disk"
              style="border:none;background:transparent;color:var(--arbol-color-text-muted);cursor:pointer;padding:2px 4px">
              {refreshingTrees ? '↻' : '⟳'}
            </button>
          {/if}
        </div>
        {#if trees[corpus]}
          {#if trees[corpus].tree.length === 0}
            <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);padding:0 4px">(empty)</div>
          {:else}
            {#each trees[corpus].tree as n (n.path)}{@render treeNode(corpus, n, 0)}{/each}
          {/if}
        {:else if treeErrors[corpus]}
          <div style="color:#e35;font-size:var(--arbol-type-label)">{treeErrors[corpus]}</div>
        {:else}
          <div style="color:var(--arbol-color-text-muted)">Loading…</div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Right: viewer / editor -->
  <div style="min-width:0;overflow:hidden;padding:var(--arbol-space-4) var(--arbol-space-5);display:flex;flex-direction:column">
    {#if !selected}
      <div style="margin:auto;color:var(--arbol-color-text-muted);text-align:center">
        {#if syncNotice}<div style="color:#e35;margin-bottom:6px">{syncNotice}</div>{/if}
        <div>Select an artifact to view.</div>
      </div>
    {:else if loadingDoc}
      <div style="color:var(--arbol-color-text-muted)">Loading {selected.path}…</div>
    {:else}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--arbol-space-3);margin-bottom:8px">
        <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font:500 var(--arbol-type-label)/1.3 var(--arbol-font-mono)">
          {selected.path}
        </div>
        <button type="button" onclick={detachSelected} disabled={detaching} title="Open in a separate Detached View app"
          style="height:28px;padding:0 11px;flex:none;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted);cursor:{detaching ? 'default' : 'pointer'};opacity:{detaching ? 0.6 : 1};font:700 var(--arbol-type-label)/1 var(--arbol-font-ui)">
          {detaching ? 'Detaching…' : 'Detach'}
        </button>
      </div>
      {#if note}<div style="margin-bottom:8px;padding:6px 10px;border-radius:var(--arbol-radius-s);
            background:#2a83;color:#2a8;font-size:var(--arbol-type-label)">{note}</div>{/if}
      {#if error}<div style="margin-bottom:8px;padding:6px 10px;border-radius:var(--arbol-radius-s);
            background:#e3535a22;color:#e35;font-size:var(--arbol-type-label)">{error}</div>{/if}
      {#if selectedLinked}
        <div style="margin-bottom:8px;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
          Linked repository document · read-only here
        </div>
      {/if}
      {#key selected}
        <MarkdownDoc {content} editable={!selectedReadOnly} title={selected.path} docPath={selected.path} {baseDir}
          scrollTo={scrollAnchor} onSave={save} onNavigate={navigate} />
      {/key}
    {/if}
  </div>
</div>


{#if contextMenu}
  <div role="presentation" onmousedown={() => { contextMenu = null }}
    style="position:fixed;inset:0;z-index:90">
    <div role="menu" tabindex="-1" aria-label={`Actions for ${contextMenu.node.name}`} onmousedown={(event) => event.stopPropagation()}
      style="position:fixed;left:{contextMenu.x}px;top:{contextMenu.y}px;width:180px;padding:5px;
             border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
             background:var(--arbol-color-surface-2);box-shadow:0 10px 30px #0005;
             color:var(--arbol-color-text);font:500 var(--arbol-type-label)/1.4 var(--arbol-font-ui)">
      {#if !contextMenu.node.read_only}
        <button role="menuitem" onclick={editName}>Edit name</button>
        <button role="menuitem" class="danger" onclick={removeItem}>Remove</button>
        <div class="context-separator"></div>
      {/if}
      <button role="menuitem" onclick={openInFinder}>Open in Finder</button>
    </div>
  </div>
{/if}

<style>
  [role='menu'] button {
    display: block; width: 100%; padding: 6px 9px; border: 0; border-radius: var(--arbol-radius-s);
    background: transparent; color: inherit; text-align: left; cursor: default; font: inherit;
  }
  [role='menu'] button:hover, [role='menu'] button:focus-visible {
    outline: none; background: var(--arbol-color-accent); color: var(--arbol-color-bg);
  }
  [role='menu'] button.danger { color: #e35; }
  [role='menu'] button.danger:hover, [role='menu'] button.danger:focus-visible { color: white; background: #d34; }
  .context-separator { height: 1px; margin: 4px 5px; background: var(--arbol-color-border); }
</style>
