<script lang="ts">
  /* Repo Picker (GLOSSARY › Repo Picker): the UIShell-header dropdown selecting
   * which Repo this app's Mycel views are scoped to. Lists only Mycel-enabled
   * repos; empty until first chosen (pages needing a repo stay disabled), then
   * persisted per UI by the App. */
  import { onMount } from 'svelte'
  import { api, type Repo } from '../api'

  let { repo, onSelect }: { repo: string; onSelect: (name: string) => void } = $props()
  let repos = $state<Repo[]>([])

  async function load() {
    try {
      repos = (await api.repos()).filter((r) => r.mycel_enabled)
      // A persisted selection whose repo was since disabled falls back to empty.
      if (repo && !repos.some((r) => r.name === repo)) onSelect('')
    } catch { /* header stays usable; pages show their own errors */ }
  }
  onMount(() => {
    load()
    // The Repos settings page announces flag changes so the picker stays current.
    window.addEventListener('arbol:repos-changed', load)
    return () => window.removeEventListener('arbol:repos-changed', load)
  })
</script>

<select
  value={repo}
  onchange={(e) => onSelect((e.currentTarget as HTMLSelectElement).value)}
  title="Repo — scopes the Mycel pages (Chunks, Refresher, Artifacts, Retrieval)"
  style="font:600 12px/1.2 var(--arbol-font-mono);padding:3px 6px;border-radius:var(--arbol-radius-s);
         background:var(--arbol-color-surface-2);color:{repo ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'};
         border:1px solid var(--arbol-color-border);max-width:160px"
>
  <option value="">repo…</option>
  {#each repos as r (r.name)}<option value={r.name}>{r.name}</option>{/each}
</select>
