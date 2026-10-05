<script lang="ts">
  import TaskNavigation from '../tasks/TaskNavigation.svelte'
  import { callNative, type GraftSource } from '@arbol/design-system'
  import type { Swimlane } from '../data'
  import type { TaskPage } from '../tasks/types'
  import JiraPage from '../tasks/JiraPage.svelte'
  import JiraTicketDetails from '../tasks/JiraTicketDetails.svelte'
  import GraftsPage from '../tasks/GraftsPage.svelte'
  import MergeRequestsPage from '../tasks/MergeRequestsPage.svelte'
  import type { JiraItem } from '../tasks/jira'

  let { onSwimlaneCreated, onSwimmerCreated, onOpenSwimlane, onGraftSaved, requestedPage = null, requestedEntityId = null, requestId = 0, requestedGraftSource = null, onGraftCreateOpened }:
    {
      onSwimlaneCreated: (label: string) => void
      onSwimmerCreated: (label: string) => void
      onOpenSwimlane: (lane: Swimlane) => void
      onGraftSaved: () => void
      requestedPage?: TaskPage | null
      requestedEntityId?: string | null
      requestId?: number
      requestedGraftSource?: GraftSource | null
      onGraftCreateOpened: () => void
    } = $props()

  let page = $state<TaskPage>('jira')
  let selectedTicket = $state<JiraItem | null>(null)
  let listVersion = $state(0)

  $effect(() => { void callNative('app.consumeOpen', { page }).catch(() => {}) })

  function selectPage(selected: TaskPage) {
    page = selected
    selectedTicket = null
  }

  // Native deep links (including Quick Input imports) arrive at the Oaken
  // shell. Keep navigation ownership here so an MR opens its task surface
  // rather than being treated as a generic Artifact.
  $effect(() => {
    // requestId makes repeated deep links to the same page actionable after the
    // user has navigated elsewhere inside Tasks.
    requestId
    if (requestedPage) selectPage(requestedPage)
  })

  function fetchedFromDetails() {
    // Return to the list so it can reload and show normalized latest data.
    listVersion += 1
    selectedTicket = null
  }

  function ignoredFromDetails() {
    listVersion += 1
    selectedTicket = null
  }
</script>

<div class="tasks-shell">
  <TaskNavigation {page} onSelect={selectPage} />
  <main class="tasks-content">
    {#if page === 'jira' && selectedTicket}
      <JiraTicketDetails
        item={selectedTicket}
        onBack={() => (selectedTicket = null)}
        onFetched={fetchedFromDetails}
        onIgnored={ignoredFromDetails}
        onUpdated={(item) => (selectedTicket = item)}
      />
    {:else if page === 'jira'}
      {#key listVersion}<JiraPage onViewDetails={(item) => (selectedTicket = item)} requestedKey={requestedPage === 'jira' ? requestedEntityId : null} {requestId} {onSwimlaneCreated} {onSwimmerCreated} {onOpenSwimlane} />{/key}
    {:else if page === 'grafts'}
      <GraftsPage {onSwimlaneCreated} {onSwimmerCreated} {onOpenSwimlane} {onGraftSaved} createSource={requestedGraftSource} createRequestId={requestId} onCreateRequestHandled={onGraftCreateOpened} />
    {:else if page === 'merge-requests'}
      <MergeRequestsPage requestedId={requestedPage === 'merge-requests' ? requestedEntityId : null} {requestId} />
    {/if}
  </main>
</div>
