<script lang="ts">
  import { untrack } from 'svelte';
  import catalog from './catalog.json';
  import type { FieldSpec } from '../types';
  import WorkspaceShell from '../patterns/WorkspaceShell.svelte';
  import PageHeader from '../patterns/PageHeader.svelte';
  import Collection from '../patterns/Collection.svelte';
  import ConfirmAction from '../patterns/ConfirmAction.svelte';
  import DocumentView from '../patterns/DocumentView.svelte';
  import EntitySummary from '../patterns/EntitySummary.svelte';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Tabs from '../components/Tabs.svelte';
  import Dashboard from '../sections/Dashboard.svelte';
  import ProviderSettings from '../sections/ProviderSettings.svelte';
  import FeatureSettings from '../sections/FeatureSettings.svelte';
  import RecipeEditor from '../sections/RecipeEditor.svelte';
  import BlueprintEditor from '../sections/BlueprintEditor.svelte';
  import SecretsSettings from '../sections/SecretsSettings.svelte';
  import RetrievalWorkspace from '../sections/RetrievalWorkspace.svelte';
  import Monitoring from '../sections/Monitoring.svelte';
  import ConversationWorkspace from '../sections/ConversationWorkspace.svelte';
  import HistoryTree from '../sections/HistoryTree.svelte';
  import ThreadInspector from '../sections/ThreadInspector.svelte';
  import ReviewWorkspace from '../sections/ReviewWorkspace.svelte';
  import StationCollection from '../sections/StationCollection.svelte';
  import AttentionColumn from '../sections/AttentionColumn.svelte';
  import NotificationSettings from '../sections/NotificationSettings.svelte';
  import SourceInbox from '../sections/SourceInbox.svelte';
  import RunDetails from '../sections/RunDetails.svelte';
  import EmailRuleEditor from '../sections/EmailRuleEditor.svelte';
  import TimelineBoard from '../sections/TimelineBoard.svelte';
  import SwimlaneDetails from '../sections/SwimlaneDetails.svelte';
  let { pageId = 'seqoya-dashboard' }: { pageId?: string } = $props();
  let current = $state(untrack(() => pageId));
  let tab = $state('Activation Rules');
  let fullEditor = $state(false);
  let editorDirty = $state(false);
  let pendingDestination = $state<string | null>(null);
  function requestNavigation(destination: string) {
    if (fullEditor && editorDirty) pendingDestination = destination;
    else {
      current = destination;
      fullEditor = false;
      editorDirty = false;
    }
  }
  let artifact = $state('Design System');
  const page = $derived(catalog.find((p) => p.id === current) || catalog[0]);
  const destinations = $derived(
    catalog.filter((p) => p.workspace === page.workspace).map((p) => p.title),
  );
</script>

