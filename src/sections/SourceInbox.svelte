<script lang="ts">
  import { untrack } from 'svelte';
  import TextField from '../components/TextField.svelte';
  import Tabs from '../components/Tabs.svelte';
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let { source = 'Slack' }: { source?: string } = $props();
  let query = $state('');
  let tab = $state(untrack(() => (source === 'Email' ? 'Inbox' : 'Contacts')));
  let selected = $state(0);
  let feedback = $state('');
  let graft = $state(false);
  const threads = [
    {
      title: 'Maya Chen',
      subtitle: 'Review of the shared editor',
      body: 'The create and edit flows now use the same fields. Can we preserve the draft if saving fails?',
    },
    {
      title: 'Design systems',
      subtitle: 'Collection behavior across workspaces',
      body: 'List, table and cards should share query, sort and selection.',
    },
    {
      title: 'Release updates',
      subtitle: 'The design snapshot is ready',
      body: 'The theme registry and UI source snapshot are archived.',
    },
  ];
  const visible = $derived(
    threads.filter((thread, index) => {
      const category =
        tab === 'Ignored'
          ? index === 2
          : tab === 'Contacts' || tab === 'Pinned'
            ? index === 0
            : tab === 'Channels' || tab === 'Chats'
              ? index === 1
              : index < 2;
      return category && thread.title.toLowerCase().includes(query.toLowerCase());
    }),
  );
  $effect(() => {
    if (visible.length && !visible.includes(threads[selected]))
      selected = threads.indexOf(visible[0]);
  });
</script>

<div class="stack">
  <div class="row spread">
    <Tabs
      label="Source category"
      items={source === 'Slack'
        ? ['Contacts', 'Channels', 'Ignored']
        : source === 'Telegram'
          ? ['Contacts', 'Chats', 'Ignored']
          : ['Inbox', 'Pinned', 'Ignored']}
      bind:value={tab}
    /><Button label="Sync" onclick={() => (feedback = 'Synced sample messages just now')} />
  </div>
  <div class="inbox">
    <aside class="panel stack">
      <TextField
        label={'Search cached ' + source + ' conversations'}
        bind:value={query}
        type="search"
      />{#each visible as thread}<button
          class:active={threads[selected] === thread}
          onclick={() => (selected = threads.indexOf(thread))}
          ><strong>{thread.title}</strong><span class="small muted">{thread.subtitle}</span></button
        >{:else}<p class="muted">No matching conversations.</p>{/each}
    </aside>
    {#if visible.length}<article class="panel stack">
        <div class="row spread">
          <h2>{threads[selected].title}</h2>
          <Badge label={tab === 'Ignored' ? 'Ignored' : 'Cached'} />
        </div>
        <p class="small muted">{source} · 5 Oct 2026, 11:42 · Europe/Madrid</p>
        <hr class="rule" />
        <h3>{threads[selected].subtitle}</h3>
        <p>{threads[selected].body}</p>
        <blockquote class="notice">Keep the user’s place through every navigation.</blockquote>
        <div class="row">
          <Button
            label="Load older messages"
            onclick={() => (feedback = 'All sample messages loaded')}
          /><Button
            label="Add to Spotlight"
            onclick={() => (feedback = 'Conversation retained in Spotlight')}
          /><Button label="Create Graft" onclick={() => (graft = true)} />
        </div>
        <p role="status" class="small muted">
          {feedback || 'Reading and curation · This view does not send messages'}
        </p>
      </article>{:else}<div class="panel empty">
        <h3>No conversation selected</h3>
        <p class="muted">Choose another category or clear the search.</p>
      </div>{/if}
  </div>
</div>
{#if graft}<EntityEditor
    entity="Graft"
    initial={{ title: threads[selected].subtitle, description: threads[selected].body }}
    onsave={() => (feedback = 'Graft created locally')}
    onclose={() => (graft = false)}
  />{/if}

<style>
  .inbox {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 16px;
  }
  aside button {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 12px;
  }
  .active {
    background: var(--selected) !important;
  }
  @media (max-width: 1000px) {
    .inbox {
      grid-template-columns: 1fr;
    }
  }
</style>
