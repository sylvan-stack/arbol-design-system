<script lang="ts">
  /* Repos (Seqoya Lab): Mycel per-repo settings — control which of the ~/repo
   * repos participate in Mycel. The enable toggle gates watching / ingesting /
   * embedding and Repo Picker membership; the embedder profile decides which
   * embedding model the repo's chunks use (voyage = external API — never for
   * company code; local = planned, keeps the repo ingestable but unembedded). */
  import { onMount } from 'svelte'
  import RepoSection from '../components/RepoSection.svelte'
  import { api, type Repo, type Organization } from '../api'
  import { runGitJob } from '../gitJob'

  let cloneOpen = $state(false)
  let cloneUrl = $state('')
  let cloning = $state(false)
  let cloneError = $state<string | null>(null)

  function openClone() {
    cloneUrl = ''; cloneError = null; cloneOpen = true
  }

  async function cloneRepo() {
    if (cloning || !cloneUrl.trim()) return
    cloning = true; cloneError = null
    try {
      const job = await runGitJob(api.cloneRepo(cloneUrl.trim()))
      const result = job.results[0]
      if (job.error || !result?.ok) {
        cloneError = job.error || result?.detail || 'The repository could not be cloned.'
        return
      }
      cloneOpen = false
      note = `Cloned ${result.repo} to ${result.path}.`
      await load(false)
      announce()
    } catch (e) { cloneError = msg(e) } finally { cloning = false }
  }

  function showDialog(node: HTMLDialogElement) { node.showModal() }

  let repos = $state<Repo[]>([])
  let organizations = $state<Organization[]>([])
  let expanded = $state<Record<string, boolean>>({})
  const groups = $derived.by(() => {
    const membership = new Map(organizations.flatMap(org => org.repos.map(repo => [repo.path, org.name] as const)))
    const sections = organizations.map(org => ({ key: `org:${org.name}`, name: org.name, repos: [] as Repo[] }))
    const unassigned: Repo[] = []
    const byName = new Map(sections.map(section => [section.name, section]))
    for (const repo of [...repos].sort((a, b) => Number(!!b.mycel_enabled) - Number(!!a.mycel_enabled))) {
      const organization = membership.get(repo.path)
      const section = organization === undefined ? undefined : byName.get(organization)
      if (section) section.repos.push(repo)
      else unassigned.push(repo)
    }
    return { sections, unassigned }
  })
  let loading = $state(true)
  let busy = $state<string | null>(null)  // repo name being saved
  let gitBusy = $state<string | null>(null)  // repo path with pull/push in flight
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function load(showLoading = true) {
    if (showLoading) loading = true; error = null
    try {
      const [nextRepos, nextOrganizations] = await Promise.all([api.repos(), api.organizations.list()])
      repos = nextRepos
      organizations = nextOrganizations
    } catch (e) { error = msg(e) } finally { loading = false }
  }
  onMount(() => load())

  function announce() { window.dispatchEvent(new Event('arbol:repos-changed')) }

  async function toggle(r: Repo) {
    if (busy !== null) return
    const enabling = !r.mycel_enabled
    busy = r.name; error = null
    try { await api.setMycel(r.name, { mycel_enabled: enabling }); await load(false); announce() }
    catch (e) { error = msg(e) } finally { busy = null }
  }

  async function setProfile(r: Repo, profile: string) {
    if (busy !== null) return
    busy = r.name; error = null
    try { await api.setMycel(r.name, { embedder_profile: profile }); await load(false); announce() }
    catch (e) { error = msg(e) } finally { busy = null }
  }

  // Each repo uses the same Git job API as the Organizations page.
  async function git(r: Repo, action: 'pull' | 'push') {
    if (gitBusy !== null) return
    gitBusy = r.path; error = null; note = null
    try {
      const job = await runGitJob(api.organizations.git(action, { path: r.path }))
      if (job.error) { error = job.error; return }
      const failed = job.results.filter((res) => !res.ok)
      if (failed.length) error = `${action} ${r.name} failed: ${failed.map((f) => f.detail.split('\n')[0]).join('; ')}`
      else note = `${action} ${r.name}: done.`
    } catch (e) { error = msg(e) } finally { gitBusy = null }
  }

  const cell = 'padding:8px 10px;border-bottom:1px solid var(--arbol-color-hairline);vertical-align:middle'
  const chip = 'font:600 10px/1 var(--arbol-font-mono);padding:2px 6px;border-radius:5px'
</script>

