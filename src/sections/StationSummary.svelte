<script lang="ts">
  import { untrack } from 'svelte';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import TextField from '../components/TextField.svelte';
  let {
    title = 'Reconstruct the design system',
    status = 'Running',
    unread = false,
    ongoing = true,
    inElma = false,
    density = 'full',
    failure = '',
    preview = 'Inspecting the shared components and interaction contracts…',
  }: {
    title?: string;
    status?: string;
    unread?: boolean;
    ongoing?: boolean;
    inElma?: boolean;
    density?: string;
    failure?: string;
    preview?: string;
  } = $props();
  let name = $state(untrack(() => title));
  let draft = $state(untrack(() => title));
  let editing = $state(false);
  let feedback = $state('');
</script>

<article class="station" class:compact={density !== 'full'}>
  <div class="stack" style="gap:10px">
    <div class="row">
      <Badge
        label={status}
        tone={status === 'Running'
          ? 'working'
          : status === 'Failed'
            ? 'failure'
            : status === 'Complete'
              ? 'success'
              : 'neutral'}
      />{#if unread}<Badge label="Unread" />{/if}{#if ongoing}<span class="small muted"
          >Ongoing</span
        >{/if}{#if inElma}<span class="pill">Open in Elma</span>{/if}
    </div>
    {#if editing}<TextField label="Chat title" bind:value={draft} />
      <div class="row">
        <Button
          label="Save title"
          disabled={!draft.trim()}
          onclick={() => {
            name = draft;
            editing = false;
          }}
        /><Button
          label="Cancel"
          onclick={() => {
            draft = name;
            editing = false;
          }}
        />
      </div>{:else}<button class="title" onclick={() => (feedback = 'Opened in the local preview')}
        >{name}</button
      >{/if}{#if density !== 'minimal'}<p class="small muted">{failure || preview}</p>
      <span class="small mono muted">arbol · Writing assistant · 4 min ago</span
      >{/if}{#if density === 'full'}<hr class="rule" />
      <div class="row spread">
        <span class="small muted"
          >{status === 'Draft' ? 'Not sent · Local draft' : '12.8k tokens · 3 tool calls'}</span
        >
        <div class="row">
          <Button
            label={failure ? 'Retry' : 'Open chat'}
            onclick={() =>
              (feedback = failure ? 'Retry queued locally' : 'Opened in the local preview')}
          /><Button label="Rename" tone="ghost" onclick={() => (editing = true)} />
        </div>
      </div>{/if}{#if feedback}<small role="status">{feedback}</small>{/if}
  </div>
</article>

<style>
  .station {
    padding: 20px;
    border: 1px solid var(--border);
    border-top: 2px solid var(--accent);
    border-radius: 12px;
    background: linear-gradient(130deg, var(--selected), transparent 55%), var(--panel);
  }
  .station.compact {
    padding: 12px;
  }
  .title {
    font-weight: 600;
    font-size: 16px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--text);
    text-align: left;
    min-height: 32px;
  }
</style>
