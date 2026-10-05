<script lang="ts">
  import { addJiraFetchLog, archiveJiraItem, createJiraChat, fetchJiraItem, formatJiraDueDate, formatMadridDateTime, ignoreJiraItem, jiraFetchLogSnapshot, rememberJiraFetchLogs, type JiraItem, type JiraPipelineLog } from './jira'
  import JiraTicketEditModal from './JiraTicketEditModal.svelte'
  import JiraFetchLogs from './JiraFetchLogs.svelte'

  let {
    item,
    onBack,
    onFetched,
    onIgnored,
    onUpdated,
  }: {
    item: JiraItem
    onBack: () => void
    onFetched: (item: JiraItem) => void
    onIgnored: (item: JiraItem) => void
    onUpdated: (item: JiraItem) => void
  } = $props()

  let fetching = $state(false)
  let ignoring = $state(false)
  let archiving = $state(false)
  let chatting = $state(false)
  let editing = $state(false)
  let error = $state<string | null>(null)
  let notice = $state<string | null>(null)
  let fetchLogs = $state<JiraPipelineLog[]>(jiraFetchLogSnapshot())


  async function openChat() {
    if (chatting) return
    chatting = true
    error = null
    notice = null
    try {
      await createJiraChat(item)
      notice = `New Chat Session opened with ${item.key} attached as a Chat Note.`
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
    } finally {
      chatting = false
    }
  }

  function savedOverrides(saved: JiraItem) {
    item = saved
    editing = false
    notice = `Overrides for ${item.key} were saved.`
    error = null
    onUpdated(item)
  }

  async function fetchTicket() {
    if (fetching) return
    fetching = true
    error = null
    notice = null
    try {
      fetchLogs = addJiraFetchLog('start', `Fetching ${item.key} from Jira`)
      const result = await fetchJiraItem(item)
      fetchLogs = rememberJiraFetchLogs(result.logs)
      notice = result.repository
        ? `${item.key} was fetched; repository: ${result.repository}.`
        : `${item.key} was fetched, but no repository was detected. Review Fetch & parser logs.`
      onFetched(item)
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
      fetchLogs = addJiraFetchLog('error', error, 'error')
    } finally {
      fetching = false
    }
  }

  async function archiveTicket() {
    if (archiving || item.archived) return
    archiving = true
    error = null
    notice = null
    try {
      await archiveJiraItem(item)
      item = { ...item, archived: true }
      notice = `${item.key} was archived; its artifacts are now Heartwood.`
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
    } finally {
      archiving = false
    }
  }

  async function ignoreTicket() {
    // Do not use window.confirm(): the shared WKWebView host does not implement
    // JavaScript confirmation panels, so it silently cancels the operation.
    if (ignoring) return
    ignoring = true
    error = null
    notice = null
    try {
      await ignoreJiraItem(item)
      onIgnored(item)
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
      ignoring = false
    }
  }
</script>