{#snippet repoTable(rows: Repo[], label: string)}
    <!-- Keyboard focus lets users scroll this overflow region with arrow keys. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-scroll" role="region" aria-label={label} tabindex="0">
    <table style="width:100%;border-collapse:collapse;font-size:var(--arbol-type-label)">
      <thead>
        <tr style="text-align:left;color:var(--arbol-color-text-muted);font:600 11px/1 var(--arbol-font-ui);text-transform:uppercase;letter-spacing:0.5px">
          <th style={cell}>Repo</th>
          <th style={cell}>Corpora</th>
          <th style={cell}>Embedder profile</th>
          <th style={cell}>Git</th>
          <th style={cell}>Mycel indexing</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr>
            <td style={cell}>
              <div style="font:600 13px/1.3 var(--arbol-font-mono)">{r.name}
              </div>
              <div style="color:var(--arbol-color-text-muted);font-size:11px">{r.path}</div>

            </td>
            <td style={cell}>
              <div class="corpora">
                <span style={chip + ';background:#2a8f6a33;color:#39b58a'}>code</span>
                {#if r.has_artifacts}
                  <span style={chip + ';background:#6a5acd33;color:#8a7be8'}>artifacts</span>
                {:else}
                  <span style={chip + ';background:transparent;color:var(--arbol-color-text-muted);border:1px dashed var(--arbol-color-hairline)'}
                        title={r.artifact_root ? `No artifact folder at ${r.artifact_root}` : 'No Artifact Corpus folder'}>no artifacts</span>
                {/if}
              </div>
            </td>
            <td style={cell}>
              <select aria-label={`Embedder profile for ${r.name}`} value={r.embedder_profile || 'voyage'} disabled={busy !== null}
                      onchange={(e) => setProfile(r, (e.currentTarget as HTMLSelectElement).value)}
                      style="font:12px/1.2 var(--arbol-font-mono);padding:3px 6px;border-radius:var(--arbol-radius-s);
                             background:var(--arbol-color-surface-2);color:var(--arbol-color-text);border:1px solid var(--arbol-color-border)">
                <option value="voyage">voyage (external API)</option>
                <option value="local">local (on-device model)</option>
              </select>
            </td>
            <td style={cell}>
              <div class="actions">
                <button onclick={() => git(r, 'pull')} disabled={gitBusy !== null}
                        title="git pull --ff-only"
                        style="cursor:pointer;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
                               padding:4px 10px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui);
                               background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">
                  {gitBusy === r.path ? '…' : 'Pull'}
                </button>
                <button onclick={() => git(r, 'push')} disabled={gitBusy !== null}
                        title="git push"
                        style="cursor:pointer;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
                               padding:4px 10px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui);
                               background:var(--arbol-color-surface-2);color:var(--arbol-color-text)">
                  {gitBusy === r.path ? '…' : 'Push'}
                </button>
              </div>
            </td>
            <td style={cell}>
              <div class="actions">
                <button class="indexing-switch" type="button" role="switch"
                        aria-checked={r.mycel_enabled}
                        aria-label={`Mycel indexing for ${r.name}`}
                        aria-busy={busy === r.name}
                        onclick={() => toggle(r)} disabled={busy !== null}>
                  <span class="switch-thumb" aria-hidden="true"></span>
                </button>
                <span class="status" aria-live="polite">{busy === r.name ? 'Saving…' : r.mycel_enabled ? 'On' : 'Off'}</span>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    </div>
{/snippet}

