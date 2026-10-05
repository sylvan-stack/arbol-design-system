<script lang="ts">
  import Composer from './Composer.svelte';
  import Response from './Response.svelte';
  import Badge from '../components/Badge.svelte';
  import Tabs from '../components/Tabs.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  let { empty = false, approval = false }: { empty?: boolean; approval?: boolean } = $props();
  let messages = $state<string[]>([]);
  let turn = $state('Turn 3');
</script>

<div class="stack readable">
  <div class="row spread">
    <span class="mono muted">arbol / Writing assistant / Medium</span><Badge
      label={empty ? 'New chat' : 'Ongoing'}
    />
  </div>
  {#if empty && !messages.length}<div class="empty">
      <h1>What would you like to work on?</h1>
      <p class="muted">Start with a question, task, or connected entity.</p>
    </div>{:else}<Tabs
      label="Conversation turn"
      items={['Turn 1', 'Turn 2', 'Turn 3']}
      bind:value={turn}
    />
    <div class="inset">
      <p class="eyebrow">Your message · {turn}</p>
      <p>Help me preserve the useful parts of this interface.</p>
    </div>
    <Response />{/if}{#each messages as message}<div class="inset">
      <strong>You</strong>
      <p>{message}</p>
    </div>{/each}{#if approval}<PermissionRequest />{/if}<Composer
    onsend={(text) => (messages = [...messages, text])}
  />
</div>
