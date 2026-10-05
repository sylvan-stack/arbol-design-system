<script lang="ts">
  import { elmaBridge } from '../api'

  import { onDestroy } from 'svelte'
  import { ActivityGraphRefresh, type Graph } from './activityGraphRefresh'

  let { sessionId, exchangeId }: { sessionId?: string | null; exchangeId?: string | null } = $props()
  let result = $state<Graph | null>(null)
  let loading = $state(false)
  let error = $state(false)
  let stale = $state(false)
  type Capture = { scope: string; execution: string; name: string; text: string; sha256: string; byte_length: number; continuation: unknown }
  let capture = $state<Capture | null>(null)
  let captureLoading = $state(false)
  let captureError = $state('')
  let captureGeneration = 0
  const captureScope = $derived(JSON.stringify([sessionId, exchangeId, graph?.storage_generation]))
  const shownCapture = $derived(capture?.scope === captureScope ? capture : null)
  $effect(() => {
    captureScope
    captureGeneration++
    capture = null
    captureError = ''
    captureLoading = false
  })
  async function inspectCapture(execution: string, name: string, more = false) {
    const scope = captureScope
    const generation = ++captureGeneration
    const prior = more ? shownCapture : null
    captureLoading = true
    captureError = ''
    try {
      const page = await elmaBridge.call('activity_graph.capture', {
        chat_session_id: sessionId, exchange_id: exchangeId, execution_id: execution, name,
        ...(prior?.continuation ? { continuation: prior.continuation } : {}),
      }) as { text: string; sha256: string; byte_length: number; continuation: unknown }
      if (scope !== captureScope || generation !== captureGeneration) return
      capture = { scope, execution, name, text: (prior?.text ?? '') + page.text,
        sha256: page.sha256, byte_length: page.byte_length, continuation: page.continuation }
    } catch (error) {
      if (scope === captureScope && generation === captureGeneration) captureError = String(error)
    } finally {
      if (generation === captureGeneration) captureLoading = false
    }
  }
  const refresh = new ActivityGraphRefresh(elmaBridge, state => {
    result = state.result
    loading = state.loading
    error = state.error
    stale = state.stale
  })
  // Identity-tagged results cannot paint the outgoing Exchange during a prop update.
  const graph = $derived(result?.chat_session_id === sessionId && result?.exchange_id === exchangeId ? result : null)
  $effect(() => { refresh.select(sessionId, exchangeId) })
  onDestroy(() => { captureGeneration++; refresh.dispose() })
  function label(id: string) {
    const index = graph?.executions?.findIndex(node => node.execution_id === id) ?? -1
    return index >= 0 ? `Activity ${index + 1}` : id
  }
</script>

