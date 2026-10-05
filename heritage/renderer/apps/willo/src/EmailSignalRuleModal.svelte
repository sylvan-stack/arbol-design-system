<script lang="ts">
  import { Button, Modal } from '@arbol/design-system'
  import { mailApi, type EmailAutomationPreview, type MailMessageSummary, type SignalRule,
    type SignalRuleDraft } from './mailApi'

  let { message, preview, existing = null, enriching = false, onClose, onSaved, onError }:
    { message: MailMessageSummary; preview: EmailAutomationPreview; existing?: SignalRule | null; enriching?: boolean;
      onClose:()=>void; onSaved:()=>void; onError:(message:string)=>void } = $props()

  const parsed = $derived(preview.parsed_data)
  const kind = $derived(String(parsed.kind || ''))
  const typeForKind = $derived(kind === 'pipeline.failed' ? 'gitlab.pipeline.failed'
    : kind === 'pipeline.succeeded' ? 'gitlab.pipeline.succeeded'
    : kind === 'merge_request.comment' ? 'gitlab.merge_request.comment'
    : 'gitlab.merge_request.approved')
  let selectedRuleId = $state('new')
  let name = $state('')
  let signalType = $state('')
  let initializedFor = $state('')
  const selectedExisting = $derived(
    existing || preview.matching_rules.find((rule) => rule.signal_rule_id === selectedRuleId) || null,
  )
  $effect(() => {
    const key = `${selectedExisting?.signal_rule_id || 'new'}:${preview.source.content_hash}`
    if (initializedFor === key) return
    initializedFor = key
    name = selectedExisting?.name || `${kind || 'GitLab email'} from ${parsed.project?.path || message.sender_address}`
    signalType = selectedExisting?.signal_type || typeForKind
    tested = null
  })
  let busy = $state(false)
  let tested = $state<any>(null)

  function draft(): SignalRuleDraft {
    const mappings: Record<string, any> = signalType.includes('pipeline') ? {
      project:{kind:'path',path:'parsed.project.path'}, branch:{kind:'path',path:'parsed.branch'},
      commit:{kind:'path',path:'parsed.commit'},
    } : {
      project:{kind:'path',path:'parsed.project.path'}, merge_request_iid:{kind:'path',path:'parsed.merge_request.iid'},
      comment:{kind:'path',path:'parsed.comment'},
    }
    return { name:name.trim(), enabled:true, parser_ref:{id:'email.gitlab',version:1},
      source_scope:{provider:'gitlab'}, conditions:[{path:'parsed.kind',operator:'eq',value:kind}],
      signal_type:signalType, signal_type_schema_version:1, mappings, emission_key:{kind:'source'} }
  }
  async function testRule() {
    busy=true
    try { tested=await mailApi.testSignalRule(preview.source.source_item_id,draft()) }
    catch(value){onError(value instanceof Error?value.message:String(value))} finally{busy=false}
  }
  async function save() {
    busy=true
    try {
      if(selectedExisting) await mailApi.updateSignalRule(selectedExisting.signal_rule_id,draft())
      else await mailApi.createSignalRule(draft())
      onSaved(); onClose()
    } catch(value){onError(value instanceof Error?value.message:String(value))} finally{busy=false}
  }
</script>

<Modal title={selectedExisting ? 'Edit Signal Rule' : 'Create Signal Rule'} subtitle={message.subject} onClose={onClose} width={760}>
  {#snippet children()}
    <div class="mail-rule-editor">
      {#if !existing && preview.matching_rules.length}
        <section><h3>Create or edit</h3><label>Action<select bind:value={selectedRuleId}><option value="new">Create new Rule</option>{#each preview.matching_rules as rule}<option value={rule.signal_rule_id}>Edit “{rule.name}” (v{rule.version})</option>{/each}</select></label></section>
      {/if}
      <section><h3>Sample source</h3><p>{message.sender_address} · <b>{preview.source.content_state}</b></p>{#if enriching}<p class="warning">Loading the rendered Gmail conversation and refreshing extracted data…</p>{/if}</section>
      <section><h3>Extracted data</h3><p>{preview.parse_result.parser_id}@{preview.parse_result.parser_version} · {preview.parse_result.status}</p><pre>{JSON.stringify(parsed,null,2)}</pre></section>
      <section><h3>Rule</h3><label>Name<input bind:value={name} disabled={enriching}></label><label>Signal Type<select bind:value={signalType} disabled={enriching}>{#each preview.available_signal_types as type}<option value={type.name}>{type.name}</option>{/each}</select></label><p>When <code>parsed.kind equals {kind}</code></p></section>
      <section><h3>Activation</h3><p>This version applies only to future Email Source Items. Testing this retained email never emits a Signal.</p></section>
      {#if tested}<section><h3>Test result</h3><pre>{JSON.stringify(tested.signal,null,2)}</pre></section>{/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose} disabled={busy}>{#snippet children()}Cancel{/snippet}</Button>
    <Button onclick={testRule} disabled={busy || enriching || !name.trim()}>{#snippet children()}{busy?'Working…':'Test'}{/snippet}</Button>
    <Button kind="primary" onclick={save} disabled={busy || enriching || !name.trim() || !tested?.matched}>{#snippet children()}{selectedExisting?'Save new version':'Create Rule'}{/snippet}</Button>
  {/snippet}
</Modal>
