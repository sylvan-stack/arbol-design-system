<script lang="ts">
  /* Seqoya Lab root (Svelte 5; ux-ui-guide §3). Navigation Panel | Seqoya Page,
   * persisted theme, ⌘K command palette. */
  import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, UIShell, callNative } from '@arbol/design-system'
  import NavigationPanel from './nav/NavigationPanel.svelte'
  import SeqoyaGlyph from './SeqoyaGlyph.svelte'
  import RepoPicker from './nav/RepoPicker.svelte'
  import Dashboard from './pages/Dashboard.svelte'
  import IntelligenceProviders from './pages/IntelligenceProviders.svelte'
  import BrainRecipes from './pages/BrainRecipes.svelte'
  import QuickText from './pages/QuickText.svelte'
  import Repos from './pages/Repos.svelte'
  import Organizations from './pages/Organizations.svelte'
  import Reactions from './pages/Reactions.svelte'
  import FeatureToggles from './pages/FeatureToggles.svelte'
  import LivingTopics from './pages/LivingTopics.svelte'
  import Stewardship from './pages/Stewardship.svelte'
  import Blueprints from './pages/Blueprints.svelte'
  import Secrets from './pages/Secrets.svelte'
  import ChunksViewer from './pages/ChunksViewer.svelte'
  import Refresher from './pages/Refresher.svelte'
  import Artifacts from './pages/Artifacts.svelte'
  import Retrieval from './pages/Retrieval.svelte'
  import Monitoring from './pages/Monitoring.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import type { PageId, PaletteAction } from './types'

  let page = $state<PageId>('intelligence-providers')
  let theme = $state(localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME)
  // Repo Picker selection: empty on first run ever (Mycel pages disabled until
  // chosen), then persisted per UI (this key is Seqoya's own).
  const REPO_KEY = 'arbol.seqoya.repo'
  let repo = $state(localStorage.getItem(REPO_KEY) ?? '')
  $effect(() => { localStorage.setItem(REPO_KEY, repo) })
  let paletteOpen = $state(false)
  let artifactOpen = $state<{ corpus: string; path: string } | null>(null)

  type OpenPayload = { page?: string; repo?: string; corpus?: string; path?: string; living_topic_id?: string }
  const pageIds: PageId[] = ['dashboard', 'intelligence-providers', 'brain-recipes', 'quick-text', 'feature-toggles', 'living-topics', 'stewardship', 'blueprints', 'reactions', 'organizations', 'repos', 'secrets', 'chunks-viewer', 'refresher', 'artifacts', 'retrieval', 'monitoring']
  function acceptOpen(payload: OpenPayload | null | undefined) {
    if (payload?.page === 'living-topics') {
      ;(window as unknown as { __arbolPendingOpen?: OpenPayload }).__arbolPendingOpen = payload
      page = 'living-topics'
      void callNative('app.consumeOpen', { page: 'living-topics' }).catch(() => {})
      return true
    }
    if (payload?.page !== 'artifacts' || !payload.path) {
      if (payload?.page && pageIds.includes(payload.page as PageId)) {
        page = payload.page as PageId
        void callNative('app.consumeOpen', { page: payload.page }).catch(() => {})
        return true
      }
      return false
    }
    const corpus = payload.corpus || payload.repo || ''
    if (!corpus) return false
    repo = payload.repo || corpus
    artifactOpen = { corpus, path: payload.path }
    page = 'artifacts'
    // The host keeps running-app handoffs durable until the target acknowledges.
    void callNative('app.consumeOpen', { path: payload.path }).catch(() => {})
    return true
  }

  // Initial launch payload and subsequent cross-process app.open handoffs.
  try {
    const raw = new URLSearchParams(location.search).get('open')
    if (raw) acceptOpen(JSON.parse(raw) as OpenPayload)
  } catch { /* malformed one-shot payload: ignore */ }
  $effect(() => {
    const onOpen = (event: Event) => acceptOpen((event as CustomEvent<OpenPayload>).detail)
    window.addEventListener('arbol-open', onOpen)
    return () => window.removeEventListener('arbol-open', onOpen)
  })

  $effect(() => { void callNative('app.consumeOpen', { page }).catch(() => {}) })
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  })
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen = !paletteOpen }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const paletteActions = $derived<PaletteAction[]>([
    { label: 'Go to Intelligence Providers', hint: 'tab', run: () => (page = 'intelligence-providers') },
    { label: 'Go to Quick Text', hint: 'tab', run: () => (page = 'quick-text') },
    { label: 'Go to Brain Recipes', hint: 'tab', run: () => (page = 'brain-recipes') },
    { label: 'Go to Dashboard', hint: 'tab', run: () => (page = 'dashboard') },
    { label: 'Go to Feature Toggles', hint: 'tab', run: () => (page = 'feature-toggles') },
    { label: 'Go to Living Topics', hint: 'tab', run: () => (page = 'living-topics') },
    { label: 'Go to Stewardship', hint: 'tab', run: () => (page = 'stewardship') },
    { label: 'Go to Blueprints', hint: 'tab', run: () => (page = 'blueprints') },
    { label: 'Go to Reactions', hint: 'tab', run: () => (page = 'reactions') },
    { label: 'Go to Organizations', hint: 'tab', run: () => (page = 'organizations') },
    { label: 'Go to Repos', hint: 'tab', run: () => (page = 'repos') },
    { label: 'Go to Secrets', hint: 'tab', run: () => (page = 'secrets') },
    { label: 'Go to Chunks Viewer', hint: 'tab', run: () => (page = 'chunks-viewer') },
    { label: 'Go to Refresher', hint: 'tab', run: () => (page = 'refresher') },
    { label: 'Go to Artifacts', hint: 'tab', run: () => (page = 'artifacts') },
    { label: 'Go to Retrieval', hint: 'tab', run: () => (page = 'retrieval') },
    { label: 'Go to Monitoring', hint: 'tab', run: () => (page = 'monitoring') },
    ...THEMES.map((t) => ({ label: `Theme: ${t.name}`, hint: 'schema', run: () => (theme = t.id) })),
  ])
