<script lang="ts">
  import ThreadInspector from '../src/chat/ThreadInspector.svelte'
  let exchange = $state('first')
  let open = $state(true)
</script>
<button onclick={() => exchange = 'second'}>Select second Exchange</button>
<button onclick={() => exchange = 'empty'}>Select empty Exchange</button>
<button onclick={() => exchange = 'unavailable'}>Select unavailable Exchange</button>
<button onclick={() => exchange = 'slow'}>Select slow Exchange</button>
{#if open}<ThreadInspector sessionId="session" exchangeId={exchange} onClose={() => open = false} />{/if}
