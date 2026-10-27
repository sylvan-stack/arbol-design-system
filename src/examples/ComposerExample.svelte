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
    pasting = false,
    status = '',
  }: {
    empty?: boolean;
    value?: string;
    readOnly?: boolean;
    busy?: boolean;
    problem?: string;
    changed?: boolean;
    recover?: boolean;
    pasting?: boolean;
    status?: string;
  } = $props();
  let text = $state(untrack(()=>value)),
    expanded = $state(false),
    receipt = $state('');
  let edge = $state('');
  let conflict=$state(untrack(()=>changed?{mine:'My fictional changes',theirs:'A fictional edit from another window'}:null));
  let recovery=$state<string|null>(untrack(()=>recover?'Fictional unsaved text from this window':null));
  let savingPaste=$state(untrack(()=>pasting)),queued=$state(false);
  function send(value:string){if(savingPaste){queued=true;return;}receipt=value;text='';expanded=false;}
  function finishPaste(){text=text.replace('fictional pasted text','[Pasted text (10,000 characters)](</fictional/root/pastes/example.txt>)');savingPaste=false;if(queued){queued=false;send(text);}}
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
    status={status||(savingPaste?'Saving pasted text…':readOnly ? 'Loading Draft…' : busy ? 'Waiting for the backend…' : '')}
    onTop={() => (edge = 'top')}
    onBottom={() => (edge = 'bottom')}
    onsend={send}
  />
  {#if savingPaste}<button onclick={finishPaste}>Complete fictional paste save</button>{/if}
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
