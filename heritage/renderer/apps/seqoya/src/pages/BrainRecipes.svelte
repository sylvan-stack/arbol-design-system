<script lang="ts">
  import { providerDisplayName } from '../../../../packages/design-system/src/providers'
  import { onMount } from 'svelte'
  import { api, type Ip, type Repo, type KnBrainRecipe, type ModelOption, type BrainRecipeAssignmentConfig,
    type BrainRecipeRule, type BrainRecipeCondition, type BrainRecipeRole, type BrainRecipeRoleAssignment } from '../api'
  import { THINKING_LEVELS, availableModelOptions } from '../constants'
  import './settingsCrud.css'

  let recipes = $state<KnBrainRecipe[]>([])
  let configs = $state<BrainRecipeAssignmentConfig[]>([])
  let ips = $state<Ip[]>([])
  let repos = $state<Repo[]>([])
  let globalDefault = $state('')
  let recipeRoles = $state<BrainRecipeRole[]>([])
  let roleAssignments = $state<BrainRecipeRoleAssignment[]>([])
  let selectedRole = $state('')
  let editing = $state('')
  let editorOpen = $state(false)
  let name = $state('')
  let defaultIp = $state('')
  let defaultModel = $state('')
  let defaultThinking = $state('none')
  let fallbackPolicy = $state<'global' | 'local' | 'null'>('global')
  let defaultRecipes = $state<string[]>([])
  let rules = $state<BrainRecipeRule[]>([])
  let modelCatalogs = $state<Record<string, ModelOption[]>>({})
  let modelLoading = $state<Record<string, boolean>>({})
  let loading = $state(true)
  let loadingRegistry = $state(false)
  let saving = $state(false)
  let deleting = $state('')
  let deleteCandidate = $state<KnBrainRecipe | null>(null)
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  const message = (e: unknown) => e instanceof Error ? e.message : String(e)
  let loadVersion = 0
  let editorDataPromise: Promise<void> | null = null
  const modelRequests = new Map<string, Promise<void>>()

  const routeIps = $derived(ips.filter(i => !i.deprecated))
  const displayedRecipes = $derived(Array.from(new Map([...recipes, ...configs.map(c => ({ name: c.recipe_name, ip_name: c.ip_name || '', model: c.model || '', thinking: c.thinking }))].map(r => [r.name, r])).values()))
  const recipeOptions = $derived(displayedRecipes.filter(r => r.name !== (editing || name)).map(r => r.name))
  const repoOptions = $derived(Array.from(new Set(repos.map(repo => repo.name).filter(Boolean))).sort((a, b) => a.localeCompare(b)))
  const completeRule = (rule: BrainRecipeRule) => rule.conditions.every(c => c.condition_value.trim())
    && Boolean((rule.ip_name && rule.model) || (rule.recipes.length && rule.recipes.every(Boolean)))
  const canSave = $derived(Boolean(name.trim() && rules.length > 0 && rules.every(completeRule)
    && (fallbackPolicy !== 'local' || Boolean((defaultIp && defaultModel) || (defaultRecipes.length && defaultRecipes.every(Boolean))))))

  async function load() {
    const version = ++loadVersion
    loading = true; loadingRegistry = true; error = null

    // Infer-backed recipes can require process startup. Start that lookup in
    // parallel, but do not make the DB-backed page wait for it.
    void api.knowledge.brainRecipes().then(listed => {
      if (version === loadVersion) recipes = listed
    }).catch(e => {
      if (version === loadVersion) error = message(e)
    }).finally(() => {
      if (version === loadVersion) loadingRegistry = false
    })

    try {
      const assignments = await api.brainRecipes.assignments()
      if (version !== loadVersion) return
      configs = assignments.recipes
      globalDefault = assignments.global_default_recipe || ''
      recipeRoles = assignments.roles || []; roleAssignments = assignments.role_assignments || []
    } catch (e) {
      if (version === loadVersion) error = message(e)
    } finally {
      if (version === loadVersion) loading = false
    }
  }
  onMount(load)

  function loadEditorData() {
    if (editorDataPromise) return editorDataPromise
    editorDataPromise = Promise.all([api.ips(), api.repos()]).then(([ipList, repoList]) => {
      ips = ipList; repos = repoList
    }).catch(e => {
      editorDataPromise = null
      error = message(e)
      throw e
    })
    return editorDataPromise
  }

  function loadModels(ipName: string) {
    if (!ipName || Object.hasOwn(modelCatalogs, ipName)) return Promise.resolve()
    const pending = modelRequests.get(ipName)
    if (pending) return pending
    modelLoading = { ...modelLoading, [ipName]: true }
    const request = api.fetchIpModels({ ip_name: ipName }).then(value => {
      modelCatalogs = { ...modelCatalogs, [ipName]: value.models || [] }
    }).catch(() => {
      const ip = ips.find(v => v.name === ipName)
      modelCatalogs = { ...modelCatalogs, [ipName]: availableModelOptions(ip?.provider || '') }
    }).finally(() => {
      modelLoading = { ...modelLoading, [ipName]: false }
      modelRequests.delete(ipName)
    })
    modelRequests.set(ipName, request)
    return request
  }
  function models(ipName: string, current = '') {
    const base = modelCatalogs[ipName] || []
    return current && !base.some(m => m.value === current)
      ? [{ value: current, label: `${current} (current)` }, ...base] : base
  }
  function blankCondition(): BrainRecipeCondition { return { condition_type: 'ip', operator: 'equals', condition_value: '', join: 'and' } }
  function blankRule(): BrainRecipeRule {
    return { conditions: [], ip_name: '', model: '', thinking: 'none', recipes: [] }
  }
  function resetEditor() {
    editorOpen = false; editing = ''; name = ''; selectedRole = ''; defaultIp = ''; defaultModel = ''; defaultThinking = 'none'; fallbackPolicy = 'global'; defaultRecipes = []; rules = []
    error = null
  }
  function newRecipe() {
    resetEditor(); note = null; rules = [blankRule()]; editorOpen = true
    void loadEditorData().catch(() => {})
  }
  function editRecipe(recipe: KnBrainRecipe) {
    editorOpen = true
    const config = configs.find(c => c.recipe_name === recipe.name)
    editing = recipe.name; name = recipe.name
    selectedRole = roleAssignments.find(a => a.recipe_name === recipe.name)?.role_key || ''
    const configuredIp = config?.ip_name || recipe.ip_name || ''
    const configuredModel = config?.model || recipe.model || ''
    const configuredThinking = config?.thinking || recipe.thinking || 'none'
    defaultIp = configuredIp
    defaultModel = configuredModel
    defaultThinking = configuredThinking
    fallbackPolicy = config?.fallback_policy || 'global'
    defaultRecipes = [...(config?.recipes || [])]
    rules = (config?.assignments || []).map(r => ({
      ...r,
      conditions: (r.conditions || []).map(c => ({ ...c })),
      recipes: [...(r.recipes || [])],
    }))
    // Recipes created before assignments became mandatory stored their model
    // only in Infer or in the old local-default columns. Present that model as
    // an unconditional assignment so the editor never appears to lose it.
    if (!rules.length && configuredIp && configuredModel) {
      rules = [{ conditions: [], ip_name: configuredIp, model: configuredModel,
        thinking: configuredThinking, recipes: [] }]
    }
    note = null; error = null
    void loadEditorData().then(() => {
      void loadModels(defaultIp); rules.forEach(r => void loadModels(r.ip_name))
    }).catch(() => {})
  }
  function addRule() { rules = [...rules, blankRule()] }
  function removeRule(index: number) { rules = rules.filter((_, i) => i !== index) }
  function patchRule(index: number, patch: Partial<BrainRecipeRule>) { rules = rules.map((r, i) => i === index ? { ...r, ...patch } : r) }
  function patchCondition(ruleIndex: number, conditionIndex: number, patch: Partial<BrainRecipeCondition>) {
    patchRule(ruleIndex, { conditions: rules[ruleIndex].conditions.map((c, i) => i === conditionIndex ? { ...c, ...patch } : c) })
  }
  function addCondition(index: number) { patchRule(index, { conditions: [...rules[index].conditions, blankCondition()] }) }
  function removeCondition(ruleIndex: number, conditionIndex: number) { patchRule(ruleIndex, { conditions: rules[ruleIndex].conditions.filter((_, i) => i !== conditionIndex) }) }
  function addRecipeTarget(index: number) { patchRule(index, { recipes: [...rules[index].recipes, ''], ip_name: '', model: '' }) }
  function patchRecipeTarget(index: number, targetIndex: number, value: string) { patchRule(index, { recipes: rules[index].recipes.map((r, i) => i === targetIndex ? value : r) }) }
  function removeRecipeTarget(index: number, targetIndex: number) { patchRule(index, { recipes: rules[index].recipes.filter((_, i) => i !== targetIndex) }) }
  async function save() {
    if (!canSave) return
    saving = true; error = null; note = null
    try {
      const savedName = name.trim()
      const cleanRules = rules.map(rule => ({ ...rule, recipes: rule.recipes.filter(Boolean) }))
      const registryTarget = defaultIp && defaultModel ? { ip_name: defaultIp, model: defaultModel, thinking: defaultThinking }
        : cleanRules.find(rule => rule.ip_name && rule.model)
      if (registryTarget) await api.knowledge.brainRecipeSave({ name: savedName, ip_name: registryTarget.ip_name, model: registryTarget.model, thinking: registryTarget.thinking })
      await api.brainRecipes.save({ recipe_name: savedName, old_recipe_name: editing || undefined,
        default: { ip_name: defaultIp || null, model: defaultModel || null, thinking: defaultThinking,
          fallback_policy: fallbackPolicy, recipes: defaultRecipes.filter(Boolean) }, assignments: cleanRules })
      const previousRole = roleAssignments.find(a => a.recipe_name === editing)?.role_key || ''
      if (previousRole && previousRole !== selectedRole) await api.brainRecipes.setRole(previousRole, null)
      if (selectedRole) await api.brainRecipes.setRole(selectedRole, savedName)
      if (editing && editing !== savedName && recipes.some(r => r.name === editing)) {
        try { await api.knowledge.brainRecipeDelete(editing) } catch { /* managed-only recipe or stale Infer registry */ }
      }
      await load(); resetEditor(); note = `Brain Recipe “${savedName}” saved.`
    } catch (e) { error = message(e) } finally { saving = false }
  }
  function requestDelete(recipe: KnBrainRecipe) {
    deleteCandidate = recipe; error = null; note = null
  }
  async function confirmDelete() {
    const recipe = deleteCandidate
    if (!recipe) return
    deleting = recipe.name; error = null
    try {
      // Delete the owning Infer recipe first. If that operation fails, retain
      // its assignments rather than leaving a partially deleted recipe.
      if (recipes.some(r => r.name === recipe.name)) await api.knowledge.brainRecipeDelete(recipe.name)
      await api.brainRecipes.remove(recipe.name)
      if (editing === recipe.name) resetEditor()
      deleteCandidate = null
      await load(); note = `Brain Recipe “${recipe.name}” deleted.`
    } catch (e) { error = message(e) } finally { deleting = '' }
  }
  $effect(() => {
    if (!editorOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) resetEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  async function setGlobalDefault() {
    saving = true; error = null; note = null
    try { await api.brainRecipes.setGlobalDefault(globalDefault || null); note = 'Global default saved.' }
    catch (e) { error = message(e) } finally { saving = false }
  }
</script>

<div class="settings-page brain-recipes-page">
  <header>
    <div><h2>Brain Recipes</h2><p>Configure reusable completion recipes and choose models based on repository or Intelligence Provider.</p></div>
    <button class="reload" onclick={load} disabled={loading || saving || Boolean(deleting)}>{loading ? 'Loading…' : loadingRegistry ? 'Refreshing…' : 'Reload'}</button>
  </header>
  {#if error}<div class="status error" role="alert">{error}</div>{/if}
  {#if note}<div class="status success" role="status">{note}</div>{/if}

  <section class="settings-section fallback-panel">
    <div class="section-copy"><h3>Global default</h3><p>Used when a recipe has no matching assignment and no default model.</p></div>
    <label><span>Default recipe</span><select bind:value={globalDefault}><option value="">Not configured</option>{#each displayedRecipes as recipe}<option value={recipe.name}>{recipe.name}</option>{/each}</select></label>
    <button onclick={setGlobalDefault} disabled={saving || loading}>Save</button>
  </section>


  <section class="recipe-list-section">
    <div class="section-heading"><div><h3>Recipes</h3><p>{displayedRecipes.length} configured</p></div><button class="primary" onclick={newRecipe}>New recipe</button></div>
    <div class="recipe-table" role="table" aria-label="Brain Recipes">
      <div class="table-header" role="row"><span>Name</span><span>Recipe role</span><span>Default target</span><span>Rules</span><span class="actions-label">Actions</span></div>
      {#each displayedRecipes as recipe (recipe.name)}
        {@const config = configs.find(c => c.recipe_name === recipe.name)}
        {@const roleKey = roleAssignments.find(a => a.recipe_name === recipe.name)?.role_key}
        <div class:chosen={editing === recipe.name} class="table-row" role="row">
          <strong>{recipe.name}</strong>
          <span>{recipeRoles.find(role => role.key === roleKey)?.name || '—'}</span>
          <span class="target">{config?.recipes?.length ? config.recipes.join(' OR ') : (config?.ip_name || recipe.ip_name) && (config?.model || recipe.model) ? `${providerDisplayName(config?.ip_name || recipe.ip_name)} · ${config?.model || recipe.model}` : config?.fallback_policy === 'null' ? 'null' : config?.fallback_policy === 'global' ? 'global default' : 'unresolved'}</span>
          <span>{config?.assignments.length || 0}</span>
          <div class="row-actions"><button onclick={() => editRecipe(recipe)}>Edit</button><button class="danger" onclick={() => requestDelete(recipe)} disabled={Boolean(deleting)}>Delete</button></div>
        </div>
      {:else}<div class="empty">{loading ? 'Loading Brain Recipes…' : loadingRegistry ? 'Discovering Brain Recipes…' : 'No Brain Recipes configured.'}</div>{/each}
    </div>
  </section>

  {#if editorOpen}
    <div class="recipe-modal-backdrop" role="presentation" onclick={(e) => { if (e.currentTarget === e.target && !saving) resetEditor() }}>
      <div class="recipe-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title">
  <form class="recipe-editor" onsubmit={(e) => { e.preventDefault(); void save() }}>
    <div class="section-heading">
      <div><h3 id="recipe-editor-title">{editing ? 'Edit recipe' : 'New recipe'}</h3><p>{editing || 'Create a fixed model recipe or add conditional assignments.'}</p></div>
      <button class="modal-close" type="button" onclick={resetEditor} aria-label="Close recipe editor">×</button>
    </div>
    {#if error}<div class="status error editor-error" role="alert">{error}</div>{/if}

    <div class="recipe-basics">
      <label class="recipe-name"><span>Name</span><input bind:value={name} placeholder="title-generator" /></label>
      <label><span>Recipe role <small>Optional</small></span><select bind:value={selectedRole}><option value="">Not assigned</option>{#each recipeRoles as role}<option value={role.key}>{role.name}</option>{/each}</select>{#if selectedRole}<small class="field-help">{recipeRoles.find(role => role.key === selectedRole)?.description}</small>{/if}</label>
    </div>

    <fieldset><legend>Unresolved recipe</legend>
      <p class="fieldset-help">Choose what happens when no assignment resolves. New recipes use the global default.</p>
      <div class="fallback-options">
        <label><span>Fallback</span><select bind:value={fallbackPolicy} onchange={() => { if (fallbackPolicy !== 'local') { defaultIp=''; defaultModel=''; defaultRecipes=[] } }}><option value="global">Global default</option><option value="local">Local default</option><option value="null">Return null</option></select></label>
      </div>
      {#if fallbackPolicy === 'local'}
        <div class="target-mode"><strong>Local target</strong><button type="button" class:active={!defaultRecipes.length} onclick={() => defaultRecipes = []}>Model</button><button type="button" class:active={Boolean(defaultRecipes.length)} onclick={() => { defaultIp=''; defaultModel=''; if (!defaultRecipes.length) defaultRecipes=[''] }}>Recipe chain</button></div>
        {#if defaultRecipes.length}
          <div class="recipe-chain">{#each defaultRecipes as target, targetIndex}<div><span class="or-label">{targetIndex ? 'OR' : 'Use'}</span><select value={target} onchange={(e) => defaultRecipes = defaultRecipes.map((r,i) => i===targetIndex ? e.currentTarget.value : r)}><option value="">Select recipe…</option>{#each recipeOptions as option}<option value={option}>{option}</option>{/each}</select><button type="button" class="danger" onclick={() => defaultRecipes = defaultRecipes.filter((_,i) => i!==targetIndex)}>Remove</button></div>{/each}<button type="button" onclick={() => defaultRecipes=[...defaultRecipes,'']}>Add OR recipe</button></div>
        {:else}
          <div class="target-grid"><label><span>Intelligence Provider</span><select bind:value={defaultIp} onchange={() => { defaultModel=''; void loadModels(defaultIp) }}><option value="">Select IP…</option>{#each routeIps as ip}<option value={ip.name}>{ip.label || ip.name}</option>{/each}</select></label><label><span>Model</span><select bind:value={defaultModel} disabled={!defaultIp}><option value="">{modelLoading[defaultIp] ? 'Loading models…' : 'Select model…'}</option>{#each models(defaultIp, defaultModel) as model}<option value={model.value}>{model.label}</option>{/each}</select></label><label><span>Thinking</span><select bind:value={defaultThinking}>{#each THINKING_LEVELS as level}<option value={level}>{level}</option>{/each}</select></label></div>
        {/if}
      {/if}
    </fieldset>

    <div class="assignment-heading">
      <div><h4>Assignments</h4><p>Evaluated in order until the first non-null model. An assignment may have no conditions.</p></div>
      <button type="button" onclick={addRule}>Add assignment</button>
    </div>
    <div class="assignment-list">
      {#each rules as rule, index}
        <fieldset class="assignment-row">
          <legend class="assignment-legend"><span class="assignment-number">{index + 1}</span> Assignment {index + 1}</legend>
          <button class="danger remove-assignment" type="button" onclick={() => removeRule(index)} aria-label={`Remove assignment ${index + 1}`} title="Remove assignment">×</button>

          <section class="assignment-block condition-block" aria-labelledby={`assignment-${index}-conditions`}>
            <div class="block-heading">
              <div><h5 id={`assignment-${index}-conditions`}>{rule.conditions.length ? 'Match when' : 'Match every request'}</h5><p>{rule.conditions.length ? 'All conditions are evaluated together.' : 'No conditions — this assignment always applies.'}</p></div>
              <button type="button" class="add-condition" onclick={() => addCondition(index)}>+ Add condition</button>
            </div>
            {#if rule.conditions.length}
              <div class="condition-list">
                {#each rule.conditions as condition, conditionIndex}
                  <div class="condition-row">
                    {#if conditionIndex}<select class="join" aria-label="Condition join" value={condition.join} onchange={(e) => patchCondition(index, conditionIndex, { join: e.currentTarget.value as 'and' | 'or' })}><option value="and">AND</option><option value="or">OR</option></select>{:else}<span class="when">When</span>{/if}
                    <select aria-label="Condition field" value={condition.condition_type} onchange={(e) => patchCondition(index, conditionIndex, { condition_type: e.currentTarget.value as 'repo' | 'ip', condition_value: '' })}><option value="ip">Intelligence Provider</option><option value="repo">Repository</option></select>
                    <select aria-label="Condition operator" value={condition.operator} onchange={(e) => patchCondition(index, conditionIndex, { operator: e.currentTarget.value as 'equals' | 'not_equals' })}><option value="equals">is</option><option value="not_equals">is not</option></select>
                    {#if condition.condition_type === 'ip'}<select aria-label="Condition value" value={condition.condition_value} onchange={(e) => patchCondition(index, conditionIndex, { condition_value: e.currentTarget.value })}><option value="">Choose provider…</option>{#each routeIps as ip}<option value={ip.name}>{ip.label || ip.name}</option>{/each}</select>{:else}<select aria-label="Condition value" value={condition.condition_value} onchange={(e) => patchCondition(index, conditionIndex, { condition_value: e.currentTarget.value })}><option value="">Choose repository…</option>{#each repoOptions as repo}<option value={repo}>{repo}</option>{/each}</select>{/if}
                    <button type="button" class="danger compact remove-condition" onclick={() => removeCondition(index, conditionIndex)} aria-label={`Remove condition ${conditionIndex + 1}`} title="Remove condition">×</button>
                  </div>
                {/each}
              </div>
            {/if}
          </section>

          <section class="assignment-block target-block" aria-labelledby={`assignment-${index}-target`}>
            <div class="block-heading target-heading">
              <div><h5 id={`assignment-${index}-target`}>Route to</h5><p>Choose the result returned when this assignment matches.</p></div>
              <div class="target-mode" aria-label="Target type"><button type="button" class:active={!rule.recipes.length} aria-pressed={!rule.recipes.length} onclick={() => patchRule(index,{recipes:[]})}>Model</button><button type="button" class:active={Boolean(rule.recipes.length)} aria-pressed={Boolean(rule.recipes.length)} onclick={() => { patchRule(index,{ip_name:'',model:'',recipes:rule.recipes.length?rule.recipes:['']}) }}>Recipe chain</button></div>
            </div>
            {#if rule.recipes.length}
              <div class="recipe-chain">{#each rule.recipes as target, targetIndex}<div><span class="or-label">{targetIndex ? 'OR' : 'Use'}</span><select value={target} onchange={(e) => patchRecipeTarget(index,targetIndex,e.currentTarget.value)}><option value="">Select recipe…</option>{#each recipeOptions as option}<option value={option}>{option}</option>{/each}</select><button type="button" class="danger" onclick={() => removeRecipeTarget(index,targetIndex)}>Remove</button></div>{/each}<button type="button" onclick={() => addRecipeTarget(index)}>+ Add fallback recipe</button></div>
            {:else}
              <div class="assignment-target"><label><span>Provider</span><select value={rule.ip_name} onchange={(e) => { const ip_name=e.currentTarget.value; patchRule(index,{ip_name,model:''}); void loadModels(ip_name) }}><option value="">Choose provider…</option>{#each routeIps as ip}<option value={ip.name}>{ip.label || ip.name}</option>{/each}</select></label><label><span>Model</span><select value={rule.model} disabled={!rule.ip_name} onchange={(e) => patchRule(index,{model:e.currentTarget.value})}><option value="">{modelLoading[rule.ip_name] ? 'Loading models…' : rule.ip_name ? 'Choose model…' : 'Choose a provider first'}</option>{#each models(rule.ip_name,rule.model) as model}<option value={model.value}>{model.label}</option>{/each}</select></label><label><span>Thinking</span><select value={rule.thinking} onchange={(e) => patchRule(index,{thinking:e.currentTarget.value})}>{#each THINKING_LEVELS as level}<option value={level}>{level}</option>{/each}</select></label></div>
            {/if}
          </section>
        </fieldset>
      {:else}<div class="inline-empty">A recipe requires at least one assignment.</div>{/each}
    </div>
    <div class="form-actions modal-actions"><button type="button" onclick={resetEditor} disabled={saving}>Cancel</button><button class="primary" type="submit" disabled={saving || !canSave}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create recipe'}</button></div>
  </form>
      </div>
    </div>
  {/if}
</div>

{#if deleteCandidate}
  <div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.currentTarget === e.target && !deleting) deleteCandidate = null }}>
    <div class="confirm-dialog" role="alertdialog" tabindex="-1" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
      <h3 id="delete-title">Delete Brain Recipe?</h3>
      <p id="delete-description">“{deleteCandidate.name}” and all of its assignments will be permanently deleted. This action cannot be undone.</p>
      {#if globalDefault === deleteCandidate.name}<p class="warning">This recipe is currently the global default. The global default will be cleared.</p>{/if}
      <div class="dialog-actions"><button onclick={() => deleteCandidate = null} disabled={Boolean(deleting)}>Cancel</button><button class="danger solid-danger" onclick={confirmDelete} disabled={Boolean(deleting)}>{deleting ? 'Deleting…' : 'Delete recipe'}</button></div>
    </div>
  </div>
{/if}

<style>
  .brain-recipes-page{max-width:1180px}.status{margin:0 0 14px;padding:10px 12px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);font-size:var(--arbol-type-label)}.status.success{color:var(--arbol-color-accent);background:color-mix(in oklch,var(--arbol-color-accent) 7%,var(--arbol-color-bg))}
  .settings-section{margin-bottom:20px;padding:16px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface-2)}.fallback-panel{display:grid;grid-template-columns:1fr minmax(240px,340px) auto;gap:14px;align-items:end}.section-copy h3,.section-heading h3{margin:0;font-size:var(--arbol-type-body)}.section-copy p,.section-heading p,.assignment-heading p{margin:4px 0 0;color:var(--arbol-color-text-muted);font-size:11px}
  .recipe-modal-backdrop{position:fixed;inset:0;z-index:900;display:grid;place-items:center;padding:24px;background:#0009;backdrop-filter:blur(2px)}.recipe-modal{box-sizing:border-box;width:min(1120px,100%);max-height:min(900px,92vh);overflow:auto;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface-2);box-shadow:var(--arbol-shadow-pop,var(--arbol-shadow-3))}.recipe-editor{display:grid;gap:16px;padding:20px}.recipe-editor>.section-heading{position:sticky;top:-20px;z-index:2;margin:-20px -20px 0;padding:18px 20px 14px;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2)}.modal-close{width:32px;height:32px;padding:0!important;border:0!important;background:transparent!important;color:var(--arbol-color-text-muted)!important;font-size:22px!important;line-height:1!important}.modal-close:hover{color:var(--arbol-color-text)!important;background:var(--arbol-color-surface)!important}.editor-error{margin:0}.modal-actions{position:sticky;bottom:-20px;z-index:2;justify-content:flex-end;margin:0 -20px -20px;padding:14px 20px!important;border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2)}.section-heading,.assignment-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.recipe-basics{display:grid;grid-template-columns:minmax(260px,480px) minmax(260px,480px);gap:14px}.field-help{display:block;margin-top:5px;color:var(--arbol-color-text-muted);font-size:10px}.recipe-editor fieldset{margin:0;padding:13px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s)}.recipe-editor legend{padding:0 5px;font:600 11px var(--arbol-font-ui)}.fieldset-help{margin:-2px 0 11px;color:var(--arbol-color-text-muted);font-size:10px}.target-grid{display:grid;grid-template-columns:1fr 1.4fr .7fr;gap:10px}.assignment-heading h4{margin:0;font-size:var(--arbol-type-label)}.assignment-list{display:grid;gap:10px}.assignment-row{background:var(--arbol-color-bg)}.remove-assignment{align-self:end}.form-actions{padding-top:2px}
  .recipe-list-section{display:grid;gap:10px}.recipe-table{overflow:hidden;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface-2)}.table-header,.table-row{display:grid;grid-template-columns:minmax(160px,1fr) minmax(190px,1fr) minmax(250px,1.4fr) 70px 150px;gap:12px;align-items:center;padding:11px 14px}.table-header{border-bottom:1px solid var(--arbol-color-border);color:var(--arbol-color-text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.04em}.table-row{min-height:42px;border-bottom:1px solid var(--arbol-color-hairline);font-size:var(--arbol-type-label)}.table-row:last-child{border-bottom:0}.table-row.chosen{box-shadow:inset 3px 0 var(--arbol-color-accent);background:color-mix(in oklch,var(--arbol-color-accent) 5%,var(--arbol-color-surface-2))}.target{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font:10px var(--arbol-font-mono)}.row-actions{display:flex;justify-content:flex-end;gap:7px}.actions-label{text-align:right}
  .modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:#0008}.confirm-dialog{box-sizing:border-box;width:min(440px,100%);padding:20px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface-2);box-shadow:var(--arbol-shadow-3)}.confirm-dialog h3{margin:0 0 10px;font-size:var(--arbol-type-title)}.confirm-dialog p{margin:0 0 14px;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);line-height:1.5}.confirm-dialog .warning{color:var(--arbol-color-danger,#e35)}.dialog-actions{display:flex;justify-content:flex-end;gap:8px}.solid-danger{border-color:transparent!important;background:var(--arbol-color-danger,#d33)!important;color:white!important}

  .fallback-options{max-width:320px}.target-mode{display:flex;align-items:center;gap:4px;margin:12px 0 9px;padding:3px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-bg)}.target-mode strong{margin-right:5px;font-size:11px}.target-mode button{border-color:transparent;background:transparent}.target-mode button.active{border-color:var(--arbol-color-border);background:var(--arbol-color-surface-2);color:var(--arbol-color-accent);box-shadow:var(--arbol-shadow-1)}.recipe-chain{display:grid;gap:7px}.assignment-row{position:relative;display:grid;gap:0!important;padding:0!important;overflow:hidden;background:var(--arbol-color-bg)}.assignment-legend{margin-left:14px;padding:0 7px!important}.assignment-number{display:inline-grid;place-items:center;width:19px;height:19px;margin-right:5px;border-radius:99px;background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink,var(--arbol-color-bg));font-size:10px}.assignment-row>.remove-assignment{position:absolute;z-index:1;top:8px;right:10px;width:28px;height:28px;padding:0!important;border-color:transparent;background:transparent;font-size:17px;line-height:1}.assignment-row>.remove-assignment:hover{border-color:color-mix(in oklch,var(--arbol-color-danger,#e35) 35%,transparent);background:color-mix(in oklch,var(--arbol-color-danger,#e35) 9%,transparent)}.assignment-block{display:grid;gap:12px;padding:16px 18px}.assignment-block+.assignment-block{border-top:1px solid var(--arbol-color-border)}.target-block{background:color-mix(in oklch,var(--arbol-color-surface-2) 55%,var(--arbol-color-bg))}.block-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-right:28px}.block-heading h5{margin:0;font-size:11px}.block-heading p{margin:3px 0 0;color:var(--arbol-color-text-muted);font-size:10px}.block-heading .add-condition{flex:0 0 auto}.target-heading{padding-right:0}.target-heading .target-mode{flex:0 0 auto;margin:0}.condition-list{display:grid;gap:7px}.condition-row{display:grid;grid-template-columns:58px minmax(170px,1fr) minmax(110px,.65fr) minmax(190px,1.25fr) 30px;gap:7px;align-items:center}.condition-row .when,.or-label{color:var(--arbol-color-text-muted);font-size:10px;text-align:center}.condition-row .compact{height:30px;padding:0!important}.remove-condition{font-size:16px!important}.assignment-target{display:grid;grid-template-columns:1fr 1.4fr .7fr;gap:9px}.recipe-chain>div{display:grid;grid-template-columns:48px minmax(180px,420px) auto;gap:8px;align-items:center}
  @media(max-width:1100px){.condition-row{grid-template-columns:58px 1fr .7fr 1.2fr 30px}}@media(max-width:800px){.recipe-modal-backdrop{padding:10px}.recipe-modal{max-height:calc(100vh - 20px)}.recipe-editor{padding:16px}.recipe-editor>.section-heading{top:-16px;margin:-16px -16px 0;padding:14px 16px}.modal-actions{bottom:-16px;margin:0 -16px -16px;padding:12px 16px!important}.fallback-panel,.target-grid,.recipe-basics{grid-template-columns:1fr}.table-header{display:none}.table-row{grid-template-columns:1fr}.row-actions{justify-content:flex-start}.condition-row{grid-template-columns:54px 1fr 1fr 30px}.condition-row>select:nth-of-type(3){grid-column:2/4}.assignment-target{grid-template-columns:1fr}.recipe-chain>div{grid-template-columns:40px 1fr auto}}@media(max-width:520px){.assignment-block{padding:14px 12px}.block-heading,.target-heading{align-items:flex-start;flex-direction:column;padding-right:28px}.target-heading .target-mode{width:calc(100% - 6px)}.target-mode button{flex:1}.condition-row{grid-template-columns:1fr}.condition-row>select:nth-of-type(3){grid-column:auto}.condition-row .when{text-align:left}.section-heading,.assignment-heading{align-items:flex-start;flex-direction:column}}
</style>
