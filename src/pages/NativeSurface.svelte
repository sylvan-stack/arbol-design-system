<script lang="ts">
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
  let {
    surface = 'Go to Page',
    trayCatalogueState = 'available',
    trayNewBuild = '',
  }: {
    surface?: string;
    trayCatalogueState?: TrayCatalogueState;
    trayNewBuild?: string;
  } = $props();
  let feedback = $state('');
  let url = $state('');
  let trayOpen = $state(false);
  let trayRunning = $state(true);
  let trayButton = $state<HTMLElement>();
  let rootsOpen = $state(false);
  let rootsButton = $state<HTMLElement>();
  let selectedRoot = $state<string>();
  let trayFeedback = $state('');
  let startedBuild = $state('');
  const updateBuild = $derived(trayNewBuild !== startedBuild ? trayNewBuild : '');
  const fixtureRoots = [
    { name: 'Canopy', current: true },
    { name: 'Grove' },
    { name: 'Nursery', status: 'Preparing' },
    { name: 'Orchard', status: 'Requires App Build 2', unavailable: true },
  ];
  const catalogueMessages = {
    loading: 'Loading Roots…',
    empty: 'No Roots available',
    unavailable: 'Could not read Roots',
  };
  const defaultRoot = $derived(selectedRoot ?? fixtureRoots.find((root) => root.current)?.name);

  function closeTrayOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !trayOpen) return;
    event.preventDefault();
    if (rootsOpen) {
      rootsOpen = false;
      rootsButton?.focus();
    } else {
      trayOpen = false;
      trayButton?.focus();
    }
  }

  function chooseRoot(name?: string) {
    selectedRoot = name;
    trayFeedback = name ? `Default Root for UIs: ${name}` : 'Default for UIs follows the current Root.';
    rootsOpen = false;
    trayOpen = false;
    trayButton?.focus();
  }
  function startNewVersion(build: string) {
    startedBuild = build;
    trayFeedback = `Started Build ${build} in this preview.`;
    rootsOpen = false;
    trayOpen = false;
    trayButton?.focus();
  }

  let notices = $state([
    'Design review complete',
    'Permission needed: read files',
    'Index refreshed',
  ]);
</script>

{#if surface === 'Tray Menu'}
  <div class="native stack">
    <p class="small muted">Browser preview of the Arbol menu bar</p>
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
            {#if updateBuild}
              <button class="tray-command tray-update" onkeydown={closeTrayOnEscape} onclick={() => startNewVersion(updateBuild)}>
                Start new version <span class="small muted">Build {updateBuild}</span>
              </button>
            {/if}
            <details class="tray-roots" bind:open={rootsOpen}>
              <summary class="tray-command" bind:this={rootsButton} onkeydown={closeTrayOnEscape}>
                Roots <span aria-hidden="true">›</span>
              </summary>
              <div class="tray-menu roots-menu">
                {#if trayCatalogueState === 'available'}
                  {#each fixtureRoots as root (root.name)}
                    <button
                      class="tray-command"
                      aria-pressed={defaultRoot === root.name}
                      disabled={root.unavailable}
                      onkeydown={closeTrayOnEscape}
                      onclick={() => chooseRoot(root.name)}
                    >
                      <span class="root-check" aria-hidden="true">{defaultRoot === root.name ? '✓' : ''}</span>
                      {root.name}{root.current ? ' — Current' : ''}{root.status ? ` — ${root.status}` : ''}
                    </button>
                  {/each}
                {:else}
                  <p class="catalogue-message">{catalogueMessages[trayCatalogueState]}</p>
                {/if}
                {#if selectedRoot}
                  <button class="tray-command" onkeydown={closeTrayOnEscape} onclick={() => chooseRoot()}>
                    Use current Root
                  </button>
                {/if}
              </div>
            </details>
            <button class="tray-command" onkeydown={closeTrayOnEscape} onclick={() => (trayRunning = false)}>Quit</button>
          </div>
        </details>
      {/if}
    </div>
    <p class="small muted" role="status">{trayRunning ? trayFeedback : 'Arbol quit in this preview.'}</p>
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
  .tray-roots[open] > summary {
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
  .tray-roots {
    position: relative;
  }
  .tray-roots > summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .roots-menu {
    inset-block-start: 0;
    inset-inline-end: calc(100% + 4px);
    width: min(220px, 54vw);
  }
  .root-check {
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
</style>
