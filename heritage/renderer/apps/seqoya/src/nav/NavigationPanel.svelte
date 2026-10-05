<script lang="ts">
  /* Navigation Panel (§3.3): Shell Insignia + vertical nav tabs.
   * (Ported from React; the tabs are inline so each carries its glyph.) */
  import { ShellInsignia } from '@arbol/design-system'
  import SeqoyaGlyph from '../SeqoyaGlyph.svelte'
  import type { PageId } from '../types'

  let { page, onSelect }: { page: PageId; onSelect: (p: PageId) => void } = $props()

  const BRIEFS: Record<PageId, { label: string; sub: string }> = {
    dashboard: { label: 'Seqoya Lab', sub: 'Intelligence Service' },
    'intelligence-providers': { label: 'Intelligence Providers', sub: 'configurations' },
    'quick-text': { label: 'Quick Text', sub: 'single-key text inserts' },
    'brain-recipes': { label: 'Brain Recipes', sub: 'conditional model routing' },
    'feature-toggles': { label: 'Feature Toggles', sub: 'runtime experiments' },
    'living-topics': { label: 'Living Topics', sub: 'durable context hubs' },
    stewardship: { label: 'Stewardship', sub: 'agents, permissions & listeners' },
    blueprints: { label: 'Blueprints', sub: 'typed reusable agent functions' },
    reactions: { label: 'Reactions', sub: 'Signal automations' },
    organizations: { label: 'Organizations', sub: 'repo groups & GitHub' },
    repos: { label: 'Repos', sub: 'Mycel per-repo settings' },
    secrets: { label: 'Secrets', sub: 'PATs & connections' },
    'chunks-viewer': { label: 'Chunks Viewer', sub: 'knowledge artifacts' },
    refresher: { label: 'Refresher', sub: 'freshness & drifts' },
    artifacts: { label: 'Artifacts', sub: 'browse & edit' },
    retrieval: { label: 'Retrieval', sub: 'embeddings & RAPTOR' },
    monitoring: { label: 'Monitoring', sub: 'events & operational logs' },
  }
  const brief = $derived(BRIEFS[page])

  const tabs: { id: PageId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'intelligence-providers', label: 'Intelligence Providers' },
    { id: 'brain-recipes', label: 'Brain Recipes' },
    { id: 'quick-text', label: 'Quick Text' },
    { id: 'feature-toggles', label: 'Feature Toggles' },
    { id: 'living-topics', label: 'Living Topics' },
    { id: 'stewardship', label: 'Stewardship' },
    { id: 'blueprints', label: 'Blueprints' },
    { id: 'reactions', label: 'Reactions' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'repos', label: 'Repos' },
    { id: 'secrets', label: 'Secrets' },
    { id: 'chunks-viewer', label: 'Chunks Viewer' },
    { id: 'refresher', label: 'Refresher' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'retrieval', label: 'Retrieval' },
    { id: 'monitoring', label: 'Monitoring' },
  ]
</script>