<section class="activity-graph" aria-label="Activity Graph" aria-busy={loading}>
  <header>
    <h2>Activity Graph</h2>
    <button type="button" onclick={() => refresh.refresh()} disabled={loading || !sessionId || !exchangeId}>Refresh Activities</button>
  </header>
  <p class="note">Activity lifecycle for the selected Exchange. Refreshes as the chat changes. Open a retained value to inspect its saved content. Completion alone does not establish Provider consumption.</p>
  {#if !sessionId || !exchangeId}
    <p role="status">Select an Exchange to inspect its Activities.</p>
  {:else if graph?.status === 'observed' && stale}
    <p role="status">{loading ? 'Refreshing Activity history…' : 'Activity history refresh unavailable.'} Showing a stale last-observed snapshot; it may not include recent changes.</p>
  {:else if loading}
    <p role="status">Loading Activity history…</p>
  {:else if error || graph?.status === 'unavailable'}
    <p role="status">Activity history unavailable or beyond inspection limits. Refresh to try again.</p>
  {/if}
  {#key JSON.stringify([sessionId, exchangeId])}
  {#if graph?.status === 'observed'}
    <dl class="scope">
      <dt>Exchange</dt><dd>{graph.exchange_id}</dd>
      <dt>Runtime</dt><dd>{graph.runtime_id}</dd>
      {#if graph.storage_generation}
        <dt>Session revision</dt><dd>{graph.observed_revision}</dd>
      {:else}
        <dt>Observed range</dt><dd>{graph.range_start}–{graph.range_end} (head {graph.observed_head})</dd>
      {/if}
    </dl>
    {#if !graph.executions?.length}
      <p role="status">No Activity executions recorded for this Exchange.</p>
    {:else}
      <ol>
        {#each graph.executions as node, index (node.execution_id)}
          <li>
            <details>
              <summary><strong>Activity {index + 1}: {node.activity_id}</strong> <span class="phase">{node.phase}</span></summary>
              <p class="identity">{node.execution_id}</p>
              {#if node.caused_by_execution_ids.length}
                <p>Caused by: {node.caused_by_execution_ids.map(label).join(', ')}</p>
              {:else}<p>No causal Activity predecessors recorded.</p>{/if}
              {#each [{ title: 'Inputs', bindings: node.inputs }, { title: 'Outputs', bindings: node.outputs }] as { title, bindings }}
                <h3>{title}</h3>
                {#each bindings as binding}
                  <div class="binding"><strong>{binding.name}</strong> · {binding.kind}<br /><code>{binding.value_id}</code>
                    {#if graph.storage_generation}
                      <button type="button" disabled={captureLoading} onclick={() => inspectCapture(node.execution_id, binding.name)}>Open retained value</button>
                    {/if}
                  </div>
                {:else}<p>None recorded.</p>{/each}
              {/each}
              {#each graph.edges?.filter(edge => edge.kind === 'value' && edge.to === node.execution_id) ?? [] as edge}
                <p>Value from {label(edge.from)}: <code>{edge.value_id}</code></p>
              {/each}
              <h3>Lifecycle timestamps</h3>
              {#each Object.entries(node.timestamps) as [phase, ts]}
                <p>{phase}: <time datetime={new Date(ts).toISOString()}>{new Date(ts).toLocaleString()}</time></p>
              {/each}
            </details>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
  {/key}
  {#if captureLoading}<p role="status">Loading retained value…</p>{/if}
  {#if captureError}<p role="alert">{captureError}</p>{/if}
  {#if shownCapture}
    <section aria-label="Retained Activity value">
      <h3>{shownCapture.name}</h3>
      <p>{shownCapture.byte_length} bytes · SHA-256 <code>{shownCapture.sha256}</code></p>
      <pre>{shownCapture.text}</pre>
      {#if shownCapture.continuation}
        <button type="button" disabled={captureLoading} onclick={() => inspectCapture(shownCapture!.execution, shownCapture!.name, true)}>Load more</button>
      {/if}
    </section>
  {/if}
</section>

<style>
  .activity-graph { margin-top:var(--arbol-space-4); color:var(--arbol-color-text); font:400 var(--arbol-type-label)/1.5 var(--arbol-font-ui); overflow-wrap:anywhere }
  header { display:flex; align-items:center; flex-wrap:wrap; gap:12px; justify-content:space-between }
  h2 { font-size:var(--arbol-type-body); margin:0 }
  h3 { font-size:inherit; margin:12px 0 4px }
  button { color:inherit; background:var(--arbol-color-surface); border:1px solid var(--arbol-color-border); border-radius:4px; padding:5px 8px; cursor:pointer }
  button:disabled { opacity:.5; cursor:default }
  .note, .identity, dt { color:var(--arbol-color-text-muted) }
  .scope { display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 12px }
  dd { margin:0 }
  ol { padding-left:20px }
  li { margin:8px 0; border-bottom:1px solid var(--arbol-color-border); padding-bottom:8px }
  summary { cursor:pointer }
  .phase { display:inline-block; margin-left:8px; font-weight:600 }
  code, .identity { font:inherit; font-family:var(--arbol-font-mono) }
  .binding { margin-bottom:8px }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:32rem; overflow:auto }
</style>
