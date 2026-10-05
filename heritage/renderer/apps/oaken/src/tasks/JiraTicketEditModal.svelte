<script lang="ts">
  import { onMount } from 'svelte'
  import { editableJiraFields, loadJiraRepositories, saveJiraOverrides, type JiraEditableFields, type JiraItem, type JiraRepository, type JiraSection } from './jira'

  let { item, onClose, onSaved }: {
    item: JiraItem
    onClose: () => void
    onSaved: (item: JiraItem) => void
  } = $props()

  const initialDraft = editableJiraFields(item)
  let draft = $state<JiraEditableFields>({ ...initialDraft })
  let saving = $state(false)
  let error = $state<string | null>(null)
  let repositories = $state<JiraRepository[]>([])
  let loadingRepositories = $state(true)

  onMount(async () => {
    try { repositories = await loadJiraRepositories() }
    catch (value) { error = value instanceof Error ? value.message : String(value) }
    finally { loadingRepositories = false }
  })

  const fields: { key: keyof JiraEditableFields; label: string; kind?: 'textarea' | 'select' | 'url' | 'repository' }[] = [
    { key: 'repository', label: 'Repository', kind: 'repository' },
    { key: 'title', label: 'Summary' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'jiraStatus', label: 'Jira status' },
    { key: 'arbolStatus', label: 'Arbol status' },
    { key: 'statusCategory', label: 'Status category' },
    { key: 'issueType', label: 'Issue type' },
    { key: 'jiraDueDate', label: 'Jira due date' },
    { key: 'updated', label: 'Updated timestamp' },
    { key: 'url', label: 'Jira URL', kind: 'url' },
    { key: 'section', label: 'Tasks section', kind: 'select' },
  ]

  function setField(key: keyof JiraEditableFields, value: string) {
    draft = { ...draft, [key]: value }
  }

  function changed(key: keyof JiraEditableFields): boolean {
    return draft[key] !== item.jiraValues[key]
  }

  async function save() {
    if (saving) return
    saving = true
    error = null
    try {
      onSaved(await saveJiraOverrides(item, draft))
    } catch (value) {
      error = value instanceof Error ? value.message : String(value)
      saving = false
    }
  }

  function backdrop(event: MouseEvent) {
    if (event.target === event.currentTarget && !saving) onClose()
  }
</script>

<div class="jira-edit-backdrop" role="presentation" onclick={backdrop}>
  <div class="jira-edit-modal" role="dialog" aria-modal="true" aria-labelledby="jira-edit-title">
    <header>
      <div>
        <div class="jira-kicker">Normalized ticket · {item.key}</div>
        <h2 id="jira-edit-title">Edit ticket fields</h2>
        <p>Your values take priority over future Jira fetches. The latest Jira value remains visible under every field.</p>
      </div>
      <button class="jira-edit-close" type="button" onclick={onClose} disabled={saving} aria-label="Close">×</button>
    </header>

    {#if error}<div class="jira-action-notice error" role="alert">{error}</div>{/if}

    <div class="jira-edit-fields">
      {#each fields as field}
        <label class:overridden={changed(field.key)}>
          <span class="jira-edit-label">{field.label}{#if changed(field.key)}<i>User override</i>{/if}</span>
          {#if field.kind === 'textarea'}
            <textarea rows="7" value={draft[field.key]} oninput={(event) => setField(field.key, event.currentTarget.value)}></textarea>
          {:else if field.kind === 'repository'}
            <select required value={draft.repository} disabled={loadingRepositories} onchange={(event) => setField('repository', event.currentTarget.value)}>
              <option value="">{loadingRepositories ? 'Loading repositories…' : 'Select a repository…'}</option>
              {#each repositories as repository}<option value={repository.name}>{repository.name} — {repository.path}</option>{/each}
            </select>
          {:else if field.kind === 'select'}
            <select value={draft.section} onchange={(event) => setField('section', event.currentTarget.value as JiraSection)}>
              <option value="ticket">Jira tickets</option><option value="epic">Epics</option><option value="trc">TRC tickets</option><option value="sprint">Sprints</option><option value="release">Releases</option>
            </select>
          {:else}
            <input type={field.kind === 'url' ? 'url' : 'text'} value={draft[field.key]} oninput={(event) => setField(field.key, event.currentTarget.value)} />
          {/if}
          <span class="jira-edit-source"><b>Latest Jira value</b><span>{field.key === 'repository' ? 'Not provided by Jira' : item.jiraValues[field.key] || 'Empty'}</span></span>
        </label>
      {/each}
    </div>

    <footer>
      <span>{Object.keys(item.overrides).length ? `${Object.keys(item.overrides).length} saved override(s)` : 'No saved overrides'}</span>
      <button type="button" onclick={onClose} disabled={saving}>Cancel</button>
      <button class="primary" type="button" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save overrides'}</button>
    </footer>
  </div>
</div>
