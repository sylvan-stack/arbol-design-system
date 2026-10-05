<script lang="ts">
  import { entityLinkTarget, type EntityLinkReference } from '@arbol/design-system'
  import { JIRA_CORPUS } from './jira'
  import { onMount } from 'svelte'
  import { createSwimlaneFromEntity, findAnchorAssignment, loadSwimlanes, type Swimlane, type SwimmerRootEntity } from '../data'
  import SwimlanePickerModal from '../SwimlanePickerModal.svelte'
  import JiraTicketEditModal from './JiraTicketEditModal.svelte'
  import JiraFetchLogs from './JiraFetchLogs.svelte'
  import {
    addJiraFetchLog,
    archiveJiraItem,
    createJiraChat,
    fetchJiraItem,
    fetchMyJiraTickets,
    formatJiraDueDate,
    formatMadridDateTime,
    ignoreJiraItem,
    isCodeReviewJiraItem,
    isMyJiraItem,
    jiraFetchLogSnapshot,
    loadJiraItems,
    rememberJiraFetchLogs,
    type JiraItem,
    type JiraPipelineLog,
    type JiraSection,
  } from './jira'

  let { onViewDetails, onSwimlaneCreated, onSwimmerCreated, onOpenSwimlane, requestedKey = null, requestId = 0 }:
    {
      onViewDetails: (item: JiraItem) => void
      requestedKey?: string | null
      requestId?: number
      onSwimlaneCreated: (label: string) => void
      onSwimmerCreated: (label: string) => void
      onOpenSwimlane: (lane: Swimlane) => void
    } = $props()

  const SECTIONS: { id: JiraSection; label: string; note: string }[] = [
    { id: 'ticket', label: 'Jira tickets', note: 'Stories, bugs, technical work and other Jira issues' },
    { id: 'epic', label: 'Epics', note: 'Larger initiatives and groups of work' },
    { id: 'trc', label: 'TRC tickets', note: 'Compliance and certification work' },
    { id: 'sprint', label: 'Sprints', note: 'Sprint planning items' },
    { id: 'release', label: 'Releases', note: 'Release tracking items' },
  ]

  let items = $state<JiraItem[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let skipped = $state(0)
  let stored = $state(0)
  let converted = $state(0)
  let warnings = $state<string[]>([])
  let query = $state('')
  let onlyMine = $state(false)
  let codeReview = $state(false)
  let showArchived = $state(false)
  let expanded = $state<Record<string, boolean>>({})
  let fetching = $state<Record<string, boolean>>({})
  let fetchingMine = $state(false)
  let ignoring = $state<Record<string, boolean>>({})
  let archiving = $state<Record<string, boolean>>({})
  let chatting = $state<Record<string, boolean>>({})
  let editingItem = $state<JiraItem | null>(null)
  let creatingSwimlane = $state<Record<string, boolean>>({})
  let boardSwimlanes = $state<Swimlane[]>([])
  let actionNotice = $state<string | null>(null)
  let actionError = $state<string | null>(null)
  let swimmerEntity = $state<SwimmerRootEntity | null>(null)
  let fetchLogs = $state<JiraPipelineLog[]>(jiraFetchLogSnapshot())

  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase()
    return items.filter((item) => {
      if (onlyMine && !isMyJiraItem(item)) return false
      if (item.archived !== showArchived) return false
      if (codeReview && !isCodeReviewJiraItem(item)) return false
      if (!needle) return true
      return [
        item.key,
        item.title,
        item.description,
        item.assignee,
        item.status,
        item.jiraStatus,
        item.arbolStatus,
        item.issueType,
      ].some((value) => value.toLocaleLowerCase().includes(needle))
    })
  })

  const sectionCounts = $derived(Object.fromEntries(SECTIONS.map((section) => [
    section.id,
    items.filter((item) => item.section === section.id).length,
  ])) as Record<JiraSection, number>)

  const filteredSectionCounts = $derived(Object.fromEntries(SECTIONS.map((section) => [
    section.id,
    filtered.filter((item) => item.section === section.id).length,
  ])) as Record<JiraSection, number>)

  const filtersActive = $derived(Boolean(query.trim() || onlyMine || codeReview || showArchived))
  const anchorByKey = $derived(new Map(items.map((item) => [
    item.key,
    findAnchorAssignment(boardSwimlanes, { kind: 'ticket', ref: item.key }),
  ])))

  let handledRequestId = $state(-1)
  $effect(() => {
    if (!requestedKey || loading || handledRequestId === requestId) return
    const match = items.find((item) => item.key.toLocaleLowerCase() === requestedKey.toLocaleLowerCase())
    if (match) { handledRequestId = requestId; onViewDetails(match) }
  })

  async function refreshBoard() {
    boardSwimlanes = await loadSwimlanes()
  }

  async function refresh() {
    loading = true
    error = null
    try {
      const result = await loadJiraItems()
      items = result.items
      skipped = result.skipped
      stored = result.stored
      converted = result.converted
      warnings = result.warnings
      // Ticket cards can render as soon as their parsed artifacts are ready.
      // Swimlane markers are supplementary and must not block opening Jira.
      void refreshBoard()
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
    } finally {
      loading = false
    }
  }

  function toggle(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] }
  }

  function initials(name: string): string {
    if (!name || name === 'Unassigned') return '—'
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  }

  function statusTone(item: JiraItem): string {
    const value = `${item.statusCategory} ${item.status}`.toLocaleLowerCase()
    if (/(done|complete|closed|resolved)/.test(value)) return 'done'
    if (/(progress|development|code|review|qa|active)/.test(value)) return 'active'
    if (/(block|reject|cancel)/.test(value)) return 'blocked'
    return 'todo'
  }

  function shownDescription(item: JiraItem): string {
    return item.description || 'No description was included in the stored Jira artifact.'
  }

  function clearFilters() {
    query = ''
    onlyMine = false
    codeReview = false
    showArchived = false
  }

  async function fetchMine() {
    if (fetchingMine) return
    fetchingMine = true
    actionNotice = null
    actionError = null
    try {
      fetchLogs = addJiraFetchLog('start', 'Fetching all Jira tickets assigned to you')
      const result = await fetchMyJiraTickets()
      fetchLogs = rememberJiraFetchLogs(result.logs)
      fetchLogs = addJiraFetchLog('refresh', 'Reloading normalized Jira artifacts')
      await refresh()
      actionNotice = result.failed
        ? `${result.message}; ${result.failed} could not be fetched.`
        : result.message
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
      fetchLogs = addJiraFetchLog('error', actionError, 'error')
    } finally {
      fetchingMine = false
    }
  }


  async function openChat(item: JiraItem) {
    if (chatting[item.key]) return
    chatting = { ...chatting, [item.key]: true }
    actionNotice = null
    actionError = null
    try {
      await createJiraChat(item)
      actionNotice = `New Chat Session opened with ${item.key} attached as a Chat Note.`
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
    } finally {
      chatting = { ...chatting, [item.key]: false }
    }
  }

  function savedOverrides(saved: JiraItem) {
    items = items.map((item) => item.key === saved.key ? saved : item)
    editingItem = null
    actionError = null
    actionNotice = `Overrides for ${saved.key} were saved.`
  }

  async function fetchTicket(item: JiraItem) {
    if (fetching[item.key]) return
    fetching = { ...fetching, [item.key]: true }
    actionNotice = null
    actionError = null
    try {
      fetchLogs = addJiraFetchLog('start', `Fetching ${item.key} from Jira`)
      const result = await fetchJiraItem(item)
      fetchLogs = rememberJiraFetchLogs(result.logs)
      fetchLogs = addJiraFetchLog('refresh', `Reloading normalized artifact for ${item.key}`)
      await refresh()
      actionNotice = result.repository
        ? `${item.key} was fetched from Jira; repository: ${result.repository}.`
        : `${item.key} was fetched, but no repository was detected. Review Fetch & parser logs.`
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
      fetchLogs = addJiraFetchLog('error', actionError, 'error')
    } finally {
      fetching = { ...fetching, [item.key]: false }
    }
  }

  async function ignoreTicket(item: JiraItem) {
    // The shared WKWebView host has no WKUIDelegate confirmation handler, so
    // window.confirm() always resolves as cancelled and prevents the RPC. Ignore
    // directly from this explicit action; only remove the card after persistence.
    if (ignoring[item.key]) return
    ignoring = { ...ignoring, [item.key]: true }
    actionNotice = null
    actionError = null
    try {
      await ignoreJiraItem(item)
      items = items.filter((candidate) => candidate.key !== item.key)
      actionNotice = `${item.key} is now ignored.`
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
    } finally {
      ignoring = { ...ignoring, [item.key]: false }
    }
  }

  async function archiveTicket(item: JiraItem) {
    if (archiving[item.key] || item.archived) return
    archiving = { ...archiving, [item.key]: true }
    actionNotice = null
    actionError = null
    try {
      await archiveJiraItem(item)
      items = items.map((candidate) => candidate.key === item.key ? { ...candidate, archived: true } : candidate)
      actionNotice = `${item.key} was archived; its artifacts are now Heartwood.`
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
    } finally {
      archiving = { ...archiving, [item.key]: false }
    }
  }

  async function createEntitySwimlane(item: JiraItem) {
    if (creatingSwimlane[item.key] || anchorByKey.get(item.key)) return
    creatingSwimlane = { ...creatingSwimlane, [item.key]: true }
    actionNotice = null
    actionError = null
    try {
      await createSwimlaneFromEntity({
        kind: 'ticket',
        ref: item.key,
        title: item.title,
      })
      actionNotice = `Swimlane created from ${item.key}.`
      await refreshBoard()
      onSwimlaneCreated(item.key)
    } catch (value) {
      actionError = value instanceof Error ? value.message : String(value)
    } finally {
      creatingSwimlane = { ...creatingSwimlane, [item.key]: false }
    }
  }

  function chooseSwimlaneFor(item: JiraItem) {
    if (anchorByKey.get(item.key)) return
    swimmerEntity = { kind: 'ticket', ref: item.key, title: item.title }
  }

  function ticketLinkTarget(item: JiraItem): EntityLinkReference {
    return {
      repo: item.repository || 'Any', kind: 'ticket', entityId: item.key, title: `${item.key}: ${item.title}`,
      lookup: { corpus: JIRA_CORPUS, relativePath: item.sourcePath },
    }
  }

  function anchorTitle(item: JiraItem): string {
    const assignment = anchorByKey.get(item.key)
    if (!assignment) return 'Use this ticket as the unique anchor entity for a swimmer'
    return `Already anchors “${assignment.swimmer.nm}” in Swimlane ${assignment.swimlane.n}`
  }

  onMount(refresh)
