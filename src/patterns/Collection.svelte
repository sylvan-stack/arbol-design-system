<script lang="ts">
  import { untrack } from 'svelte';
  import type { RecordItem, FieldSpec } from '../types';
  import PageHeader from './PageHeader.svelte';
  import EntitySummary from './EntitySummary.svelte';
  import EntityEditor from './EntityEditor.svelte';
  import DetailPane from './DetailPane.svelte';
  import TextField from '../components/TextField.svelte';
  import Select from '../components/Select.svelte';
  import Tabs from '../components/Tabs.svelte';
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import AsyncFeedback from '../components/AsyncFeedback.svelte';
  let {
    title = 'Work items',
    description = 'One collection, consistent actions.',
    entity = 'work item',
    items = [
      {
        id: '1',
        title: 'Restore the design language',
        subtitle: 'Arbol · Shared foundations',
        kind: 'artifact',
        status: 'Running',
      },
      {
        id: '2',
        title: 'Preserve chat drafts',
        subtitle: 'Elma · Continuity',
        kind: 'graft',
        status: 'Planned',
      },
      {
        id: '3',
        title: 'Capture the theme palette',
        subtitle: 'Twelve wood themes',
        kind: 'artifact',
        status: 'Done',
      },
    ],
    fields,
    view = 'List',
    state: initialState = 'ready',
    canCreate = true,
    canEdit = true,
    oncreate,
    onedit,
  }: {
    title?: string;
    description?: string;
    entity?: string;
    items?: RecordItem[];
    fields?: FieldSpec[];
    view?: string;
    state?: string;
    canCreate?: boolean;
    canEdit?: boolean;
    oncreate?: () => void;
    onedit?: (item: RecordItem) => void;
  } = $props();
  let records = $state<RecordItem[]>(untrack(() => items.map((x) => ({ ...x }))));
  let presentation = $state(untrack(() => view));
  let query = $state('');
  let filter = $state('All statuses');
  let sort = $state('Name ↑');
  let selected = $state('');
  let editing = $state<RecordItem | null | undefined>(undefined);
  let feedback = $state('');
  let localState = $state(untrack(() => initialState));
  const visible = $derived(
    records
      .filter(
        (x) =>
          (filter === 'All statuses' || x.status === filter) &&
          `${x.title} ${x.subtitle || ''}`.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === 'Name ↑' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
      ),
  );
  const detail = $derived(records.find((x) => x.id === selected));
  function save(values: Record<string, string>) {
    const item = {
      id: editing?.id || 'sample-' + Date.now(),
      kind: editing?.kind || 'artifact',
      status: values.status || editing?.status || 'Planned',
      ...editing,
      ...values,
      subtitle: values.description || editing?.subtitle || '',
      title: values.title || values.name || 'Untitled',
    };
    records = editing ? records.map((x) => (x.id === editing?.id ? item : x)) : [item, ...records];
    feedback = editing ? 'Changes saved locally' : 'Item created locally';
  }
</script>

<div class="stack">
  <PageHeader
    {title}
    {description}
    count={records.length}
    action={canCreate ? 'New ' + entity : ''}
    onaction={() => (oncreate ? oncreate() : (editing = null))}
  />
  <div class="panel stack">
    <div class="toolbar">
      <div class="grow">
        <TextField
          label={'Search all sample ' + title.toLowerCase()}
          type="search"
          placeholder="Search by name or description…"
          bind:value={query}
        />
      </div>
      <Select
        label="Status"
        options={[
          'All statuses',
          ...new Set(records.map((x) => x.status).filter(Boolean) as string[]),
        ]}
        bind:value={filter}
      /><Select label="Sort" options={['Name ↑', 'Name ↓']} bind:value={sort} />
    </div>
    <Tabs
      label="Collection presentation"
      items={['List', 'Table', 'Cards']}
      bind:value={presentation}
    />{#if localState === 'loading'}<AsyncFeedback state="loading" />
      <div class="stack" aria-hidden="true">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>{:else if localState === 'error'}<AsyncFeedback
        state="error"
        onretry={() => (localState = 'ready')}
      />{:else}{#if localState === 'stale'}<AsyncFeedback
          state="stale"
          onretry={() => (localState = 'ready')}
        />{/if}{#if !records.length}<EmptyState
          title={'No ' + title.toLowerCase() + ' yet'}
          action={canCreate ? 'New ' + entity : ''}
          onclick={() => (oncreate ? oncreate() : (editing = null))}
        />{:else if !visible.length}<EmptyState
          title="No matching items"
          description="Try another query or clear the filters."
          action="Clear filters"
          onclick={() => {
            query = '';
            filter = 'All statuses';
          }}
        />{:else if presentation === 'Table'}<div class="table-wrap">
          <table>
            <caption class="sr-only">{title}</caption><thead
              ><tr
                ><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Details</th
                >{#if canEdit}<th scope="col">Actions</th>{/if}</tr
              ></thead
            ><tbody
              >{#each visible as item}<tr class:selected={item.id === selected}
                  ><td
                    ><button class="link-button" onclick={() => (selected = item.id)}
                      >{item.title}</button
                    ></td
                  ><td><Badge label={item.status || 'Ready'} /></td><td class="small muted"
                    >{item.subtitle}</td
                  >{#if canEdit}<td
                      ><Button
                        label="Edit"
                        title={'Edit ' + item.title}
                        onclick={() => (onedit ? onedit(item) : (editing = item))}
                      /></td
                    >{/if}</tr
                >{/each}</tbody
            >
          </table>
        </div>{:else}<ul class:cards={presentation === 'Cards'} class="clean records">
          {#each visible as item}<li class:selected={item.id === selected}>
              <div class="grow">
                <EntitySummary {...item} onclick={() => (selected = item.id)} />
              </div>
              {#if canEdit}<Button
                  label="Edit"
                  title={'Edit ' + item.title}
                  tone="ghost"
                  onclick={() => (onedit ? onedit(item) : (editing = item))}
                />{/if}
            </li>{/each}
        </ul>{/if}{/if}
    <footer class="row spread small muted">
      <span>{visible.length} of {records.length} sample items · Entire fixture</span><span
        role="status">{feedback}</span
      >
    </footer>
  </div>
  {#if detail}<DetailPane
      title={detail.title}
      subtitle={detail.subtitle || ''}
      onclose={() => (selected = '')}
      ><p>
        {detail.description ||
          'This record is selected by stable ID. Search, sort and view changes retain the selection.'}
      </p>
      {#if canEdit}<div>
          <Button
            label={'Edit ' + entity}
            onclick={() => (onedit ? onedit(detail) : (editing = detail))}
          />
        </div>{/if}</DetailPane
    >{/if}
</div>
{#if editing !== undefined}<EntityEditor
    {entity}
    {fields}
    mode={editing ? 'edit' : 'create'}
    initial={editing
      ? { title: editing.title, description: editing.subtitle || '', status: editing.status || '' }
      : {}}
    onsave={save}
    onclose={() => (editing = undefined)}
  />{/if}

<style>
  .toolbar {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }
  .toolbar > .grow {
    min-width: 200px;
  }
  .records {
    display: grid;
    gap: 0;
  }
  .records li {
    min-height: var(--row-height);
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .records.cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .cards li {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 9px;
    flex-wrap: wrap;
  }
  .selected {
    background: var(--selected);
  }
  footer {
    padding-top: 12px;
  }
  @media (max-width: 800px) {
    .records.cards {
      grid-template-columns: 1fr;
    }
    .records li {
      flex-wrap: wrap;
    }
  }
</style>