<div class="jira-details-page">
  <header class="jira-details-header">
    <button class="jira-details-back" onclick={onBack}>‹ Jira tickets</button>
    <div class="jira-details-heading">
      <div>
        <span class="jira-kicker">Tasks · Jira · Ticket Details</span>
        <h1>{item.key}</h1>
        <p>{item.title}</p>
      </div>
      <div class="jira-details-actions">
        <button class="primary" onclick={openChat} disabled={chatting || fetching || ignoring || archiving} title={item.repository ? `Open a chat in ${item.repository}` : 'Repository required; use Edit to select one'}>{chatting ? 'Opening chat…' : 'Chat'}</button>
        <button onclick={() => (editing = true)} disabled={chatting || fetching || ignoring || archiving}>Edit</button>
        {#if item.url}<a href={item.url} target="_blank" rel="noreferrer">Open in Jira ↗</a>{/if}
        <button class="jira-fetch-action" onclick={fetchTicket} disabled={item.archived || fetching || ignoring || archiving} title={item.archived ? 'Archived tickets are not fetched' : 'Fetch latest data from Jira'}>{item.archived ? 'Archived' : fetching ? 'Fetching…' : 'Fetch'}</button>
        {#if !item.archived}<button onclick={archiveTicket} disabled={archiving || fetching || ignoring}>{archiving ? 'Archiving…' : 'Archive'}</button>{/if}
        <button class="danger" onclick={ignoreTicket} disabled={ignoring || fetching || archiving}>{ignoring ? 'Ignoring…' : 'Ignore'}</button>
      </div>
    </div>
  </header>

  <div class="jira-action-slot" aria-live="polite">
    {#if error}<div class="jira-action-notice error" role="alert">{error}</div>
    {:else if notice}<div class="jira-action-notice" role="status">{notice}</div>{/if}
  </div>

  <JiraFetchLogs logs={fetchLogs} active={fetching} onClear={() => (fetchLogs = [])} />

  <div class="jira-details-grid">
    <main class="jira-details-card">
      <h2>Description</h2>
      <div class="jira-details-description">{item.description || 'No description was included in the stored Jira artifact.'}</div>
    </main>

    <aside class="jira-details-card jira-details-meta">
      <h2>Ticket information</h2>
      <dl>
        <div><dt>Repository</dt><dd>{item.repository ? item.repository : 'Required — use Edit to select one'}</dd></div>
        <div><dt>Type</dt><dd>{item.issueType}</dd></div>
        {#if item.archived}<div><dt>Arbol lifecycle</dt><dd>Archived · Heartwood</dd></div>{/if}
        <div><dt>Assignee</dt><dd>{item.assignee}{#if item.overrides.assignee !== undefined}<small class="jira-original-value">Jira: {item.jiraValues.assignee || 'Empty'}</small>{/if}</dd></div>
        <div><dt>{item.arbolStatus ? 'Arbol status' : 'Status'}</dt><dd>{item.status}{#if item.overrides.jiraStatus !== undefined || item.overrides.arbolStatus !== undefined}<small class="jira-original-value">Jira: {item.jiraValues.jiraStatus || 'Empty'}</small>{/if}</dd></div>
        {#if item.arbolStatus && item.arbolStatus !== item.jiraStatus}<div><dt>Jira status</dt><dd>{item.jiraStatus}</dd></div>{/if}
        {#if item.jiraDueDate}<div><dt>Jira Due Date</dt><dd>{formatJiraDueDate(item.jiraDueDate)}</dd></div>{/if}
        {#if item.updated}<div><dt>Updated</dt><dd><time datetime={item.updated}>{formatMadridDateTime(item.updated)}</time></dd></div>{/if}
        {#if item.url}<div><dt>Jira link</dt><dd><a href={item.url} target="_blank" rel="noreferrer">{item.key} ↗</a></dd></div>{/if}
      </dl>
    </aside>
  </div>

  {#if item.assigneeHistory.length || item.statusHistory.length}
    <section class="jira-details-card jira-details-history">
      <h2>Jira history</h2>
      <div class="jira-history-columns">
        {#if item.assigneeHistory.length}
          <div>
            <h3>Assignee changes</h3>
            <ol>
              {#each item.assigneeHistory as change}
                <li><time datetime={change.at}>{formatMadridDateTime(change.at)}</time><span>{change.from || 'Unassigned'} → {change.to || 'Unassigned'}</span></li>
              {/each}
            </ol>
          </div>
        {/if}
        {#if item.statusHistory.length}
          <div>
            <h3>Status changes</h3>
            <ol>
              {#each item.statusHistory as change}
                <li><time datetime={change.at}>{formatMadridDateTime(change.at)}</time><span>{change.from || 'Unknown'} → {change.to || 'Unknown'}</span></li>
              {/each}
            </ol>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

{#if editing}
  <JiraTicketEditModal {item} onClose={() => (editing = false)} onSaved={savedOverrides} />
{/if}
