<script lang="ts">
  import { onMount } from 'svelte'
  import { api, type FeatureToggle, type FeatureTogglesResult } from '../api'

  let result = $state<FeatureTogglesResult | null>(null)
  let loading = $state(true)
  let busy = $state<string | null>(null)
  let error = $state<string | null>(null)
  let notice = $state<string | null>(null)

  const message = (value: unknown) => value instanceof Error ? value.message : String(value)

  async function load() {
    loading = true
    error = null
    try { result = await api.featureToggles() }
    catch (value) { error = message(value) }
    finally { loading = false }
  }

  async function toggle(feature: FeatureToggle) {
    busy = feature.key
    error = null
    notice = null
    try {
      result = await api.setFeatureToggle(feature.key, !feature.enabled)
      notice = `${feature.label} ${feature.enabled ? 'disabled' : 'enabled'}. The change applies at runtime.`
    } catch (value) { error = message(value) }
    finally { busy = null }
  }

  async function rebuildCatalog() {
    busy = '__catalog__'
    error = null
    notice = null
    try {
      const rebuilt = await api.rebuildCueDetectionCatalog()
      notice = `Cue Detection Catalog rebuilt with ${rebuilt.entries} literal rules.`
      await load()
    } catch (value) { error = message(value) }
    finally { busy = null }
  }

  onMount(() => { void load() })
</script>

<div class="page">
  <header>
    <div>
      <h2>Seqoya Feature Toggles</h2>
      <p>Enable or disable experimental Arbol features at runtime. Changes are persisted and apply without rebuilding Arbol.</p>
    </div>
    <button class="secondary" onclick={load} disabled={loading}>Reload</button>
  </header>

  {#if error}<div class="message error">{error}</div>{/if}
  {#if notice}<div class="message notice">{notice}</div>{/if}

  <section class="features" aria-label="Feature toggles">
    {#each result?.features ?? [] as feature (feature.key)}
      <article>
        <div class="copy">
          <div class="title-row">
            <h3>{feature.label}</h3>
            <span class:enabled={feature.enabled}>{feature.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <p>{feature.description}</p>
          <code>{feature.key}</code>
        </div>
        <button
          class:turn-off={feature.enabled}
          onclick={() => toggle(feature)}
          disabled={busy === feature.key}
          aria-pressed={feature.enabled}
        >
          {busy === feature.key ? 'Saving…' : feature.enabled ? 'Turn off' : 'Turn on'}
        </button>
      </article>
    {:else}
      <div class="empty">{loading ? 'Loading feature toggles…' : 'No feature toggles are registered.'}</div>
    {/each}
  </section>

  {#if result}
    <section class="catalog">
      <div>
        <h3>Cue Detection Catalog</h3>
        <p>Generated from <code>mycel:cues</code> declarations in the Arbol and Mycel Artifact Corpora.</p>
        <div class="catalog-meta"><span>{result.cue_catalog.entries == null ? 'Catalog count unavailable' : `${result.cue_catalog.entries} literal rules`}</span><code>{result.cue_catalog.path}</code></div>
      </div>
      <button class="secondary" onclick={rebuildCatalog} disabled={busy === '__catalog__'}>
        {busy === '__catalog__' ? 'Rebuilding…' : 'Rebuild catalog'}
      </button>
    </section>
  {/if}
</div>

<style>
  .page { box-sizing:border-box; min-height:100%; padding:var(--arbol-space-5); }
  header,.catalog { display:flex; align-items:flex-start; gap:24px; }
  header { margin-bottom:var(--arbol-space-5); }
  h2 { margin:0 0 4px; font-size:var(--arbol-type-title); }
  h3 { margin:0; font-size:var(--arbol-type-body); }
  header p,.catalog p { margin:0; max-width:760px; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); line-height:1.45; }
  button { margin-left:auto; cursor:pointer; border:1px solid var(--arbol-color-accent); background:var(--arbol-color-accent); color:var(--arbol-color-bg); border-radius:var(--arbol-radius-s); padding:8px 13px; font:600 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  button.secondary,button.turn-off { border-color:var(--arbol-color-border); background:var(--arbol-color-surface-2); color:var(--arbol-color-text); }
  button:disabled { opacity:.55; cursor:default; }
  .message { margin-bottom:12px; padding:9px 12px; border-radius:var(--arbol-radius-s); font-size:var(--arbol-type-label); }
  .error { color:var(--arbol-color-danger,#e35); background:color-mix(in srgb,var(--arbol-color-danger,#e35) 10%,transparent); }
  .notice { color:var(--arbol-color-success,#39b58a); background:color-mix(in srgb,var(--arbol-color-success,#39b58a) 10%,transparent); }
  .features { display:grid; gap:var(--arbol-space-3); }
  article,.catalog { border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface-2); padding:var(--arbol-space-4); }
  article { display:flex; align-items:center; gap:24px; }
  .copy { flex:1; min-width:0; }
  .title-row { display:flex; align-items:center; gap:9px; }
  .title-row span { border-radius:999px; padding:2px 7px; color:var(--arbol-color-text-muted); background:var(--arbol-color-bg); font:600 10px var(--arbol-font-mono); }
  .title-row span.enabled { color:var(--arbol-color-success,#39b58a); background:color-mix(in srgb,var(--arbol-color-success,#39b58a) 15%,transparent); }
  article p { margin:8px 0; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); line-height:1.45; }
  code { overflow-wrap:anywhere; color:var(--arbol-color-text-muted); font:11px var(--arbol-font-mono); }
  .catalog { margin-top:var(--arbol-space-5); }
  .catalog-meta { display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; margin-top:10px; color:var(--arbol-color-text-muted); font:11px var(--arbol-font-mono); }
  .empty { display:grid; place-items:center; min-height:150px; border:1px dashed var(--arbol-color-border); border-radius:var(--arbol-radius-l); color:var(--arbol-color-text-muted); }
</style>