</script>

{#snippet labGlyph()}<SeqoyaGlyph />{/snippet}

{#snippet repoPicker()}
  <RepoPicker {repo} onSelect={(name) => (repo = name)} />
{/snippet}

<UIShell title="Seqoya Lab" headerGlyph={labGlyph} headerExtras={repoPicker} {theme} onTheme={(id) => (theme = id)}>
  <div style="display:grid;grid-template-columns:var(--arbol-navigation-panel-width) 1fr;height:100%">
    <NavigationPanel {page} onSelect={(p) => (page = p)} />
    <div style="min-width:0;overflow:auto">
      {#if page === 'dashboard'}
        <Dashboard onGo={() => (page = 'intelligence-providers')} />
      {:else if page === 'brain-recipes'}
        <BrainRecipes />
      {:else if page === 'quick-text'}
        <QuickText />
      {:else if page === 'monitoring'}
        <Monitoring />
      {:else if page === 'feature-toggles'}
        <FeatureToggles />
      {:else if page === 'living-topics'}
        <LivingTopics />
      {:else if page === 'stewardship'}
        <Stewardship />
      {:else if page === 'blueprints'}
        <Blueprints />
      {:else if page === 'reactions'}
        <Reactions />
      {:else if page === 'organizations'}
        <Organizations />
      {:else if page === 'repos'}
        <Repos />
      {:else if page === 'secrets'}
        <Secrets />
      {:else if page === 'chunks-viewer' || page === 'refresher' || page === 'artifacts' || page === 'retrieval'}
        {#if !repo}
          <!-- Mycel pages need a repo; the Picker is empty until first chosen. -->
          <div style="display:grid;place-items:center;height:100%;color:var(--arbol-color-text-muted)">
            <div style="text-align:center">
              <div style="font:600 var(--arbol-type-body)/1.4 var(--arbol-font-ui)">Select a repo</div>
              <div style="font-size:var(--arbol-type-label);margin-top:4px">This page is scoped to one repo — pick it in the header.</div>
            </div>
          </div>
        {:else}
          {#key repo}
            {#if page === 'chunks-viewer'}
              <ChunksViewer {repo} />
            {:else if page === 'refresher'}
              <Refresher {repo} />
            {:else if page === 'artifacts'}
              <Artifacts {repo} openTarget={artifactOpen} />
            {:else}
              <Retrieval {repo} onSecrets={() => (page = 'secrets')} />
            {/if}
          {/key}
        {/if}
      {:else}
        <IntelligenceProviders />
      {/if}
    </div>
  </div>
</UIShell>

<CommandPalette open={paletteOpen} onClose={() => (paletteOpen = false)} actions={paletteActions} />
