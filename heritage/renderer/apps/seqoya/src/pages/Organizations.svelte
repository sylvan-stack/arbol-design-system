<script lang="ts">
  /* Organizations (Seqoya Lab): CRUD for the file-configured organizations
   * (~/.mycel/config.toml identity + an Arbol-owned sidecar for the fork flag
   * and ignored/VIP repo lists), each with its member repos listed Mycel-enabled first, then VIP-first
   * and org-wide / per-repo Pull & Push buttons. Repositories of an
   * organization conventionally live in ~/repos/<organization>. */
  import { onMount, tick } from 'svelte'
  import RepoSection from '../components/RepoSection.svelte'
  import '../pages/settingsCrud.css'
  import { api, type GitJobStatus, type Organization, type OrgRepo } from '../api'
  import { runGitJob } from '../gitJob'

  type Draft = { old_name: string; name: string; root: string; url: string; url_kind: 'original' | 'fork'; vip: string[]; ignored: string[] }

  let orgs = $state<Organization[]>([])
  let expandedOrgs = $state<Record<string, boolean>>({})
  let enabledPaths = $state<Set<string>>(new Set())
  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  let editing = $state<Draft | null>(null)
  let nameInput: HTMLInputElement | undefined = $state()
  let pageHeading: HTMLHeadingElement | undefined = $state()
  let rootTouched = $state(false)
  let confirmingDelete = $state<string | null>(null)
  let busyOrg = $state<string | null>(null)   // org-wide git in flight
  let busyRepo = $state<string | null>(null)  // repo path with git in flight
  let progress = $state<GitJobStatus | null>(null)
  let lastJob = $state<GitJobStatus | null>(null)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function load() {
    loading = true; error = null; confirmingDelete = null
    try {
      const [nextOrgs, repos] = await Promise.all([api.organizations.list(), api.repos()])
      orgs = nextOrgs
      enabledPaths = new Set(repos.filter(repo => repo.mycel_enabled).map(repo => repo.path))
    }
    catch (e) { error = msg(e) } finally { loading = false }
  }
  onMount(load)

  async function startCreate() {
    error = null; note = null; confirmingDelete = null
    rootTouched = false
    editing = { old_name: '', name: '', root: '', url: '', url_kind: 'original', vip: [], ignored: [] }
    await tick(); nameInput?.focus()
  }
  async function startEdit(o: Organization) {
    error = null; note = null; confirmingDelete = null
    rootTouched = true  // an existing org keeps its assigned folder
    editing = { old_name: o.name, name: o.name, root: o.root, url: o.url, url_kind: o.url_kind, vip: [...o.vip], ignored: [...o.ignored] }
    await tick(); nameInput?.focus()
  }
  async function closeEditor() {
    editing = null; error = null
    await tick(); pageHeading?.focus()
  }

  // Suggest the ~/repos/<organization> convention while the user types a name,
  // until they explicitly edit the folder field.
  $effect(() => {
    if (!editing || rootTouched) return
    editing.root = editing.name.trim() ? `~/repos/${editing.name.trim()}` : ''
  })

  async function save() {
    if (!editing || saving) return
    saving = true; error = null; note = null
    try {
      await api.organizations.save({
        name: editing.name, root: editing.root, url: editing.url,
        vip: editing.vip, ignored: editing.ignored,
        url_kind: editing.url_kind, old_name: editing.old_name || undefined,
      })
      await closeEditor()
      note = 'Organization saved.'
      await load()
    } catch (e) { error = msg(e) } finally { saving = false }
  }

  async function remove(name: string) {
    if (saving) return
    saving = true; error = null; note = null
    try { await api.organizations.remove(name); confirmingDelete = null; await load() }
    catch (e) { error = msg(e) } finally { saving = false }
  }

  async function toggleRepo(o: Organization, repo: OrgRepo, field: 'vip' | 'ignored') {
    if (busyOrg) return
    busyOrg = o.name; error = null
    const vip = field === 'vip' ? [...o.vip, repo.name] : o.vip.filter((n) => n !== repo.name)
    const ignored = field === 'ignored' ? [...o.ignored, repo.name] : o.ignored.filter((n) => n !== repo.name)
    try {
      await api.organizations.save({
        name: o.name, root: o.root, url: o.url, url_kind: o.url_kind,
        vip, ignored,
      })
      await load()
    } catch (e) { error = msg(e) } finally { busyOrg = null }
  }

  function report(job: GitJobStatus, verb: string) {
    lastJob = job
    if (job.error) { error = job.error; return }
    const failed = job.results.filter((r) => !r.ok)
    if (failed.length) {
      error = `${verb} finished with ${failed.length} failure${failed.length > 1 ? 's' : ''}: ` +
        failed.map((r) => `${r.repo} — ${r.detail.split('\n')[0]}`).join('; ')
    } else {
      const cloned = job.results.filter((r) => r.action === 'clone').length
      note = job.results.length ? `${verb}: ${cloned} cloned, ${job.results.length - cloned} processed.` : `${verb}: no repositories to process.`
    }
  }

  async function git(action: 'pull' | 'push', o: Organization) {
    if (busyOrg || busyRepo) return
    busyOrg = o.name; error = null; note = null
    lastJob = null; progress = null
    try {
      const job = await runGitJob(api.organizations.git(action, { organization: o.name }), (status) => { progress = status })
      await load()
      report(job, `${action} ${o.name}`)
    } catch (e) { error = msg(e) } finally { busyOrg = null; progress = null }
  }

  async function gitRepo(action: 'pull' | 'push', repo: OrgRepo) {
    if (busyOrg || busyRepo) return
    busyRepo = repo.path; error = null; note = null
    try { report(await runGitJob(api.organizations.git(action, { path: repo.path })), `${action} ${repo.name}`) }
    catch (e) { error = msg(e) } finally { busyRepo = null }
  }

  const visible = (o: Organization) => o.repos.filter((r) => !r.ignored)
  const enabledFirst = (a: OrgRepo, b: OrgRepo) => Number(enabledPaths.has(b.path)) - Number(enabledPaths.has(a.path))
  const sortedRepos = (o: Organization) => visible(o).sort((a, b) => enabledFirst(a, b) || Number(b.vip) - Number(a.vip))
  const ignored = (o: Organization) => o.repos.filter((r) => r.ignored).sort(enabledFirst)
  const repoBusy = (repo: OrgRepo) => busyRepo === repo.path

  const cell = 'display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid var(--arbol-color-hairline);font-size:var(--arbol-type-label)'
