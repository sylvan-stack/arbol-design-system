<script lang="ts">
  import { untrack } from 'svelte';
  import BrowserControl from '../components/BrowserControl.svelte';
  import Button from '../components/Button.svelte';
  import type { BrowserControlState, BrowserControlAction, BrowserTab } from '../sections/browser-control';
  let { variant = 'private', controlsOnly = false }: { variant?: 'private' | 'shared' | 'agent' | 'taking' | 'unresponsive' | 'crashed' | 'unavailable' | 'no-agents' | 'busy' | 'error' | 'loading' | 'empty' | 'concurrent' | 'long-label' | 'selecting'; controlsOnly?: boolean } = $props();
  function example(): BrowserControlState {
    const attachments = [{ id: 'example-agent', label: 'Example agent' }, { id: 'example-observer', label: 'Example observer' }];
    const tab: BrowserTab = { tab: 'example-tab-1', generation: 1, controller: { kind: 'user' }, handoff: 'idle', inputReady: true, pageAvailability: 'ready', visibleTo: [] };
    if (variant !== 'private' && variant !== 'no-agents') tab.visibleTo = ['example-agent'];
    if (['agent', 'long-label', 'selecting'].includes(variant)) tab.controller = { kind: 'agent', client: attachments[0].id, label: variant === 'long-label' ? 'Example agent with a long nonsecret display label for a narrow window' : attachments[0].label };
    if (['unresponsive', 'crashed', 'unavailable'].includes(variant)) { tab.pageAvailability = variant as BrowserTab['pageAvailability']; tab.inputReady = false; }
    if (variant === 'taking') { tab.handoff = 'taking'; tab.pageAvailability = 'unavailable'; tab.inputReady = false; }
    const tabs = ['empty', 'loading'].includes(variant) ? [] : [tab];
    if (variant === 'concurrent') tabs.push({ ...tab, tab: 'example-tab-2', controller: { kind: 'agent', client: 'example-agent', label: 'Example agent' }, visibleTo: ['example-agent'] });
    if (variant === 'selecting') tabs.push({ ...tab, tab: 'example-tab-2', controller: { kind: 'user' }, visibleTo: [] });
    return { tabs, selected: tabs[0]?.tab ?? '', attachments: variant === 'no-agents' ? [] : attachments,
      connection: variant === 'loading' ? 'loading' : 'ready',
      problem: variant === 'error' ? 'The request was refused. Read the current state before trying again.' : '' };
  }
  let model = $state<BrowserControlState>(untrack(example));
  let nativeBusy = $state(untrack(() => variant === 'busy'));
  let next = 2;
  let note = $state('A fictional unsaved note');
  let feedback = $state('');
  let recovering = $state(false);
  const current = $derived(model.tabs.find(tab => tab.tab === model.selected));
  function action({ method, params }: BrowserControlAction) {
    const target = model.tabs.find(tab => tab.tab === params.tab);
    model.problem = ''; feedback = '';
    if (target && method !== 'select' && params.controlGeneration !== target.generation) { model.problem = 'Control changed. Read the current state.'; return; }
    if (method === 'select' && target) { model.selected = target.tab; return; }
    if (method === 'new_tab') {
      const tab: BrowserTab = { tab: `example-created-${next++}`, generation: 1, controller: { kind: 'user' }, handoff: 'idle', inputReady: true, pageAvailability: 'ready', visibleTo: [] };
      model.tabs.push(tab); model.selected = tab.tab; return;
    }
    if (method === 'close_window') { model.tabs = []; model.selected = ''; model.pending = false; model.selecting = false; recovering = false; model.connection = 'unavailable'; feedback = 'Local preview window closed.'; return; }
    if (!target) return;
    if (method === 'close_tab') { model.tabs = model.tabs.filter(tab => tab.tab !== target.tab); model.selected = model.tabs[0]?.tab ?? ''; model.pending = false; recovering = false; return; }
    if (method === 'share' && params.client && target.controller.kind === 'user') { target.visibleTo = [...new Set([...target.visibleTo, params.client])]; return; }
    if (method === 'stop_sharing') {
      target.visibleTo = target.visibleTo.filter(id => id !== params.client);
      if (target.controller.kind !== 'agent' || target.controller.client !== params.client) return;
    }
    if (method === 'take' || method === 'stop_sharing') {
      target.generation++; target.controller = { kind: 'user' }; target.handoff = 'taking'; target.inputReady = false; target.pageAvailability = 'unavailable'; return;
    }
    if (method === 'return') {
      if (nativeBusy) { model.problem = 'Finish or cancel the interaction, then Return control. The owner and generation have not changed.'; return; }
      const client = model.attachments.find(entry => entry.id === params.client);
      if (!client || !target.visibleTo.includes(client.id)) return;
      target.generation++; target.controller = { kind: 'agent', client: client.id, label: client.label };
      feedback = 'Local preview: the agent needs a fresh snapshot before page input.'; return;
    }
    if (method === 'recover') {
      recovering = true;
      target.generation++; target.controller = { kind: 'user' }; target.inputReady = false;
      target.pageAvailability = 'unavailable'; model.pending = true; feedback = 'Local recovery pending. No interrupted action is replayed.'; return;
    }
    feedback = 'Local preview only: navigation and history do not contact a website.';
  }
  function completeLocalTransition() {
    if (!current) return;
    if (recovering) { note = ''; recovering = false; }
    current.handoff = 'idle'; current.inputReady = true; current.pageAvailability = 'ready'; model.pending = false;
    feedback = 'Local preview transition completed.';
  }