<div style="padding:var(--arbol-space-4) var(--arbol-space-5) 64px;min-width:0">
  <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin-bottom:4px">
    <h1 style="font-size:var(--arbol-type-title);font-weight:700;margin:0">Repos</h1>
    <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
      repository intelligence and retrieval settings
    </span>
    <button class="clone-button" onclick={openClone} disabled={cloning}>Clone new repo</button>
    <button onclick={() => load()} disabled={loading || busy !== null} style="cursor:pointer;background:var(--arbol-color-surface-2);
            color:var(--arbol-color-text);border:1px solid var(--arbol-color-border);
            border-radius:var(--arbol-radius-s);padding:5px 12px;font:500 var(--arbol-type-label)/1 var(--arbol-font-ui)">Reload</button>
  </div>

  {#if error}<p style="color:var(--arbol-color-danger,#e35)">{error}</p>{/if}
  {#if note}<p style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">{note}</p>{/if}

  {#if loading}
    <p style="color:var(--arbol-color-text-muted)">Loading…</p>
  {:else}
    <div class="repo-sections">
    {#each groups.sections as group (group.key)}
    <RepoSection title={group.name} count={group.repos.length} bind:open={() => expanded[group.key] ?? false, (value) => { expanded[group.key] = value }}>
      {#if group.repos.length === 0}
        <p class="empty-section">No repositories in this organization.</p>
      {:else}
        {@render repoTable(group.repos, `Repository settings for ${group.name}`)}
      {/if}
    </RepoSection>
    {/each}
    {#if groups.unassigned.length}
      <div class="unassigned-repos">
        {@render repoTable(groups.unassigned, 'Repository settings for unassigned repositories')}
      </div>
    {:else if groups.sections.length === 0}
      <p style="color:var(--arbol-color-text-muted)">No repositories found.</p>
    {/if}
    </div>
    <p style="color:var(--arbol-color-text-muted);font-size:11px;margin-top:12px">
      Enabling a repo starts ingest/embed on the next Sync Pass; file-watching for a newly
      enabled repo begins after the next Core restart. The <strong>voyage</strong> profile sends source code
      and documents to the external Voyage API. A repo with the <strong>local</strong> profile is
      never sent to the Voyage API — its chunks embed on-device (Qwen3-Embedding-0.6B, downloadable on
      the Retrieval page); until the model is downloaded they stay unembedded and BM25/keyword
      search still works.
    </p>
  {/if}
</div>

{#if cloneOpen}
  <dialog class="clone-dialog" use:showDialog aria-labelledby="clone-title"
          oncancel={(event) => { if (cloning) event.preventDefault(); else cloneOpen = false }}>
    <form onsubmit={(event) => { event.preventDefault(); void cloneRepo() }} aria-busy={cloning}>
      <h2 id="clone-title">Clone new repo</h2>
      <p>The repository will be cloned into <code>~/repos</code>, using its repository name as the folder name.</p>
      <label for="clone-url">Repository URL</label>
      <input id="clone-url" bind:value={cloneUrl} disabled={cloning} required
             placeholder="https://github.com/owner/repo.git" autocomplete="off" spellcheck="false" />
      <p class="clone-hint">HTTPS and SSH clone URLs are supported.</p>
      {#if cloneError}<p class="clone-error" role="alert">{cloneError}</p>{/if}
      {#if cloning}<p role="status">Cloning repository…</p>{/if}
      <div class="clone-actions">
        <button type="button" onclick={() => cloneOpen = false} disabled={cloning}>Cancel</button>
        <button type="submit" disabled={cloning || !cloneUrl.trim()}>{cloning ? 'Cloning…' : 'Clone'}</button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .clone-button { margin-left: auto; }
  .clone-button, .clone-actions button { padding: 7px 12px; border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-s); background: var(--arbol-color-surface-2); color: var(--arbol-color-text); font: 500 var(--arbol-type-label)/1 var(--arbol-font-ui); cursor: pointer; }
  .clone-button, .clone-actions button[type="submit"] { background: var(--arbol-color-accent); color: var(--arbol-color-accent-ink, #fff); }
  .clone-dialog { width: 480px; max-width: calc(100vw - 48px); box-sizing: border-box; padding: var(--arbol-space-5); border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-l); background: var(--arbol-color-surface); color: var(--arbol-color-text); box-shadow: var(--arbol-shadow-pop); }
  .clone-dialog::backdrop { background: #0008; backdrop-filter: blur(3px); }
  .clone-dialog h2 { margin-top: 0; font-size: var(--arbol-type-title); }
  .clone-dialog p { font-size: var(--arbol-type-label); line-height: 1.5; overflow-wrap: anywhere; }
  .clone-dialog label { display: block; margin-bottom: 8px; font-weight: 600; }
  .clone-dialog input { box-sizing: border-box; width: 100%; padding: 9px; border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-s); background: var(--arbol-color-surface-2); color: var(--arbol-color-text); font: inherit; }
  .clone-hint { color: var(--arbol-color-text-muted); }
  .clone-error { color: var(--arbol-color-danger, #e35); white-space: pre-wrap; }
  .clone-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

  .repo-sections { display: grid; gap: 10px; margin-top: 12px; }
  .empty-section { padding: 0 14px; color: var(--arbol-color-text-muted); font-size: var(--arbol-type-label); }
  .table-scroll { overflow-x: auto; }
  table { min-width: 850px; }
  th { white-space: nowrap; }
  td:first-child { width: 100%; min-width: 200px; overflow-wrap: anywhere; }
  .corpora { display: flex; flex-wrap: wrap; gap: 5px; min-width: 100px; }
  .corpora span { white-space: nowrap; }
  .actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .actions button { min-height: 30px; }
  .status { min-width: 24px; color: var(--arbol-color-text-muted); font-size: 11px; }
  .actions .indexing-switch { position: relative; flex: 0 0 44px; width: 44px; height: 26px; min-height: 26px; padding: 0; border: 1px solid var(--arbol-color-border); border-radius: 999px; background: var(--arbol-color-surface-2); cursor: pointer; }
  .indexing-switch[aria-checked="true"] { background: var(--arbol-color-accent); border-color: var(--arbol-color-accent); }
  .switch-thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--arbol-color-text); }
  .indexing-switch[aria-checked="true"] .switch-thumb { left: 21px; background: var(--arbol-color-accent-ink, #fff); }
  select { width: 205px; min-height: 30px; }
  button:disabled, select:disabled { opacity: 0.55; cursor: default !important; }
  button:focus-visible, select:focus-visible, .table-scroll:focus-visible { outline: 2px solid var(--arbol-color-accent); outline-offset: 2px; }
</style>
