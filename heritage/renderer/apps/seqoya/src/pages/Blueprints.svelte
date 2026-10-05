<script lang="ts">
  import { onMount } from 'svelte'
  import { api, type Blueprint, type BlueprintDraft, type BlueprintInput, type BlueprintOutput, type KnBrainRecipe } from '../api'
  import './settingsCrud.css'

  let blueprints=$state<Blueprint[]>([]), recipes=$state<KnBrainRecipe[]>([]), loading=$state(true), busy=$state<string|null>(null), error=$state<string|null>(null), editing=$state<string|null>(null)
  let name=$state(''), summary=$state(''), instructions=$state(''), doneWhen=$state('')
  let recipePolicy=$state<Blueprint['recipe_policy']>('inherit'), recipeId=$state(''), maxMinutes=$state<number|undefined>(undefined), restrictionsText=$state(''), metadataText=$state('{}')
  let inputs=$state<BlueprintInput[]>([]), outputs=$state<BlueprintOutput[]>([])
  const message=(v:unknown)=>v instanceof Error?v.message:String(v)
  const lineList=(v:string)=>v.split(/\n|,/).map(x=>x.trim()).filter(Boolean)
  async function load(){loading=true;error=null;try{[blueprints,recipes]=await Promise.all([api.blueprints.list(),api.knowledge.brainRecipes()])}catch(v){error=message(v)}finally{loading=false}}
  onMount(()=>{void load()})
  function reset(){editing=null;name='';summary='';instructions='';doneWhen='';recipePolicy='inherit';recipeId='';maxMinutes=undefined;restrictionsText='';metadataText='{}';inputs=[];outputs=[]}
  function edit(b:Blueprint){editing=b.blueprint_id;name=b.name;summary=b.summary;instructions=b.instructions;doneWhen=b.done_when;recipePolicy=b.recipe_policy;recipeId=b.brain_recipe_id||'';maxMinutes=b.max_minutes??undefined;restrictionsText=b.restrictions.join('\n');metadataText=JSON.stringify(b.metadata||{},null,2);inputs=b.inputs.map(v=>({...v}));outputs=b.outputs.map(v=>({...v,must:[...v.must]}))}
  function addInput(){inputs=[...inputs,{name:'',type:'string',required:true}]}
  function patchInput(i:number,p:Partial<BlueprintInput>){inputs=inputs.map((v,n)=>n===i?{...v,...p}:v)}
  function addOutput(){outputs=[...outputs,{artifact:'',must:[]}]}
  function patchOutput(i:number,p:Partial<BlueprintOutput>){outputs=outputs.map((v,n)=>n===i?{...v,...p}:v)}
  async function save(){
    if(!name.trim())return
    let metadata:Record<string,unknown>
    try{metadata=JSON.parse(metadataText||'{}');if(!metadata||Array.isArray(metadata)||typeof metadata!=='object')throw new Error()}catch{error='Metadata must be a JSON object.';return}
    if(recipePolicy!=='inherit'&&!recipeId){error='Choose a Brain Recipe for the selected recipe policy.';return}
    const draft:BlueprintDraft={name:name.trim(),summary,instructions,status:'active',inputs:inputs.map(v=>({...v,name:v.name.trim(),type:v.type.trim()})).filter(v=>v.name),outputs:outputs.map(v=>({...v,artifact:v.artifact.trim()})).filter(v=>v.artifact),done_when:doneWhen,restrictions:lineList(restrictionsText),recipe_policy:recipePolicy,brain_recipe_id:recipeId||null,max_minutes:maxMinutes??null,metadata,corpus_path:''}
    busy=editing||'create';error=null
    try{if(editing)await api.blueprints.update(editing,draft);else await api.blueprints.create(draft);reset();await load()}catch(v){error=message(v)}finally{busy=null}
  }
  async function remove(b:Blueprint){if(!confirm(`Delete Blueprint “${b.name}” from the Mycel Blueprint corpus?`))return;busy=b.blueprint_id;try{await api.blueprints.remove(b.blueprint_id);if(editing===b.blueprint_id)reset();await load()}catch(v){error=message(v)}finally{busy=null}}