</script>

<section class="browser-preview" aria-label="Arbol Browser local design preview">
  <p class="boundary">Local design preview · Fictional data. Native input exclusion, IPC authentication, page health and profile storage are supplied by the production host.</p>
  <BrowserControl state={model} onaction={action} />
  {#if !controlsOnly}<main class="page" aria-label="Fictional page surface">
    {#if current}<h2>Fictional document</h2><p>The production page stays live in its own native view. This preview provides no native input gate.</p>
      <label>Example note <input bind:value={note} disabled={current.controller.kind !== 'user' || current.handoff !== 'idle' || !current.inputReady} /></label>
    {:else}<h2>No open tabs</h2><p>Use New tab when the browser is available.</p>{/if}
  </main>{/if}
  <div class="preview-controls">
    {#if variant === 'selecting'}
      <Button label="Begin local selection" disabled={model.selecting || model.pending || current?.handoff !== 'idle'} onclick={() => { model.selecting = true; feedback = 'Local selection pending: tab actions are fenced; Close window remains available.'; }} />
      <Button label="Begin ordinary local pending" disabled={model.selecting || model.pending || current?.handoff !== 'idle'} onclick={() => { model.pending = true; feedback = 'Ordinary local pending: eligible Take and Close window remain available.'; }} />
      {#if model.selecting}<Button label="Complete local selection" onclick={() => { model.selected = model.tabs[1]?.tab ?? model.selected; model.selecting = false; feedback = 'Local trusted selection synchronized.'; }} />{/if}
    {/if}
    {#if current?.handoff === 'taking' || model.pending}<Button label="Complete local transition" onclick={completeLocalTransition} />{/if}
    {#if nativeBusy}<Button label="Finish local interaction" onclick={() => (nativeBusy = false)} />{/if}
    {#if model.connection === 'unavailable' || model.connection === 'loading'}<Button label="Reset local preview" onclick={() => { model = example(); model.connection = 'ready'; }} />{/if}
    {#if feedback}<p role="status">{feedback}</p>{/if}
  </div>
</section>

<style>
  .browser-preview { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; background: var(--panel); color: var(--text); }
  .boundary { margin: 0; padding: 12px 16px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--border); }
  .page { padding: 24px; min-height: 260px; background: var(--inset); }
  .page h2 { font-size: 16px; }
  label { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input { min-height: var(--control-height); padding: 8px; font: inherit; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); max-width: 100%; }
  input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .preview-controls { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; }
</style>