</script>

<div class="jira-page">
  <header class="jira-page-heading">
    <div>
      <div class="jira-kicker">Tasks · Jira</div>
      <h1>Jira</h1>
      <p>Parsed Jira tickets from <code>~/Artifacts/jira</code>. Opening this page never fetches Jira or reads raw mirrors.</p>
    </div>
    <div class="jira-tools">
      <label>
        <span class="sr-only">Search Jira items</span>
        <input bind:value={query} type="search" placeholder="Search tickets, people, status…" />
      </label>
      <button onclick={fetchMine} disabled={fetchingMine || loading} title="Fetch tickets where you are or were the assignee, then normalize them">
        {fetchingMine ? 'Fetching my tickets…' : 'Fetch my tickets'}
      </button>
      <button onclick={refresh} disabled={loading || fetchingMine}>{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
  </header>

  <div class="jira-action-slot" aria-live="polite">
    {#if actionError}<div class="jira-action-notice error" role="alert">{actionError}<button onclick={() => (actionError = null)} aria-label="Dismiss">×</button></div>
    {:else if actionNotice}<div class="jira-action-notice" role="status">{actionNotice}<button onclick={() => (actionNotice = null)} aria-label="Dismiss">×</button></div>{/if}
  </div>

  <JiraFetchLogs logs={fetchLogs} active={fetchingMine || Object.values(fetching).some(Boolean)} onClear={() => (fetchLogs = [])} />

  {#if error}
    <div class="jira-state error">
      <strong>Could not read Jira Repo Artifacts.</strong>
      <span>{error}</span>
      <button onclick={refresh}>Try again</button>
    </div>
  {:else if loading && items.length === 0}
    <div class="jira-state"><span class="jira-spinner"></span>Reading parsed Jira tickets…</div>
  {:else if items.length === 0}
    <div class="jira-state">
      <strong>No Jira tickets found.</strong>
      <span>Add or fetch a ticket to create its parsed artifact in <code>~/Artifacts/jira</code>.</span>
    </div>
  {:else}
    <div class="jira-filter-bar" aria-label="Jira filters">
      <span class="jira-filter-label">Filters</span>
      <label class="jira-toggle" class:checked={onlyMine} title="Tickets where your Jira identity appears as the current or a previous assignee">
        <input bind:checked={onlyMine} type="checkbox" />
        <span aria-hidden="true"><i></i></span>
        <strong>Only my tickets</strong>
      </label>
      <label class="jira-toggle" class:checked={codeReview} title="Jira is In Code Review or Ready for Code Review, or Arbol status is In Code Review">
        <input bind:checked={codeReview} type="checkbox" />
        <span aria-hidden="true"><i></i></span>
        <strong>Code review</strong>
      </label>
      <label class="jira-toggle" class:checked={showArchived} title="Show only archived tickets. Archived tickets are never fetched again.">
        <input bind:checked={showArchived} type="checkbox" />
        <span aria-hidden="true"><i></i></span>
        <strong>Show archived</strong>
      </label>
      <span class="jira-filter-result">{filtered.length} of {items.length}</span>
      {#if filtersActive}<button class="jira-clear" onclick={clearFilters}>Clear filters</button>{/if}
    </div>

    <div class="jira-summary" aria-label="Jira item summary">
      {#each SECTIONS as section}
        <a href={`#jira-${section.id}`} class:empty={filteredSectionCounts[section.id] === 0}>
          <span>{section.label}</span>
          <strong>{filteredSectionCounts[section.id]}</strong>
          {#if filtersActive}<small>/{sectionCounts[section.id]}</small>{/if}
        </a>
      {/each}
      <span class="jira-skipped">{stored} inner · {converted} normalized imports</span>
      {#if skipped > 0}<span class="jira-skipped">{skipped} unreadable {skipped === 1 ? 'artifact' : 'artifacts'} skipped</span>{/if}
      {#each warnings as warning}<span class="jira-skipped">{warning}</span>{/each}
    </div>

    {#if filtered.length === 0}
      <div class="jira-state jira-no-match">
        <strong>No Jira items match the active filters.</strong>
        <span>Try changing the search or turning off a toggle.</span>
        <button onclick={clearFilters}>Clear filters</button>
      </div>
    {:else}
      {#each SECTIONS as section}
        {@const sectionItems = filtered.filter((item) => item.section === section.id)}
        <section class="jira-section" id={`jira-${section.id}`}>
          <div class="jira-section-heading">
            <div><h2>{section.label}</h2><p>{section.note}</p></div>
            <span>{sectionItems.length}{filtersActive ? ` of ${sectionCounts[section.id]}` : ''}</span>
          </div>

          {#if sectionItems.length > 0}
            <div class="jira-list">
              {#each sectionItems as item (item.key)}
                <article class:expanded={expanded[item.key]} class:archived={item.archived} class="jira-ticket" use:entityLinkTarget={ticketLinkTarget(item)}>
                  <div class="jira-ticket-main">
                    <div class="jira-ticket-id">
                      {#if item.url}
                        <a href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.key} in Jira`}>
                          <span>{item.key}</span><i>↗</i>
                        </a>
                      {:else}
                        <span>{item.key}</span>
                      {/if}
                      <small>{item.issueType}</small>
                      <small class:required={!item.repository}>{item.repository ? `Repo · ${item.repository}` : 'Repo required'}</small>
                      {#if item.archived}<small>Heartwood · Archived</small>{/if}
                    </div>

                    <div class="jira-ticket-copy">
                      <h3>{item.title}</h3>
                      <p class:clamped={!expanded[item.key]}>{shownDescription(item)}</p>
                      {#if item.description.length > 240}
                        <button class="jira-more" onclick={() => toggle(item.key)} aria-expanded={expanded[item.key]}>
                          {expanded[item.key] ? 'Show less' : 'Show description'}
                        </button>
                      {/if}
                    </div>

                    <div class="jira-assignee" title={item.assignee}>
                      <span>{initials(item.assignee)}</span>
                      <div><small>Assignee</small><strong>{item.assignee}</strong></div>
                    </div>

                    <div class="jira-status">
                      <small>{item.arbolStatus ? 'Arbol status' : 'Status'}</small>
                      <span class={statusTone(item)}><i></i>{item.status}</span>
                      {#if item.arbolStatus && item.arbolStatus !== item.jiraStatus}
                        <em title="Status reported by Jira">Jira: {item.jiraStatus}</em>
                      {/if}
                    </div>
                  </div>
                  <footer>
                    <div class="jira-ticket-actions" aria-label={`${item.key} actions`}>
                      <button class="create-swimlane" title={anchorTitle(item)} onclick={() => createEntitySwimlane(item)} disabled={creatingSwimlane[item.key] || !!anchorByKey.get(item.key)}>
                        {creatingSwimlane[item.key] ? 'Creating…' : anchorByKey.get(item.key) ? 'Already anchored' : 'Create swimlane'}
                      </button>
                      <button class="create-swimmer" title={anchorTitle(item)} onclick={() => chooseSwimlaneFor(item)} disabled={creatingSwimlane[item.key] || !!anchorByKey.get(item.key)}>
                        {anchorByKey.get(item.key) ? `Anchored in Swimlane ${anchorByKey.get(item.key)!.swimlane.n}` : 'Create swimmer'}
                      </button>
                      {#if anchorByKey.get(item.key)}
                        <button class="open-swimmer" onclick={() => onOpenSwimlane(anchorByKey.get(item.key)!.swimlane)}>Open swimmer</button>
                      {/if}
                      <button class="primary" onclick={() => openChat(item)} disabled={chatting[item.key]} title={item.repository ? `Open a chat in ${item.repository}` : 'Repository required; use Edit to select one'}>
                        {chatting[item.key] ? 'Opening chat…' : 'Chat'}
                      </button>
                      <button onclick={() => (editingItem = item)}>Edit</button>
                      <button onclick={() => onViewDetails(item)}>View Details</button>
                      <button class="jira-fetch-action" onclick={() => fetchTicket(item)} disabled={item.archived || fetching[item.key] || ignoring[item.key] || archiving[item.key]} title={item.archived ? 'Archived tickets are not fetched' : 'Fetch latest data from Jira'}>
                        {item.archived ? 'Archived' : fetching[item.key] ? 'Fetching…' : 'Fetch'}
                      </button>
                      {#if !item.archived}
                        <button onclick={() => archiveTicket(item)} disabled={archiving[item.key] || fetching[item.key] || ignoring[item.key]}>
                          {archiving[item.key] ? 'Archiving…' : 'Archive'}
                        </button>
                      {/if}
                      <button class="danger" onclick={() => ignoreTicket(item)} disabled={ignoring[item.key] || fetching[item.key] || archiving[item.key]}>
                        {ignoring[item.key] ? 'Ignoring…' : 'Ignore'}
                      </button>
                    </div>
                    {#if item.jiraDueDate}
                      <span class="jira-due-date"><strong>Jira Due Date</strong> {formatJiraDueDate(item.jiraDueDate)}</span>
                    {/if}
                    {#if item.updated}<time datetime={item.updated}>Updated {formatMadridDateTime(item.updated)}</time>{/if}
                  </footer>
                </article>
              {/each}
            </div>
          {:else}
            <div class="jira-section-empty">No matching items in this section.</div>
          {/if}
        </section>
      {/each}
    {/if}
  {/if}
</div>

{#if editingItem}
  <JiraTicketEditModal item={editingItem} onClose={() => (editingItem = null)} onSaved={savedOverrides} />
{/if}

{#if swimmerEntity}
  <SwimlanePickerModal
    entity={swimmerEntity}
    onClose={() => (swimmerEntity = null)}
    onCreated={(lane) => {
      actionNotice = `Swimmer added to ${lane.tkt ?? `Swimlane ${lane.n}`}.`
      void refreshBoard()
      onSwimmerCreated(swimmerEntity?.ref ?? 'entity')
    }}
    onError={(msg) => (actionError = msg)}
    onOpenExisting={onOpenSwimlane}
  />
{/if}
