<script lang="ts">
  import { tick } from 'svelte';
  import ElmaFrame from '../sections/ElmaFrame.svelte';
  import SeqoyaLab from './SeqoyaLab.svelte';
  import type { WorkspaceTrunkSelector } from '../types';
  import CommandPalette from '../patterns/CommandPalette.svelte';
  import EntityPicker from '../patterns/EntityPicker.svelte';
  import RelationshipEditor from '../patterns/RelationshipEditor.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import TextField from '../components/TextField.svelte';
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  import DocumentView from '../patterns/DocumentView.svelte';
  const arbolMenuBarIcon = new URL('../assets/arbol-menu-bar.png', import.meta.url).href;
  type TrayCatalogueState = 'available' | 'loading' | 'empty' | 'unavailable';
  type TrayRendererState = 'available' | 'load-failed';
  type PreviewSurface = 'Elma Chat' | 'Seqoya Lab';
  type PreviewWindow = { id: string; surface: PreviewSurface; trunk: string; failed: boolean };
  let {
    surface = 'Go to Page',
    trayCatalogueState = 'available',
    trayCurrentTrunk,
    traySelectionProblem = '',
    trayRunningBuild = '0',
    trayNewBuild = '',
    trayRendererState = 'available',
    trayBackendAvailable = true,
    trayShortcutAvailable = true,
    traySeqoyaShortcutAvailable = true,
  }: {
    surface?: string;
    trayCatalogueState?: TrayCatalogueState;
    trayCurrentTrunk?: string;
    traySelectionProblem?: string;
    trayRunningBuild?: string;
    trayNewBuild?: string;
    trayRendererState?: TrayRendererState;
    trayBackendAvailable?: boolean;
    trayShortcutAvailable?: boolean;
    traySeqoyaShortcutAvailable?: boolean;
  } = $props();
  let feedback = $state('');
  let url = $state('');
  let trayOpen = $state(false);
  let trayRunning = $state(true);
  let trayButton = $state<HTMLElement>();
  let trunksOpen = $state(false);
  let trunksButton = $state<HTMLElement>();
  let previewWindows = $state<PreviewWindow[]>([]);
  let previewRefusedResearch = false;
  const previewFrames: Record<string, HTMLElement> = {};
  let trunkChoice = $state<string>();
  let selectionProblem = $state('');
  let trayFeedback = $state('');
  let startedBuild = $state('');
  const runningBuild = $derived(startedBuild || trayRunningBuild);
  const updateBuild = $derived(trayNewBuild !== runningBuild ? trayNewBuild : '');
  const fixtureTrunks = ['trivial', 'research'];
  const catalogueMessages = {
    loading: 'Loading Trunks…',
    empty: 'No compatible Trunks',
    unavailable: 'Could not read Trunks',
  };
  const currentTrunk = $derived(trunkChoice ?? trayCurrentTrunk ?? 'trivial');
  const currentTrunkInfo = $derived({
    available: fixtureTrunks.includes(currentTrunk) ? currentTrunk : `${currentTrunk} — Unavailable`,
    loading: 'Loading…',
    empty: 'None available',
    unavailable: catalogueMessages.unavailable,
  }[trayCatalogueState]);

  function closeTrayOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !trayOpen) return;
    event.preventDefault();
    if (trunksOpen) {
      trunksOpen = false;
      trunksButton?.focus();
    } else {
      trayOpen = false;
      trayButton?.focus();
    }
  }

  function chooseTrunk(name: string) {
    selectionProblem = traySelectionProblem;
    if (!selectionProblem) trunkChoice = name;
    trayFeedback = '';
    trunksOpen = false;
    trayOpen = false;
    trayButton?.focus();
  }
  function startNewVersion(build: string) {
    startedBuild = build;
    previewWindows = [];
    trayFeedback = `Started Build ${build} in this preview.`;
    trunksOpen = false;
    trayOpen = false;
    trayButton?.focus();
  }

  function handleSurfaceShortcut(event: KeyboardEvent) {
    if (surface !== 'Tray Menu' || !trayRunning || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.code === 'KeyE' && trayShortcutAvailable ? 'Elma Chat'
      : event.code === 'KeyQ' && traySeqoyaShortcutAvailable ? 'Seqoya Lab' : undefined;
    if (!target) return;
    event.preventDefault();
    if (event.repeat) return;
    if (trayBackendAvailable) void openSurface(target);
    else trayFeedback = 'The installation backend is unavailable.';
  }

  async function openSurface(surface: PreviewSurface) {
    const id = surface;
    const window = previewWindows.find((entry) => entry.id === id)
      ?? { id, surface, trunk: currentTrunk, failed: trayRendererState === 'load-failed' };
    previewWindows = [window, ...previewWindows.filter((entry) => entry.id !== id)];
    trunksOpen = false;
    trayOpen = false;
    trayFeedback = '';
    await tick();
    previewFrames[id]?.focus();
  }

  async function closeSurface(id: string) {
    previewWindows = previewWindows.filter((entry) => entry.id !== id);
    await tick();
    const next = previewWindows[0];
    if (next) previewFrames[next.id]?.focus();
    else trayButton?.focus();
  }

  const previewTrunkSelector = (window: PreviewWindow): WorkspaceTrunkSelector => ({
    load: async () => {
      if (trayCatalogueState === 'empty') return [];
      if (trayCatalogueState !== 'available') throw new Error(catalogueMessages[trayCatalogueState]);
      return fixtureTrunks;
    },
    select: async (code) => {
      if (code === 'research' && !previewRefusedResearch) {
        previewRefusedResearch = true;
        throw new Error('Research is temporarily unavailable. Try again.');
      }
      window.trunk = code;
    },
  });

  function quitTray() {
    previewWindows = [];
    trayRunning = false;
  }

  let notices = $state([
    'Design review complete',
    'Permission needed: read files',
    'Index refreshed',
  ]);
</script>

<svelte:window onkeydown={handleSurfaceShortcut} />

{#if surface === 'Tray Menu'}
  <div class="native stack">
    <p class="small muted">
      Browser preview of the Arbol menu bar.
      {#if trayRunning && trayShortcutAvailable}Press <kbd>⌥E</kbd> to open Elma Chat.{/if}
      {#if trayRunning && traySeqoyaShortcutAvailable}Press <kbd>⌥Q</kbd> to open Seqoya Lab.{/if}
    </p>
    <div class="menu-bar">
      {#if trayRunning}
        <details class="tray" bind:open={trayOpen}>
          <summary
            aria-label={updateBuild ? `Arbol, Build ${updateBuild} available` : 'Arbol'}
            title={updateBuild ? `Arbol, Build ${updateBuild} available` : 'Arbol'}
            bind:this={trayButton}
            onkeydown={closeTrayOnEscape}
          >
            <span class="tray-icon" style:--tray-icon={`url("${arbolMenuBarIcon}")`} aria-hidden="true"></span>
            {#if updateBuild}<span class="tray-badge" aria-hidden="true">!</span>{/if}
          </summary>
          <div class="tray-menu">
            <div class="tray-info small">
              <div>Current Trunk: {currentTrunkInfo}{trayCatalogueState === 'available' && selectionProblem ? ` — ${selectionProblem}` : ''}</div>
              <div>Running Build {runningBuild}</div>
            </div>
            {#if updateBuild}
              <button class="tray-command tray-update" onkeydown={closeTrayOnEscape} onclick={() => startNewVersion(updateBuild)}>
                Start new version <span class="small muted">Build {updateBuild}</span>
              </button>
            {/if}
            {#if !trayShortcutAvailable}
              <p class="catalogue-message">Option+E unavailable for Elma Chat</p>
            {/if}
            {#if !traySeqoyaShortcutAvailable}
              <p class="catalogue-message">Option+Q unavailable for Seqoya Lab</p>
            {/if}
            {#if trayCatalogueState === 'available' && fixtureTrunks.length > 0}
              <details class="tray-trunks" bind:open={trunksOpen}>
                <summary class="tray-command" bind:this={trunksButton} onkeydown={closeTrayOnEscape}>
                  Trunks <span aria-hidden="true">›</span>
                </summary>
                <div class="tray-menu trunks-menu">
                  {#each fixtureTrunks as code (code)}
                    <button
                      class="tray-command"
                      aria-pressed={currentTrunk === code}
                      onkeydown={closeTrayOnEscape}
                      onclick={() => chooseTrunk(code)}
                    >
                      <span class="trunk-check" aria-hidden="true">{currentTrunk === code ? '✓' : ''}</span>
                      {code}
                    </button>
                  {/each}
                </div>
              </details>
            {:else}
              <button class="tray-command" disabled>Trunks</button>
            {/if}
            <button class="tray-command" onkeydown={closeTrayOnEscape} onclick={quitTray}>Quit</button>
          </div>
        </details>
      {/if}
    </div>
    <p class="small muted" role="status">{trayRunning ? trayFeedback : 'Arbol quit in this preview.'}</p>
    {#each previewWindows as window (window.id)}
      <section
        class="window preview-window"
        aria-label={window.surface}
        tabindex="-1"
        bind:this={previewFrames[window.id]}
      >
        <div class="preview-content">
          {#if window.failed}
            <div class="titlebar">
              <strong>{window.surface}</strong>
              <button class="window-action" onclick={() => closeSurface(window.id)}>Close</button>
            </div>
            <div class="renderer-problem" role="status">
              <span>The {window.surface} renderer could not be verified.</span>
              <button class="window-action" onclick={() => (window.failed = false)}>Retry</button>
            </div>
          {:else if window.surface === 'Elma Chat'}
            <ElmaFrame trunk={window.trunk} trunkSelector={previewTrunkSelector(window)}>
              {#snippet headerWindowControls()}
                <button class="window-action" onclick={() => closeSurface(window.id)}>Close</button>
              {/snippet}
            </ElmaFrame>
          {:else}
            <SeqoyaLab>
              {#snippet headerWindowControls()}
                <button class="window-action" onclick={() => closeSurface(window.id)}>Close</button>
              {/snippet}
            </SeqoyaLab>
          {/if}
        </div>
      </section>
    {/each}
  </div>
{:else}
<div class="native stack">
  <p class="eyebrow">Native adapter specification · Browser equivalent</p>
  <div class="window">
    <div class="titlebar">
      <span class="lights" aria-hidden="true">● ● ●</span><strong>{surface}</strong><span
        class="small muted">Arbol</span
      >
    </div>
    <div class="content stack">
      {#if surface === 'Go to Page'}<CommandPalette />
      {:else if surface === 'Entity Search'}<EntityPicker />
      {:else if surface === 'Linked Entities'}<RelationshipEditor />
      {:else if surface === 'Repo Artifact Search'}<EntityPicker
          items={[
            {
              id: '1',
              title: 'Design System',
              kind: 'artifact',
              subtitle: 'arbol / design-system',
            },
            { id: '2', title: 'Architecture', kind: 'artifact', subtitle: 'arbol / architecture' },
          ]}
        />
      {:else if surface === 'Quick Input'}<h2>Open a connected source</h2>
        <TextField
          label="Source URL"
          bind:value={url}
          placeholder="Jira, Confluence, GitLab or Slack link…"
        /><Button
          label="Import reference"
          disabled={!/^https?:\/\//.test(url)}
          onclick={() => (feedback = 'Sample reference imported')}
        />
      {:else if surface === 'Latest Chat Sessions'}<CommandPalette title="Latest chats" searchable={false} rows={Array.from({length:12},(_,i)=>({id:String(i),label:'Fictional chat '+(i+1),detail:'sample · claude/fictional/model-a · completed · '+(i+1)+(i?' minutes ago':' minute ago')}))} onselect={id=>feedback='Selected fictional chat '+(Number(id)+1)+'; native window activation is outside this browser fixture.'}/>
      {:else if surface === 'Permission Panel'}<PermissionRequest />
      {:else if surface === 'Notification Feed'}<div class="row spread">
          <h2>Notifications</h2>
          <Button label="Clear feed" onclick={() => (notices = [])} />
        </div>
        {#each notices as notice}<div class="inset row spread">
            <strong>{notice}</strong><Button
              label="Dismiss"
              onclick={() => (notices = notices.filter((n) => n !== notice))}
            />
          </div>{:else}<p class="muted">No notifications.</p>{/each}
      {:else if surface === 'Debug Panel'}<Badge label="Action failed" tone="failure" />
        <h2>Repository index could not refresh</h2>
        <p>The last saved index is still available.</p>
        <details>
          <summary>Technical details</summary>
          <pre class="code">operation: refresh_index
result: source_unavailable
repository: sample-repo</pre>
        </details>
        <div class="row">
          <Button label="Dismiss" onclick={() => (feedback = 'Dismissed locally')} /><Button
            label="Open diagnostic chat"
            onclick={() => (feedback = 'Diagnostic context prepared locally')}
          />
        </div>
      {:else if surface === 'Steward Output'}<DocumentView title="Design steward · Latest output" />
      {:else if surface === 'Gmail Wrapper'}<div class="empty">
          <h2>Connected mail window</h2>
          <p class="muted">
            Arbol supplies the native window and account context. Gmail’s own interface is external
            and is not reproduced here.
          </p>
          <Badge label="External interface" />
        </div>
      {:else if surface === 'External Dashboard'}<div class="empty">
          <h2>External dashboard</h2>
          <p class="muted">
            The source snapshot contains the timeline bridge, but not the external dashboard UI.
            This is a documented evidence gap.
          </p>
          <EntityReference title="Native and auxiliary surfaces" />
        </div>{/if}
      {#if feedback}<p class="notice" role="status">{feedback}</p>{/if}
    </div>
  </div>
  <p class="small muted">
    Layout and interaction reference. Native window controls, macOS permissions and cross-window
    synchronization need a platform adapter.
  </p>
</div>
{/if}

<style>
  .native {
    max-width: 760px;
    margin: 24px auto;
  }
  .native:has(.preview-window) {
    max-width: 1120px;
  }
  .preview-content {
    height: 460px;
    position: relative;
  }
  .renderer-problem {
    display: flex;
    align-items: center;
    gap: 12px;
    width: max-content;
    max-width: calc(100% - 36px);
    margin: 0 auto;
    position: absolute;
    inset: auto 0 18px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--inset);
  }
  .window-action {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel);
    color: var(--text);
  }
  .window {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .titlebar {
    min-height: 44px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 8px 16px;
    background: var(--inset);
    border-bottom: 1px solid var(--border);
  }
  .lights {
    color: var(--muted);
    letter-spacing: 3px;
  }
  .content {
    padding: 24px;
  }
  .menu-bar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 28px;
    border: 1px solid var(--border);
    background: var(--inset);
    color: var(--text);
  }
  .tray {
    position: relative;
  }
  .tray summary {
    list-style: none;
    cursor: pointer;
  }
  .tray summary::-webkit-details-marker {
    display: none;
  }
  .tray > summary {
    display: grid;
    place-items: center;
    width: 28px;
    height: 26px;
  }
  .tray[open] > summary,
  .tray-trunks[open] > summary {
    background: var(--selected);
  }
  .tray-icon {
    display: block;
    width: 18px;
    height: 18px;
    mask: var(--tray-icon) center / contain no-repeat;
    background-color: currentColor;
  }
  .tray-badge {
    position: absolute;
    inset-block-start: 4px;
    inset-inline-end: 5px;
    display: grid;
    place-items: center;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    color: var(--inset);
    background: var(--text);
    box-shadow: 0 0 0 1px var(--inset);
    font: 700 8px / 1 system-ui;
  }
  .tray[open] .tray-badge {
    color: var(--selected);
    box-shadow: 0 0 0 1px var(--selected);
  }
  .tray-menu {
    position: absolute;
    z-index: 1;
    inset-inline-end: 0;
    min-width: 110px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel);
    box-shadow: var(--shadow);
  }
  .tray-info {
    display: grid;
    gap: 4px;
    padding: 6px 12px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    white-space: nowrap;
  }
  .tray-trunks {
    position: relative;
  }
  .tray-trunks > summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .trunks-menu {
    inset-block-start: 0;
    inset-inline-end: calc(100% + 4px);
    width: min(220px, 54vw);
  }
  .trunk-check {
    display: inline-block;
    width: 1em;
  }
  .catalogue-message {
    padding: 8px 12px;
    color: var(--muted);
  }
  .tray-command {
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    padding: 8px 12px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
  }
  .tray-update {
    white-space: nowrap;
  }
  .tray-update span {
    margin-inline-start: 8px;
  }
  .tray-command:hover:not(:disabled) {
    background: var(--selected);
  }
  .tray-command:disabled {
    color: var(--muted);
  }
  @media (max-width: 520px) {
    .trunks-menu {
      position: static;
      width: auto;
      margin-block: 4px;
      box-shadow: none;
    }
  }
</style>
