<script lang="ts">
  import { api, type KnActivity } from '../api'
  let { activity }: { activity: KnActivity } = $props()
  let linkError = $state<string | null>(null)
  type Item = { repo?: string; path: string; action?: string; detail?: string; reason?: string; file_path?: string }
  const items = $derived(Array.isArray(activity.summary.items)
    ? activity.summary.items.filter((item): item is Item => !!item && typeof item === 'object' && typeof item.path === 'string')
    : [])
  const fields = $derived(Object.entries(activity.summary).filter(([key]) => key !== 'items'))
  const label = (key: string) => key.replace(/_/g, ' ')
  const value = (v: unknown): string => typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v)
  async function reveal(path: string) {
    linkError = null
    try {
      const result = await api.artifacts.reveal(path)
      if (!result.ok) linkError = result.error || 'Could not reveal this file.'
    } catch (e) { linkError = e instanceof Error ? e.message : String(e) }
  }
</script>

<div class="activity-details">
  <div class="metadata"><time datetime={new Date(activity.ts).toISOString()}>{new Date(activity.ts).toLocaleString()}</time> · {activity.actor}{#if activity.repo} · {activity.repo}{/if}</div>
  {#if activity.error}<p class="error">{activity.error}</p>{/if}
  <dl>
    {#each fields as [key, v]}
      <div><dt>{label(key)}</dt><dd>{value(v)}</dd></div>
    {/each}
  </dl>
  {#if items.length}
    <h4>Processed items · {items.length}</h4>
    <ul>
      {#each items as item}
        <li>
          <div class="item-heading"><span class="action">{item.action || 'processed'}</span>{#if item.repo}<span class="repo">{item.repo}</span>{/if}</div>
          {#if item.file_path?.startsWith('/')}
            <button class="file-link" onclick={() => reveal(item.file_path!)} title="Reveal file in Finder">{item.path} ↗</button>
          {:else}<span class="path">{item.path}</span>{/if}
          {#if item.detail}<div class="detail">{item.detail}</div>{/if}
          {#if item.reason}<div class="detail">{item.reason}</div>{/if}
        </li>
      {/each}
    </ul>
  {:else if activity.kind !== 'pull'}
    <p class="metadata">{Array.isArray(activity.summary.items) ? 'No individual items were processed.' : 'Item details were not recorded for this activity.'}</p>
  {/if}
  {#if linkError}<p class="error" role="alert">{linkError}</p>{/if}
</div>

<style>
  .activity-details { padding: 12px 14px; border-top: 1px solid var(--arbol-color-hairline); font-size: var(--arbol-type-label); }
  .metadata, dt, .detail { color: var(--arbol-color-text-muted); }
  dl { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; }
  dt { text-transform: capitalize; font-size: 11px; }
  dd { margin: 3px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--arbol-font-mono); }
  h4 { margin: 14px 0 8px; font-size: inherit; }
  ul { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow-y: auto; }
  li { padding: 8px 0; border-top: 1px solid var(--arbol-color-hairline); overflow-wrap: anywhere; }
  .item-heading { display: flex; gap: 8px; margin-bottom: 4px; font-size: 11px; }
  .action { color: var(--arbol-color-text-muted); text-transform: capitalize; }
  .repo { font-family: var(--arbol-font-mono); }
  .file-link { padding: 0; border: 0; background: none; color: var(--arbol-color-accent); font: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; text-decoration: underline; }
  .file-link:focus-visible { outline: 2px solid var(--arbol-color-accent); outline-offset: 3px; }
  .detail { margin-top: 3px; font: 11px/1.5 var(--arbol-font-mono); }
  .error { color: var(--arbol-color-danger, #e35); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
