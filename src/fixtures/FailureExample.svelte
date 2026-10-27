<script lang="ts">
 import Response from '../sections/Response.svelte';
 import {signInCommand,type ExchangeError} from '../sections/elma-response';
 let {mode='limit'}:{mode?:string}=$props();
 let action=$state('');
 const error=$derived<ExchangeError>(mode==='signin'?{code:'credential_rejected',message:'Fictional account session expired'}:mode==='unknown'?{code:'future_vendor_code',message:'A fictional future failure.'}:{code:'rate_limited',message:'Fictional quota reached',retryAfterSeconds:3600});
</script>
<Response blocks={[{id:'partial',kind:'text',text:'The partial answer remains available.'}]} statusLabel="Failed" endedAt={mode==='missing-time'?undefined:'2026-10-27T14:30:00Z'} {error} signIn={signInCommand('claude','fictional')} onretry={mode==='earlier'?undefined:()=>action='Retry selected in fixture; no agent was started.'} oncontinue={mode==='earlier'?undefined:()=>action='Continue selected in fixture; no message was sent.'} failureBusy={mode==='busy'}/>
{#if action}<p role="status">{action}</p>{/if}
