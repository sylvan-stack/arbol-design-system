<script lang="ts">
  import { onMount } from 'svelte'
  import { api, type QuickText, type QuickTextDraft } from '../api'

  const blank = (): QuickTextDraft => ({ name: '', activation_key: '', content: '', enabled: true })
  let items = $state<QuickText[]>([])
  let editing = $state<QuickTextDraft | null>(null)
  let loading = $state(true)
  let busy = $state(false)
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { items = await api.quickText.list() } catch (e) { error = e instanceof Error ? e.message : String(e) }
    finally { loading = false }
  }
  function edit(item: QuickText) { editing = { ...item } }
  async function save() {
    if (!editing) return
    busy = true; error = ''
    try { await api.quickText.save({ ...editing, activation_key: editing.activation_key.toUpperCase() }); editing = null; await load() }
    catch (e) { error = e instanceof Error ? e.message : String(e) } finally { busy = false }
  }
  async function toggle(item: QuickText) {
    busy = true; error = ''
    try { await api.quickText.save({ ...item, enabled: !item.enabled }); await load() }
    catch (e) { error = e instanceof Error ? e.message : String(e) } finally { busy = false }
  }
  async function remove(item: QuickText) {
    if (!confirm(`Delete “${item.name}”?`)) return
    busy = true
    try { await api.quickText.remove(item.quick_text_id); await load() }
    catch (e) { error = e instanceof Error ? e.message : String(e) } finally { busy = false }
  }
  onMount(() => { void load() })
</script>

<div class="page">
  <header><div><h2>Seqoya Quick Text</h2><p>Save common text and insert it in Elma by typing <code>!@</code> followed by its one activation key.</p></div><button onclick={() => editing = blank()}>New Quick Text</button></header>
  {#if error}<div class="error">{error}</div>{/if}
  <section class="list">
    {#each items as item (item.quick_text_id)}
      <article class:disabled={!item.enabled}>
        <kbd>{item.activation_key}</kbd><div class="copy"><h3>{item.name}</h3><p>{item.content}</p></div>
        <button class="secondary" onclick={() => toggle(item)} disabled={busy}>{item.enabled ? 'Disable' : 'Enable'}</button>
        <button class="secondary" onclick={() => edit(item)}>Edit</button><button class="danger" onclick={() => remove(item)}>Delete</button>
      </article>
    {:else}<div class="empty">{loading ? 'Loading Quick Text…' : 'No Quick Text yet. Create one to use !@ in Elma.'}</div>{/each}
  </section>
</div>
{#if editing}
  <div class="backdrop" role="presentation">
    <form onsubmit={(e) => { e.preventDefault(); void save() }}>
      <h2>{editing.quick_text_id ? 'Edit Quick Text' : 'New Quick Text'}</h2>
      <label>Name<input bind:value={editing.name} required maxlength="100" /></label>
      <label>Activation key<input class="key" bind:value={editing.activation_key} required maxlength="1" pattern="[A-Za-z0-9]" placeholder="A" /></label>
      <label>Content<textarea bind:value={editing.content} required rows="8"></textarea><small>Use <code>[ENTER]</code> to send the message automatically after insertion. Normal line breaks remain line breaks.</small></label>
      <label class="check"><input type="checkbox" bind:checked={editing.enabled} /> Enabled</label>
      <div class="actions"><button type="button" class="secondary" onclick={() => editing = null}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  </div>
{/if}
<style>
  .page{box-sizing:border-box;min-height:100%;padding:var(--arbol-space-5)} header{display:flex;gap:24px;align-items:flex-start;margin-bottom:var(--arbol-space-5)} h2,h3{margin:0} header p{color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)} button{margin-left:auto;padding:8px 13px;border:1px solid var(--arbol-color-accent);border-radius:var(--arbol-radius-s);background:var(--arbol-color-accent);color:var(--arbol-color-bg);cursor:pointer;font-weight:600}.secondary,.danger{margin-left:0;background:var(--arbol-color-surface-2);color:var(--arbol-color-text);border-color:var(--arbol-color-border)}.danger{color:var(--arbol-color-danger,#e35)}.list{display:grid;gap:10px}article{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface-2)}article.disabled{opacity:.55}kbd{display:grid;place-items:center;flex:0 0 34px;height:34px;border:1px solid var(--arbol-color-accent);border-radius:7px;font:700 16px var(--arbol-font-mono)}.copy{flex:1;min-width:0}.copy p{margin:5px 0 0;white-space:pre-wrap;max-height:3em;overflow:hidden;color:var(--arbol-color-text-muted);font-size:12px}.empty{padding:50px;text-align:center;border:1px dashed var(--arbol-color-border);color:var(--arbol-color-text-muted)}.error{margin-bottom:12px;color:var(--arbol-color-danger,#e35)}.backdrop{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:#0008}.backdrop form{width:min(560px,calc(100vw - 40px));padding:24px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-bg);box-shadow:var(--arbol-shadow-3)}label{display:grid;gap:6px;margin-top:16px;font-size:12px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--arbol-color-border);border-radius:6px;background:var(--arbol-color-surface);color:var(--arbol-color-text);font:inherit}.key{width:60px;text-transform:uppercase;font-family:var(--arbol-font-mono)}textarea{resize:vertical}label small{color:var(--arbol-color-text-muted);font-weight:400;line-height:1.4}.check{display:flex;align-items:center}.check input{width:auto}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.actions button{margin:0}
</style>