<WorkspaceShell
  workspace={page.workspace}
  current={page.title}
  {destinations}
  onnavigate={(title) =>
    requestNavigation(
      catalog.find((p) => p.workspace === page.workspace && p.title === title)?.id || current,
    )}
  ><div class="page-content">
    {#key current}
      {#if page.recipe === 'collection'}
        {#if fullEditor}<div class="row">
            <Button label={'← Back to ' + page.title} onclick={() => requestNavigation(current)} />
          </div>
          {#if page.detailRecipe === 'recipe-editor'}<RecipeEditor
              ondirty={(dirty) => (editorDirty = dirty)}
            />{:else}<BlueprintEditor ondirty={(dirty) => (editorDirty = dirty)} />{/if}
        {/if}
        <div hidden={fullEditor}>
          <Collection
            title={page.title}
            description={page.description}
            entity={page.entity}
            items={page.items}
            fields={page.fields as FieldSpec[]}
            view={page.view || 'List'}
            canCreate={page.canCreate !== false}
            canEdit={page.canCreate !== false}
            oncreate={page.detailRecipe ? () => (fullEditor = true) : undefined}
            onedit={page.detailRecipe ? () => (fullEditor = true) : undefined}
          />{#if page.detailRecipe}<div>
              <Button
                label={page.detailRecipe === 'recipe-editor'
                  ? 'Open ordered rule editor'
                  : 'Open structured Blueprint editor'}
                onclick={() => (fullEditor = true)}
              />
            </div>{/if}
        </div>
      {:else}<PageHeader title={page.title} description={page.description} />
        {#if page.recipe === 'dashboard'}<Dashboard />
        {:else if page.recipe === 'providers'}<ProviderSettings />
        {:else if page.recipe === 'features'}<FeatureSettings />
        {:else if page.recipe === 'secrets'}<SecretsSettings />
        {:else if page.recipe === 'retrieval'}<RetrievalWorkspace />
        {:else if page.recipe === 'monitoring'}<Monitoring />
        {:else if page.recipe === 'artifacts'}<div class="split">
            <DocumentView title={artifact} />
            <aside class="panel stack">
              <h2>Artifact corpus</h2>
              {#each ['Design System', 'Architecture', 'Glossary', 'Reconstruction checklist'] as name}<button
                  class="link-button"
                  onclick={() => (artifact = name)}>◫ {name}</button
                >{/each}
            </aside>
          </div>
        {:else if page.recipe === 'document'}<DocumentView />
        {:else if page.recipe === 'stewardship'}<Tabs
            label="Stewardship area"
            items={['Activation Rules', 'Stewards', 'Mandates']}
            bind:value={tab}
          />
          <div class="panel stack">
            <h2>{tab}</h2>
            <EntitySummary
              title={tab === 'Activation Rules'
                ? 'When a review is requested'
                : tab === 'Stewards'
                  ? 'Design steward'
                  : 'Keep interactions consistent'}
              subtitle={tab === 'Activation Rules'
                ? 'Email signal → Design review'
                : tab === 'Stewards'
                  ? 'Mission: maintain shared design contracts'
                  : 'Read source, analyze, report; request permission before external actions'}
              kind="mandate"
              status="Enabled"
            />
            <h3>Authority</h3>
            <p class="muted">
              Read repository and artifact sources. Produce an evidence-backed review.
            </p>
            <Badge label="No standing write permission" tone="warning" />
          </div>
        {:else if page.recipe.startsWith('chat')}<ConversationWorkspace
            empty={page.recipe === 'chat-empty'}
            approval={page.recipe === 'chat-approval'}
          />
        {:else if page.recipe === 'history'}<HistoryTree />
        {:else if page.recipe === 'inspector'}<ThreadInspector />
        {:else if page.recipe === 'review'}<ReviewWorkspace />
        {:else if ['stations', 'agentic-stations', 'stewards', 'compact-stations'].includes(page.recipe)}<div
            class:split={page.recipe === 'stations'}
          >
            <StationCollection
              agentic={page.recipe === 'agentic-stations' || page.recipe === 'stewards'}
              compact={page.recipe === 'compact-stations'}
            />{#if page.recipe === 'stations'}<AttentionColumn />{/if}
          </div>
        {:else if page.recipe === 'attention' || page.recipe === 'spotlight'}<AttentionColumn
            mode={page.recipe === 'attention' ? 'actions' : 'spotlight'}
          />
        {:else if page.recipe === 'notifications'}<NotificationSettings />
        {:else if ['slack', 'telegram', 'email'].includes(page.recipe)}<SourceInbox
            source={page.recipe === 'slack'
              ? 'Slack'
              : page.recipe === 'telegram'
                ? 'Telegram'
                : 'Email'}
          />
        {:else if page.recipe === 'run'}<RunDetails />
        {:else if page.recipe === 'email-rules'}<EmailRuleEditor />
        {:else if page.recipe === 'swimlane-details'}<SwimlaneDetails />
        {:else if ['timeline', 'agenda', 'compact-timeline'].includes(page.recipe)}<TimelineBoard
            compact={page.recipe === 'compact-timeline'}
            initialView={page.recipe === 'agenda' ? 'Agenda' : 'Timeline'}
          />
        {/if}{/if}{/key}
  </div></WorkspaceShell
>

{#if pendingDestination !== null}<ConfirmAction
    title="Discard unsaved changes?"
    description="Your editor draft has not been saved."
    action="Discard changes"
    oncancel={() => (pendingDestination = null)}
    onconfirm={() => {
      current = pendingDestination!;
      pendingDestination = null;
      editorDirty = false;
      fullEditor = false;
    }}
  />{/if}
