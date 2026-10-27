<script lang="ts">
  import ElmaFrame from './ElmaFrame.svelte';
  import PinnedMessage from './PinnedMessage.svelte';
  import HistoryTree from './HistoryTree.svelte';
  import ResponseReader from './ResponseReader.svelte';
  import { ELMA_RESPONSE_FIXTURE } from '../fixtures/elma-response';
  import Composer from './Composer.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  import Modal from '../patterns/Modal.svelte';
  let {
    empty = false,
    approval = false,
    history = false,
  }: { empty?: boolean; approval?: boolean; history?: boolean } = $props();
  let messages = $state([
    'A fictional first prompt',
    'Compare the useful shared patterns',
    'Keep the interface familiar.',
  ]);
  let draft = $state(''),
    composerOpen = $state(false),
    reader = $state<{ scrollToEdge: (edge: 'top' | 'bottom') => void }>();
  let current = $state(2),
    hasMessages = $state(false),
    historyOpen = $state(false);
  $effect(() => {
    historyOpen = history;
  });
  const shown = $derived(!empty || hasMessages);
  const count = $derived(shown ? messages.length : 0);
  const route = { driver: 'claude', subscription: 'fictional', model: 'model-a', effort: 'high' };
  function keys(event: KeyboardEvent) {
    if (event.metaKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      historyOpen = !historyOpen;
    } else if (!historyOpen && event.metaKey && event.key === '[') {
      event.preventDefault();
      current = Math.max(0, current - 1);
    } else if (!historyOpen && event.metaKey && event.key === ']') {
      event.preventDefault();
      current = Math.min(count - 1, current + 1);
    }
  }
</script>

<svelte:window onkeydown={keys} />
<ElmaFrame
  fitted
  title={shown ? 'A fictional conversation' : 'New Chat'}
  total={count}
  turn={current + 1}
  hasChat={shown}
  ongoing={shown}
  repository="sample"
  {route}
  repositories={[
    { name: 'sylvan-stack', folder: '/fictional/readonly' },
    { name: 'sample', folder: '/fictional/readonly/sample' },
  ]}
  routes={[{ driver: 'claude', subscription: 'fictional' }]}
  inputTokens={shown ? 9100 : 0}
  outputTokens={shown ? 2700 : 0}
  onolder={() => (current = Math.max(0, current - 1))}
  onnewer={() => (current = Math.min(count - 1, current + 1))}
  onhistory={() => (historyOpen = true)}
>
  {#if shown}<PinnedMessage
      text={messages[current]}
      index={current + 1}
      total={count}
      onolder={() => current--}
      onnewer={() => current++}
      onhistory={() => (historyOpen = true)}
    /><ResponseReader
      bind:this={reader}
      identity={'fictional:' + current}
      response={{
        blocks: ELMA_RESPONSE_FIXTURE,
        acceptedAt: '2026-10-27T09:30:00Z',
        startedAt: '2026-10-27T09:30:02Z',
        endedAt: '2026-10-27T09:30:12Z',
      }}
    />{/if}
  {#if approval}<p class="boundary">
      Advanced Root proposal: tool approvals are outside First Sapling.
    </p>
    <PermissionRequest />{/if}
  <Composer
    firstSapling
    empty={!shown}
    repository="sample"
    {route}
    context={String(current)}
    bind:value={draft}
    bind:expanded={composerOpen}
    onTop={() => reader?.scrollToEdge('top')}
    onBottom={() => reader?.scrollToEdge('bottom')}
    onsend={(text) => {
      messages = [...messages, text];
      current = messages.length - 1;
      hasMessages = true;
      draft = '';
      composerOpen = false;
    }}
  />
  {#if historyOpen}<Modal
      title={`History · ${count} turns`}
      onclose={() => (historyOpen = false)}
      initialFocus="button[data-history-row]"
      ><HistoryTree
        items={messages.map((message, i) => ({ id: String(i), number: i + 1, message }))}
        selected={String(current)}
        onselect={(id) => {
          current = Number(id);
          historyOpen = false;
        }}
      /></Modal
    >{/if}
</ElmaFrame>

<style>
  .boundary {
    color: var(--warning);
    padding: 12px 24px;
  }
</style>
