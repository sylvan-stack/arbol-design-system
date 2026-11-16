<script lang="ts">
  import { tick } from 'svelte';
  import Button from './Button.svelte';
  import Badge from './Badge.svelte';
  import { browserControls, type BrowserControlState, type BrowserControlAction, type BrowserMethod } from '../sections/browser-control';
  let { state: model, onaction }: { state: BrowserControlState; onaction: (action: BrowserControlAction) => void } = $props();
  const id = $props.id();
  let client = $state('');
  let address = $state('');
  let confirmation = $state<{ tab: string; generation: number } | null>(null);
  let confirmRegion = $state<HTMLDivElement>();
  let recoverTrigger = $state<HTMLSpanElement>();
  const recipient = $derived(model.attachments.some(entry => entry.id === client) ? client : model.attachments[0]?.id ?? '');
  const controls = $derived(browserControls(model, recipient));
  const confirming = $derived(!!confirmation && confirmation.tab === controls.tab?.tab && confirmation.generation === controls.tab?.generation);
  function act(method: BrowserMethod, extra: BrowserControlAction['params'] = {}) {
    const target = controls.tab;
    onaction({ method, params: ['new_tab', 'close_window', 'select'].includes(method) ? extra :
      { tab: target?.tab, controlGeneration: target?.generation, ...extra } });
  }
  async function confirmRecovery() {
    if (!controls.tab) return;
    confirmation = { tab: controls.tab.tab, generation: controls.tab.generation };
    await tick(); confirmRegion?.querySelector('button')?.focus();
  }
  async function cancelRecovery() {
    confirmation = null; await tick(); recoverTrigger?.querySelector('button')?.focus();
  }
</script>

<header aria-label="Trusted browser controls" class="browser-control">
  <div class="row heading"><strong>Arbol Browser</strong><Button label="New tab" disabled={!controls.available} onclick={() => act('new_tab')} /><Button label="Close window" disabled={!controls.connected} onclick={() => act('close_window')} /></div>
  <nav aria-label="Browser tabs" class="row tabs">
    {#each model.tabs as tab, i (tab.tab)}
      <button class="tab" type="button" aria-current={tab.tab === model.selected ? 'page' : undefined} disabled={!controls.available} onclick={() => { confirmation = null; act('select', { tab: tab.tab }); }}>Tab {i + 1}</button>
    {/each}
  </nav>
  <form class="row" onsubmit={(event) => { event.preventDefault(); if (controls.navigate) act('user_navigate', { url: address }); }}>
    <label for="{id}-address">Open address</label><input id="{id}-address" type="url" autocomplete="off" spellcheck="false" placeholder="https://example.com" bind:value={address} disabled={!controls.navigate} /><Button type="submit" label="Go" disabled={!controls.navigate} />
  </form>
  <div class="row"><Button label="Back" disabled={!controls.navigate} onclick={() => act('back')} /><Button label="Forward" disabled={!controls.navigate} onclick={() => act('forward')} /><Button label="Reload" disabled={!controls.navigate} onclick={() => act('reload')} /><Button label="Close tab" disabled={!controls.connected || !controls.tab} onclick={() => act('close_tab')} /></div>
  <div class="row" role="status" aria-live="polite">
    <strong>{controls.owner}</strong>
    {#if controls.tab}<Badge label={controls.tab.pageAvailability} tone={controls.tab.pageAvailability === 'ready' ? 'success' : 'warning'} /><span>{controls.tab.handoff === 'taking' ? 'Taking control…' : controls.tab.inputReady ? 'Input ready' : 'Input unavailable'}</span>{/if}
    {#if model.connection !== 'ready'}<span>{model.connection === 'loading' ? 'Connecting to browser…' : 'Browser state unavailable'}</span>{/if}
  </div>
  <div class="row">
    <label for="{id}-client">Agent</label><select id="{id}-client" value={recipient} onchange={(event) => (client = event.currentTarget.value)} disabled={!controls.available || !model.attachments.length} aria-describedby="{id}-privacy">
      {#each model.attachments as entry (entry.id)}<option value={entry.id}>{entry.label}</option>{/each}
    </select>
    <Button label="Share" disabled={!controls.share} onclick={() => act('share', { client: recipient })} />
    <Button label="Return control" disabled={!controls.returnControl} onclick={() => act('return', { client: recipient })} />
    <Button label="Take control" tone="primary" disabled={!controls.take} onclick={() => act('take')} />
    <span bind:this={recoverTrigger}><Button label="Recover page" disabled={!controls.recover} onclick={confirmRecovery} /></span>
  </div>
  <div class="row" aria-label="Sharing permissions">
    {#each controls.tab?.visibleTo ?? [] as grant (grant)}<Button label={`Stop sharing with ${model.attachments.find(entry => entry.id === grant)?.label ?? 'disconnected agent'}`} disabled={!controls.available} onclick={() => act('stop_sharing', { client: grant })} />{/each}
  </div>
  <p id="{id}-privacy">User control is private. Sharing alone does not return control.</p>
  {#if confirming}<div bind:this={confirmRegion} class="recovery" role="group" aria-label="Confirm recovery"><p>Recovery discards unsaved page state. Interrupted actions will not be replayed.</p><div class="row"><Button label="Keep page" onclick={cancelRecovery} /><Button label="Recover and discard page state" disabled={!controls.recover} onclick={() => { confirmation = null; act('recover'); }} /></div></div>{/if}
  {#if model.problem}<p class="problem" role="alert">{model.problem}</p>{/if}
</header>

<style>
  .browser-control { background: var(--canvas); color: var(--text); border-bottom: 1px solid var(--border); padding: 12px 16px; max-height: var(--browser-controls-height, 272px); overflow: auto; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
  .heading strong { margin-right: auto; font-size: 16px; }
  input, select, .tab { min-height: var(--control-height); font: inherit; color: var(--text); background: var(--inset); padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); max-width: 100%; }
  input { flex: 1; min-width: 140px; }
  .tab[aria-current='page'] { border-color: var(--accent); font-weight: 700; }
  :is(input, select, .tab):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  :is(input, select, .tab):disabled { opacity: .6; }
  p { margin: 6px 0; overflow-wrap: anywhere; }
  .browser-control > p { color: var(--muted); font-size: 12px; }
  .browser-control > .problem { color: var(--failure); font-size: inherit; }
  .recovery { border: 1px solid var(--border); padding: 12px; border-radius: var(--radius-md); }
</style>
