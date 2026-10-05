<script lang="ts">
  import { onMount } from 'svelte'
  import { api, type ReactionSummary } from '../api'

  let reactions = $state<ReactionSummary[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)

  const errorText = (value: unknown) => value instanceof Error ? value.message : String(value)

  async function load() {
    loading = true
    error = null
    try {
      reactions = await api.reactions()
    } catch (value) {
      error = errorText(value)
    } finally {
      loading = false
    }
  }

  onMount(() => { void load() })

  function time(value: number | null): string {
    return value ? new Date(value).toLocaleString() : 'Never'
  }
</script>

<div class="reactions-page">
  <header>
    <div>
      <h2>Reactions</h2>
      <p>Code-owned automations that match durable Signals and perform Actions. Reaction definitions are read-only in Seqoya Lab.</p>
    </div>
    <button type="button" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
  </header>

  {#if error}<div class="error">{error}</div>{/if}

  <div class="reaction-list">
    {#each reactions as reaction (reaction.reaction_id)}
      <article>
        <div class="card-head">
          <div>
            <div class="name-line">
              <h3>{reaction.name}</h3>
              <span class:enabled={reaction.enabled}>{reaction.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="identity">{reaction.reaction_id} · v{reaction.version}</div>
          </div>
          <div class="run-count">{reaction.runtime.runs} {reaction.runtime.runs === 1 ? 'run' : 'runs'}</div>
        </div>
        <p class="summary">{reaction.summary}</p>
        <div class="flow">
          <section>
            <div class="eyebrow">When Signal matches</div>
            <div class="types">{reaction.trigger.signal_types.join(', ')}</div>
            <p>{reaction.trigger.summary}</p>
          </section>
          <div class="arrow">→</div>
          <section>
            <div class="eyebrow">Action · {reaction.action.type}</div>
            <div class="types">{reaction.action.summary}</div>
          </section>
        </div>
        <footer>
          <span>{reaction.runtime.succeeded} succeeded</span>
          <span class:failed={reaction.runtime.failed > 0}>{reaction.runtime.failed} failed</span>
          <span>Last completion: {time(reaction.runtime.last_completed_at)}</span>
          {#if reaction.runtime.last_error}<span class="failed" title={reaction.runtime.last_error}>Last error: {reaction.runtime.last_error}</span>{/if}
        </footer>
      </article>
    {:else}
      <div class="empty">{loading ? 'Loading Reactions…' : 'No code-owned Reactions are registered.'}</div>
    {/each}
  </div>
</div>

<style>
  .reactions-page { box-sizing:border-box; min-height:100%; padding:var(--arbol-space-5); }
  header { display:flex; align-items:flex-start; gap:24px; margin-bottom:var(--arbol-space-5); }
  h2 { margin:0 0 4px; font-size:var(--arbol-type-title); }
  header p { margin:0; max-width:760px; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); line-height:1.45; }
  button { margin-left:auto; cursor:pointer; border:1px solid var(--arbol-color-border); background:var(--arbol-color-surface-2); color:var(--arbol-color-text); border-radius:var(--arbol-radius-s); padding:7px 12px; font:500 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  button:disabled { opacity:.6; cursor:default; }
  .error { margin-bottom:12px; color:var(--arbol-color-danger,#e35); font-size:var(--arbol-type-label); }
  .reaction-list { display:grid; gap:var(--arbol-space-4); }
  article { border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface-2); padding:var(--arbol-space-4); box-shadow:var(--arbol-shadow-1); }
  .card-head,.name-line,footer { display:flex; align-items:center; gap:10px; }
  .card-head { align-items:flex-start; }
  h3 { margin:0; font-size:var(--arbol-type-body); }
  .name-line span { border-radius:999px; padding:2px 7px; color:var(--arbol-color-text-muted); background:var(--arbol-color-bg); font:600 10px var(--arbol-font-mono); }
  .name-line span.enabled { color:#39b58a; background:#2a8f6a26; }
  .identity,.run-count,footer { color:var(--arbol-color-text-muted); font:11px var(--arbol-font-mono); }
  .identity { margin-top:4px; }
  .run-count { margin-left:auto; }
  .summary { margin:14px 0; color:var(--arbol-color-text); line-height:1.45; font-size:var(--arbol-type-label); }
  .flow { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:stretch; gap:12px; }
  .flow section { border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-m); background:var(--arbol-color-bg); padding:12px; }
  .eyebrow { margin-bottom:7px; color:var(--arbol-color-text-muted); text-transform:uppercase; letter-spacing:.5px; font:600 10px var(--arbol-font-ui); }
  .types { color:var(--arbol-color-accent); font:600 12px/1.4 var(--arbol-font-mono); }
  .flow p { margin:6px 0 0; color:var(--arbol-color-text-muted); font-size:11px; line-height:1.45; }
  .arrow { align-self:center; color:var(--arbol-color-text-muted); font-size:18px; }
  footer { flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid var(--arbol-color-border); }
  footer span + span::before { content:'·'; margin-right:10px; color:var(--arbol-color-text-muted); }
  .failed { color:var(--arbol-color-danger,#e35); }
  .empty { display:grid; place-items:center; min-height:180px; border:1px dashed var(--arbol-color-border); border-radius:var(--arbol-radius-l); color:var(--arbol-color-text-muted); }
  @media (max-width:800px) { .flow { grid-template-columns:1fr; }.arrow { transform:rotate(90deg); justify-self:center; } }
</style>