</script>

<div class="settings-page organizations-page">
  {#if editing}
    <button class="back-link" onclick={closeEditor} disabled={saving}>← Organizations</button>
  {/if}
  <header>
    <div class="page-intro">
      <h2 bind:this={pageHeading} tabindex="-1">{editing ? (editing.old_name ? `Edit ${editing.old_name}` : 'New organization') : 'Organizations'}</h2>
      <p>{editing ? 'Set the local folder and GitHub home for this organization.' : 'Manage your organizations and their local repositories.'}</p>
    </div>
    {#if !editing}
      <div class="header-actions">
        <button onclick={load} disabled={loading}>Reload</button>
        <button class="primary" onclick={startCreate}>New organization</button>
      </div>
    {/if}
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if note}<p class="hint" role="status" style="margin:0 0 12px">{note}</p>{/if}

  {#if progress?.running}<p class="hint" role="status">{progress.current || "Starting…"} · {progress.done}/{progress.total} repositories processed</p>{/if}

  {#if editing}
    <form class="settings-form organization-editor" onsubmit={(e) => { e.preventDefault(); void save() }}>
      <label>Name
        <input bind:this={nameInput} bind:value={editing.name} disabled={saving} placeholder="euro-office" required />
      </label>
      <label>Local organization folder
        <input bind:value={editing.root} disabled={saving} oninput={() => (rootTouched = true)}
               placeholder="~/repos/euro-office" required />
        <span class="field-help">Repositories directly inside this folder appear in the organization. Saving creates the folder if needed.</span>
      </label>
      <label>GitHub organization URL <span class="field-help">Optional</span>
        <input bind:value={editing.url} disabled={saving} placeholder="https://github.com/Euro-Office" />
      </label>
      <label>GitHub link label
        <select bind:value={editing.url_kind} disabled={saving}>
          <option value="original">Original repositories</option>
          <option value="fork">Our forks</option>
        </select>
        <span class="field-help">A manual label for this organization. Arbol does not detect forks from this link or change Git remotes.</span>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary" disabled={saving || !editing.name.trim() || !editing.root.trim()}>
          {saving ? 'Saving…' : editing.old_name ? 'Save changes' : 'Create organization'}
        </button>
        <button type="button" onclick={closeEditor} disabled={saving}>Cancel</button>
      </div>
    </form>
  {:else}
    {#if lastJob && lastJob.results.length > 0}
      <article style="margin-bottom:14px">
        <div class="card-summary">
          <div class="card-title">
            <strong style="text-transform:capitalize">{lastJob.action} — {lastJob.target}</strong>
            <span class="meta">{lastJob.done}/{lastJob.total} repos processed</span>
          </div>
        </div>
        {#each lastJob.results as r (r.repo + r.path)}
          <div style={cell}>
            <span class="badge" data-status={r.ok ? 'active' : 'retired'}>{r.ok ? (r.action === 'clone' ? 'cloned' : 'ok') : 'failed'}</span>
            <strong style="font:600 var(--arbol-type-label) var(--arbol-font-ui)">{r.repo}</strong>
            <span style="color:var(--arbol-color-text-muted);font:10px var(--arbol-font-mono);white-space:pre-wrap">{r.detail}</span>
          </div>
        {/each}
      </article>
    {/if}

    {#if loading}
      <p style="color:var(--arbol-color-text-muted)">Loading…</p>
    {:else if orgs.length === 0}
      <div class="empty">No organizations configured yet — create one to group its repositories.</div>
    {:else}
      <div class="card-list">
        {#each orgs as o (o.name)}
          <RepoSection title={o.name} count={visible(o).length} bind:open={() => expandedOrgs[o.name] ?? false, (value) => { expandedOrgs[o.name] = value }}>
            {#snippet metadata()}
                <span class="meta">
                  <span class="badge organization-label" title="Manually configured GitHub link label">{o.url_kind === 'fork' ? 'fork' : 'original'}</span>
                  {o.root}
                  {#if o.artifact_root}· <span title={o.artifact_root}>Artifacts: {o.artifact_root}</span>{/if}
                  {#if o.url}·<a href={o.url} target="_blank" rel="noreferrer">{o.url}</a>{/if}
                  {ignored(o).length ? ` · ${ignored(o).length} ignored` : ''}
                </span>
            {/snippet}
            {#snippet actions()}
              <div class="card-actions">
                <button onclick={() => git('pull', o)} disabled={busyOrg !== null || busyRepo !== null}
                        title="Pull local repositories (fast-forward only) and clone missing GitHub repositories; ignored repositories are excluded">
                  {busyOrg === o.name ? '…' : 'Pull'}
                </button>
                <button onclick={() => git('push', o)} disabled={busyOrg !== null || busyRepo !== null}
                        title="Push every non-ignored repository">
                  {busyOrg === o.name ? '…' : 'Push'}
                </button>
                <button onclick={() => startEdit(o)}>Edit</button>
                {#if confirmingDelete === o.name}
                  <button class="danger" onclick={() => remove(o.name)} disabled={saving}>Confirm delete</button>
                  <button onclick={() => (confirmingDelete = null)} disabled={saving}>Cancel</button>
                {:else}
                  <button class="danger" onclick={() => (confirmingDelete = o.name)}
                          title="Removes the organization from the catalog; folders and repos on disk are untouched">Delete</button>
                {/if}
              </div>
            {/snippet}

            <div>
              {#if sortedRepos(o).length === 0 && ignored(o).length === 0}
                <div style={cell}><span style="color:var(--arbol-color-text-muted)">No repositories cloned into this folder yet. Pull clones repositories from the configured GitHub organization.</span></div>
              {/if}
              {#each sortedRepos(o) as repo (repo.name)}
                <div style={cell + (repo.vip ? ';background:color-mix(in oklch,var(--arbol-color-accent) 5%,transparent)' : '')}>
                  <button style="cursor:pointer;border:none;background:transparent;padding:0;font-size:14px"
                          title={repo.vip ? 'Remove from VIP repos' : 'Mark as VIP (first within indexing group)'}
                          onclick={() => toggleRepo(o, repo, 'vip')}
                          disabled={busyOrg !== null || busyRepo !== null}
                          aria-pressed={repo.vip}>{repo.vip ? '★' : '☆'}</button>
                  <strong title={repo.artifact_root ? `Artifacts: ${repo.artifact_root}` : undefined} style="font:600 var(--arbol-type-label) var(--arbol-font-ui)">{repo.name}</strong>
                  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font:10px var(--arbol-font-mono)">{repo.path}</span>
                  <button onclick={() => gitRepo('pull', repo)} disabled={busyOrg !== null || busyRepo !== null}>
                    {repoBusy(repo) ? '…' : 'Pull'}
                  </button>
                  <button onclick={() => gitRepo('push', repo)} disabled={busyOrg !== null || busyRepo !== null}>
                    {repoBusy(repo) ? '…' : 'Push'}
                  </button>
                  <button onclick={() => toggleRepo(o, repo, 'ignored')} disabled={busyOrg !== null || busyRepo !== null}
                          title="Exclude this repo from the organization's Pull/Push and the main list">Ignore</button>
                </div>
              {/each}
              {#if ignored(o).length > 0}
                <div style={cell + ';color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.5px;font-size:10px'}>
                  Ignored ({ignored(o).length})
                </div>
                {#each ignored(o) as repo (repo.name)}
                  <div style={cell + ';opacity:0.55'}>
                    <strong style="font:600 var(--arbol-type-label) var(--arbol-font-ui)">{repo.name}</strong>
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px var(--arbol-font-mono)">{repo.path}</span>
                    <button onclick={() => toggleRepo(o, repo, 'ignored')} disabled={busyOrg !== null || busyRepo !== null}>Unignore</button>
                  </div>
                {/each}
              {/if}
            </div>
          </RepoSection>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .organizations-page .page-intro { flex: 1; min-width: 0; }
  .organizations-page .header-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .organizations-page .header-actions button { white-space: nowrap; }
  .organizations-page .back-link { margin-bottom: 16px; padding: 0; border: 0; background: transparent; color: var(--arbol-color-text-muted); }
  .organizations-page .organization-editor { max-width: 720px; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 20px; }
  .organizations-page .organization-editor label { font-size: var(--arbol-type-label); }
  .organizations-page .field-help { line-height: 1.5; }
  .organizations-page .form-actions { padding-top: 16px; border-top: 1px solid var(--arbol-color-border); }
  .organizations-page .meta a { color: var(--arbol-color-accent); overflow-wrap: anywhere; }
  .organizations-page .meta { overflow-wrap: anywhere; }
  .organizations-page .organization-label { color: var(--arbol-color-text-muted); font-size: var(--arbol-type-label); font-weight: 400; }
  @media (max-width: 600px) {
    .organizations-page > header { flex-direction: column; gap: 12px; }
    .organizations-page .header-actions { flex-wrap: wrap; }
  }
</style>
