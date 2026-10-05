<script lang="ts">
  import CommandPalette from '../patterns/CommandPalette.svelte';
  import EntityPicker from '../patterns/EntityPicker.svelte';
  import RelationshipEditor from '../patterns/RelationshipEditor.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import TextField from '../components/TextField.svelte';
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  import StationCollection from '../sections/StationCollection.svelte';
  import DocumentView from '../patterns/DocumentView.svelte';
  let { surface = 'Go to Page' }: { surface?: string } = $props();
  let feedback = $state('');
  let url = $state('');
  let notices = $state([
    'Design review complete',
    'Permission needed: read files',
    'Index refreshed',
  ]);
</script>

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
      {:else if surface === 'Latest Chat Sessions'}<StationCollection compact />
      {:else if surface === 'Permission Panel'}<PermissionRequest />
      {:else if surface === 'Tray Menu'}<Badge
          label="Core connected"
          tone="success"
        />{#each ['Go to page…', 'New chat', 'Show notifications', 'Build status', 'Restart services', 'Rebuild application', 'Open diagnostics', 'Quit Arbol'] as command}<button
            class="tray-command"
            onclick={() => (feedback = command + ' · Preview only')}>{command}</button
          >{/each}
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
  .tray-command {
    text-align: left;
    padding: 8px 12px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
  }
  .tray-command:hover {
    background: var(--selected);
  }
</style>
