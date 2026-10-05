<script lang="ts">
  import { RingsMark } from '@arbol/design-system'

  import type { TaskPage } from './types'
  let { page, onSelect }: { page: TaskPage; onSelect: (page: TaskPage) => void } = $props()

  const pages: { id: TaskPage; label: string; sub: string }[] = [
    { id: 'jira', label: 'Jira', sub: 'tickets and delivery items' },
    { id: 'grafts', label: 'Grafts', sub: 'Arbol-native work items' },
    { id: 'merge-requests', label: 'Merge Requests', sub: 'GitLab review work imported by Quick Input' },
  ]
  const selected = $derived(pages.find((item) => item.id === page) ?? pages[0])
</script>

<nav class="task-navigation" aria-label="Tasks pages">
  <div class="task-brief">
    <div class="task-brief-rings">
      <RingsMark size={120} color="var(--arbol-brief-ring)" strokeOpacities={[0.9, 0.7, 0.55, 0.4]} />
    </div>
    <div class="task-brief-brand">
      <RingsMark size={18} color="var(--arbol-brief-pane-fg)" />
      <span>Oaken</span>
    </div>
    <div class="task-brief-title">{selected.label}</div>
    <div class="task-brief-sub">{selected.sub}</div>
  </div>

  <div class="task-nav-tabs">
    {#each pages as item}
      {@const active = item.id === page}
      <button class:active onclick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined}>
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
          <path d="M3 1.8h7.8a1 1 0 0 1 1 1v9.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.25" />
          <path d="M4.2 5h5.4M4.2 7.6h5.4M4.2 10.2h3.4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
        </svg>
        <span>{item.label}</span>
        {#if active}<i></i>{/if}
      </button>
    {/each}
  </div>
</nav>