</script>
<div class="settings-page">
  <header><div><h2>Blueprints</h2><p>All Blueprints are read from and written to <code>~/Artifacts/mycel/blueprints</code>. YAML frontmatter is the typed contract; the Markdown body is the executable instruction set.</p></div><button class="reload" onclick={load} disabled={loading}>{loading?'Loading…':'Reload'}</button></header>
  {#if error}<div class="error">{error}</div>{/if}
  <form class="settings-form" onsubmit={(e)=>{e.preventDefault();void save()}}>
    <div class="form-heading">{editing?'Edit corpus Blueprint':'New corpus Blueprint'}</div>
    <label><span>Name</span><input bind:value={name} placeholder="review-release" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
    <label><span>File</span><input value={`${name||'blueprint-name'}.md`} disabled /></label>
    <label class="wide"><span>Summary</span><textarea bind:value={summary} rows="2" placeholder="One sentence describing input → outcome."></textarea></label>
    <label><span>Recipe policy</span><select bind:value={recipePolicy}><option value="inherit">recipe: inherit</option><option value="default">default-recipe fallback</option><option value="pinned">Hard-pin recipe</option></select></label>
    <label><span>Brain Recipe</span><select bind:value={recipeId} disabled={recipePolicy==='inherit'}><option value="">No recipe</option>{#each recipes as recipe}<option value={recipe.name}>{recipe.name} · {recipe.ip_name} / {recipe.model}</option>{/each}</select></label>
    <label><span>Maximum run time (minutes)</span><input type="number" min="1" bind:value={maxMinutes} /></label><label><span>Restrictions (one per line)</span><textarea bind:value={restrictionsText} rows="3" placeholder="no-repo-edit"></textarea></label>
    <fieldset class="wide"><legend>Typed inputs</legend><div class="rule-list">{#each inputs as input,i}<div class="definition-grid"><label><span>Name</span><input value={input.name} oninput={e=>patchInput(i,{name:e.currentTarget.value})}/></label><label><span>Type</span><input value={input.type} oninput={e=>patchInput(i,{type:e.currentTarget.value})} placeholder="string, repo, enum [a, b]"/></label><label class="check"><input type="checkbox" checked={input.required} onchange={e=>patchInput(i,{required:e.currentTarget.checked})}/><span>Required</span></label><label><span>Default</span><input value={input.default||''} oninput={e=>patchInput(i,{default:e.currentTarget.value})}/></label><label class="wide"><span>Description</span><input value={input.description||''} oninput={e=>patchInput(i,{description:e.currentTarget.value})}/></label><button type="button" class="danger" onclick={()=>inputs=inputs.filter((_,n)=>n!==i)}>Remove input</button></div>{/each}</div><button type="button" onclick={addInput}>Add input</button></fieldset>
    <fieldset class="wide"><legend>Declared outputs</legend><div class="rule-list">{#each outputs as output,i}<div class="definition-grid"><label><span>Artifact path/template</span><input value={output.artifact} oninput={e=>patchOutput(i,{artifact:e.currentTarget.value})} placeholder={'{ticket_dir}/review.md'}/></label><label><span>Observable must invariants</span><input value={output.must.join(', ')} oninput={e=>patchOutput(i,{must:lineList(e.currentTarget.value)})}/></label><button type="button" class="danger" onclick={()=>outputs=outputs.filter((_,n)=>n!==i)}>Remove output</button></div>{/each}</div><button type="button" onclick={addOutput}>Add output</button></fieldset>
    <label class="wide"><span>Done when</span><textarea bind:value={doneWhen} rows="3" placeholder="A truthful, checkable completion gate over the declared outputs."></textarea></label>
    <label class="wide"><span>Markdown instruction body</span><textarea bind:value={instructions} rows="16" placeholder="# Blueprint: Human Name&#10;&#10;## Goal&#10;...&#10;&#10;## Process&#10;...&#10;&#10;## Quality bar&#10;..."></textarea></label>
    <label class="wide"><span>Metadata (JSON)</span><textarea class="code compact" bind:value={metadataText} rows="4"></textarea></label>
    <div class="form-actions"><button class="primary" type="submit" disabled={busy!==null||!name.trim()}>{busy===(editing||'create')?'Saving…':editing?'Save corpus file':'Create Blueprint file'}</button>{#if editing}<button type="button" onclick={reset}>Cancel</button>{/if}</div>
  </form>
  <div class="card-list">{#each blueprints as b (b.blueprint_id)}<article><div class="card-summary"><div class="card-title"><strong>{b.name}</strong><div class="meta"><span class="badge" data-status="active">corpus</span><span>{b.inputs.length} inputs</span><span>{b.outputs.length} outputs</span><span>{b.recipe_policy}{b.brain_recipe_id?` · ${b.brain_recipe_id}`:''}</span><span>{b.corpus_path}</span></div></div><div class="card-actions"><button onclick={()=>edit(b)}>Edit</button><button class="danger" onclick={()=>remove(b)}>Delete</button></div></div>{#if b.summary}<p class="description">{b.summary}</p>{/if}</article>{:else}<div class="empty">{loading?'Loading Blueprints…':'No role: blueprint files found in ~/Artifacts/mycel/blueprints.'}</div>{/each}</div>
</div>
