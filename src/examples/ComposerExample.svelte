<script lang="ts">
  import { untrack } from 'svelte';
  import Composer from '../sections/Composer.svelte';
  let {
    empty = false,
    value = '',
    readOnly = false,
    busy = false,
    problem = '',
    changed = false,
    recover = false,
  }: {
    empty?: boolean;
    value?: string;
    readOnly?: boolean;
    busy?: boolean;
    problem?: string;
    changed?: boolean;
    recover?: boolean;
  } = $props();
  let text = $state(untrack(()=>value)),
    expanded = $state(false),
    receipt = $state('');
  let edge = $state('');
  let conflict=$state(untrack(()=>changed?{mine:'My fictional changes',theirs:'A fictional edit from another window'}:null));
  let recovery=$state<string|null>(untrack(()=>recover?'Fictional unsaved text from this window':null));
</script>

<div class="example" style="--elma-reading-width:720px">
  {#if !empty}<div class="answer">
      A fictional saved answer. The composer owns only presentation; its parent owns the Draft.
    </div>{/if}
  <Composer
    firstSapling
    {empty}
    readOnly={readOnly||recovery!==null}
    {recovery}
    onRestore={()=>{text=recovery??text;recovery=null;}}
    onDiscardRecovery={()=>recovery=null}
    {busy}
    {problem}
    {conflict}
    onKeepMine={()=>conflict=null}
    onTakeTheirs={()=>{text=conflict?.theirs??text;conflict=null;}}
    repository="sample"
    route={{ driver: 'claude', subscription: 'fictional', model: 'model-a', effort: 'high' }}
    bind:value={text}
    bind:expanded
    status={readOnly ? 'Loading Draft…' : busy ? 'Waiting for the backend…' : ''}
    onTop={() => (edge = 'top')}
    onBottom={() => (edge = 'bottom')}
    onsend={(value) => {
      receipt = value;
      text = '';
      expanded = false;
    }}
  />
  {#if receipt}<p role="status">Fictional message received: {receipt}</p>{/if}
  {#if edge}<p role="status">Scroll requested: {edge}</p>{/if}
</div>

<style>
  .example {
    min-height: 620px;
    display: flex;
    flex-direction: column;
  }
  .answer {
    flex: 1;
    padding: 24px;
    max-width: 720px;
    margin: auto;
  }
</style>
