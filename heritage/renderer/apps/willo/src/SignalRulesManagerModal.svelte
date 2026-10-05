<script lang="ts">
  import { Button, Modal } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import { mailApi, type SignalRule } from './mailApi'
  let { onClose, onError }: { onClose:()=>void; onError:(message:string)=>void } = $props()
  let rules=$state<SignalRule[]>([]), loading=$state(true), busy=$state<string|null>(null)
  async function load(){loading=true;try{rules=await mailApi.signalRules()}catch(v){onError(v instanceof Error?v.message:String(v))}finally{loading=false}}
  async function act(rule:SignalRule, action:'enable'|'archive'|'restore'){
    busy=rule.signal_rule_id
    try{
      if(action==='archive') await mailApi.archiveSignalRule(rule.signal_rule_id)
      else if(action==='restore') await mailApi.restoreSignalRule(rule.signal_rule_id)
      else await mailApi.setSignalRuleEnabled(rule.signal_rule_id,!rule.enabled)
      await load()
    }catch(v){onError(v instanceof Error?v.message:String(v))}finally{busy=null}
  }
  onMount(()=>{void load()})
</script>
<Modal title="Signal Rules" subtitle="Future-only email automation" onClose={onClose} width={720}>
 {#snippet children()}<div class="mail-ignored-list">
  {#if loading}<p>Loading Signal Rules…</p>{:else if !rules.length}<p>No Signal Rules yet. Create one from an email's context menu.</p>{:else}
   {#each rules as rule(rule.signal_rule_id)}<div class="mail-ignored-row"><div><b>{rule.name}</b><span>v{rule.version} · {rule.signal_type} · {rule.archived_at?'archived':rule.enabled?'enabled':'disabled'} · future after source #{rule.effective_after_source_seq}</span></div>
    {#if rule.archived_at}<Button onclick={()=>act(rule,'restore')} disabled={busy===rule.signal_rule_id}>{#snippet children()}Restore{/snippet}</Button>
    {:else}<Button onclick={()=>act(rule,'enable')} disabled={busy===rule.signal_rule_id}>{#snippet children()}{rule.enabled?'Disable':'Enable'}{/snippet}</Button><Button onclick={()=>act(rule,'archive')} disabled={busy===rule.signal_rule_id}>{#snippet children()}Archive{/snippet}</Button>{/if}
   </div>{/each}
  {/if}
 </div>{/snippet}
 {#snippet footer()}<Button onclick={onClose}>{#snippet children()}Done{/snippet}</Button>{/snippet}
</Modal>