{#snippet seqoyaGlyph()}<SeqoyaGlyph />{/snippet}

<div style="display:grid;grid-template-rows:auto minmax(0,1fr);border-right:1px solid var(--arbol-color-border);
            background:var(--arbol-color-bg);min-height:0">
  <ShellInsignia
    ui="Seqoya"
    label={brief.label}
    sub={brief.sub}
    glyph={seqoyaGlyph}
    hue={0}
  />

  <!-- Nav Tabs (vertical) -->
  <div style="display:flex;flex-direction:column;gap:var(--arbol-space-1);padding:var(--arbol-space-2);
              min-height:0;overflow-y:auto">
    {#each tabs as t}
      {@const on = t.id === page}
      <button
        onclick={() => onSelect(t.id)}
        style="display:flex;flex-shrink:0;align-items:center;gap:var(--arbol-space-2);text-align:left;
               background:{on ? 'var(--arbol-color-surface-2)' : 'transparent'};
               color:{on ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'};
               border:1px solid {on ? 'var(--arbol-color-border)' : 'transparent'};
               border-radius:var(--arbol-radius-m);padding:9px var(--arbol-space-3);
               font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);cursor:pointer"
      >
        <span style="opacity:{on ? 1 : 0.7};display:flex">
          {#if t.id === 'dashboard'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="8.5" y="1.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="1.5" y="8.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="8.5" y="8.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
            </svg>
          {:else if t.id === 'intelligence-providers'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M7.5 1.5 13.5 4.5 7.5 7.5 1.5 4.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
              <path d="M1.5 7.7 7.5 10.7 13.5 7.7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
              <path d="M1.5 10.6 7.5 13.6 13.5 10.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
            </svg>
          {:else if t.id === 'brain-recipes'}
            <svg width="15" height="15" viewBox="0 0 15 15"><path d="M2 3.2h7M2 7.5h4.5M2 11.8h7M9 7.5h2.2M11.2 7.5l1.8-2M11.2 7.5l1.8 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {:else if t.id === 'quick-text'}
            <svg width="15" height="15" viewBox="0 0 15 15"><path d="M2 3h11v9H2zM4.2 5.4h6.6M4.2 8h4.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {:else if t.id === 'feature-toggles'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M3 4.1h9M3 10.9h9M5.2 2v4.2M9.8 8.8V13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <circle cx="5.2" cy="4.1" r="1.35" fill="var(--arbol-color-bg)" stroke="currentColor" stroke-width="1.3" />
              <circle cx="9.8" cy="10.9" r="1.35" fill="var(--arbol-color-bg)" stroke="currentColor" stroke-width="1.3" />
            </svg>
          {:else if t.id === 'living-topics'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <circle cx="7.5" cy="7.5" r="5.3" fill="none" stroke="currentColor" stroke-width="1.3" />
              <circle cx="7.5" cy="7.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M7.5 2.2V1M12.8 7.5H14M7.5 12.8V14M2.2 7.5H1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          {:else if t.id === 'stewardship'}
            <svg width="15" height="15" viewBox="0 0 15 15"><circle cx="7.5" cy="4.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.8 13c.4-3 2-4.5 4.7-4.5S11.8 10 12.2 13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          {:else if t.id === 'mandates'}
            <svg width="15" height="15" viewBox="0 0 15 15"><rect x="2.5" y="1.5" width="10" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5h5M5 7.8h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="m8.8 10.6.8.8 1.7-1.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          {:else if t.id === 'reactions'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M2 4.2h4.1M8.9 4.2H13M6.1 4.2a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0ZM2 10.8h4.1M8.9 10.8H13M6.1 10.8a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          {:else if t.id === 'organizations'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <rect x="5.6" y="1.6" width="3.8" height="3.4" rx="0.9" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="1.6" y="10" width="3.8" height="3.4" rx="0.9" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="9.6" y="10" width="3.8" height="3.4" rx="0.9" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M7.5 5v2.2M3.5 10V7.2h8V10" fill="none" stroke="currentColor" stroke-width="1.3" />
            </svg>
          {:else if t.id === 'chunks-viewer'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <rect x="2" y="1.8" width="11" height="11.4" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M4.3 5h6.4M4.3 7.5h6.4M4.3 10h3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          {:else if t.id === 'refresher'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M12.6 7.5a5.1 5.1 0 1 1-1.5-3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <path d="M11.3 1.6v2.6h-2.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {:else if t.id === 'monitoring'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M2.2 2.2h10.6v10.6H2.2zM4.3 5h6.4M4.3 7.5h6.4M4.3 10h4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {:else if t.id === 'retrieval'}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <circle cx="6.4" cy="6.4" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M9.6 9.6l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          {:else}
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M1.8 3.4h3.8l1.1 1.4h6.5v6.4a1 1 0 0 1-1 1H1.8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
            </svg>
          {/if}
        </span>
        <span style="flex:1">{t.label}</span>
        {#if on}<span style="width:4px;height:4px;border-radius:99px;background:var(--arbol-color-accent)"></span>{/if}
      </button>
    {/each}
  </div>
</div>
