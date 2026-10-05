<script lang="ts">
  /* Overlay > Intelligence Provider Edit (§3.6). Edits an existing IP's settings.
   * Fields (order matches §3.6): subscription binding, global-default,
   * default/prohibited repos, default model, thinking level, and permissions.
   * Esc / backdrop / Cancel dismiss; Save commits via api. (Ported React → Svelte 5.) */
  import { Button, Dropdown, Field, Modal, MultiSelect, RingsMark } from '@arbol/design-system'
  import { api, type Ip, type ModelOption, type Repo, type Subscription } from '../../api'
  import {
    THINKING_LEVELS,
    availableModelOptions,
    defaultEnabledModels,
    hasModelManager,
    modelLabel,
    normalizeEnabledModelsForProvider,
    normalizeModelForProvider,
  } from '../../constants'

  let { ip, subscriptions, onClose, onSaved }:
    { ip: Ip; subscriptions: Subscription[]; onClose: () => void; onSaved: () => void } = $props()

  let loaded = $state(false)
  let repos = $state<Repo[]>([])
  let subscriptionName = $state('')
  let model = $state('')
  let enabledModels = $state<string[]>([])
  let thinking = $state('none')
  let enabledThinkingLevels = $state<Record<string, string[]>>({})
  let globalDefault = $state(false)
  let fullPermissions = $state(false)
  let defaultRepos = $state<string[]>([])
  let prohibitedRepos = $state<string[]>([])
  let saving = $state(false)
  let modelManagerOpen = $state(false)
  let remoteModels = $state<ModelOption[] | null>(null)
  let fetchingModels = $state(false)
  let modelFetchError = $state('')
  let modelFetchSource = $state('')

  const managedModels = $derived(hasModelManager(ip.provider))

  // Vendor family: the bound subscription's provider (glm → zai) when set,
  // else the IP's transport provider. Model catalogs + fetch gating key on the
  // vendor — a z.ai gateway must offer GLM models, never the claude list.
  const familyOf = (subName: string | null | undefined) =>
    subscriptions.find((s) => s.name === (subName || ''))?.provider || ip.provider
  const family = $derived(familyOf(subscriptionName))

  // Load settings + repos once on mount. (managedModels is stable per ip.)
  $effect(() => {
    remoteModels = null
    modelFetchError = ''
    modelFetchSource = ''
    ;(async () => {
      const [{ settings, repo_rules }, repoList] = await Promise.all([api.ipSettings(ip.name), api.repos()])
      repos = repoList
      if (settings) {
        subscriptionName = settings.subscription_name || ''
        const fam = familyOf(settings.subscription_name)
        const normalizedModel = normalizeModelForProvider(settings.default_model, fam)
        const storedEnabled = normalizeEnabledModelsForProvider(settings.enabled_models || [], fam, normalizedModel)
        const nextEnabled = managedModels && storedEnabled.length === 0 ? defaultEnabledModels(fam, normalizedModel) : storedEnabled
        enabledModels = nextEnabled
        model = managedModels ? normalizedModel || nextEnabled[0] || '' : normalizedModel
        enabledThinkingLevels = settings.enabled_thinking_levels || {}
        const allowedForDefault = enabledThinkingLevels[model] || THINKING_LEVELS
        thinking = allowedForDefault.includes(settings.thinking_level) ? settings.thinking_level : allowedForDefault[0] || 'none'
        globalDefault = !!settings.is_global_default
        fullPermissions = !!settings.full_permissions
      } else {
        const nextEnabled = managedModels ? defaultEnabledModels(familyOf(null), '') : []
        enabledModels = nextEnabled
        model = managedModels ? nextEnabled[0] || '' : ''
        fullPermissions = false
      }
      defaultRepos = repo_rules.default || []
      prohibitedRepos = repo_rules.prohibited || []
      loaded = true
    })().catch((e) => console.error('settings load failed', e))
  })

  const providerModels = $derived(remoteModels || availableModelOptions(family))
  const modelFetchNeedsLogin = $derived(family === 'claude' || family === 'codex' || family === 'zai')
  const modelFetchUnavailableReason = $derived(
    modelFetchNeedsLogin && !subscriptionName
      ? `Select a ${family === 'zai' ? 'z.ai' : ip.provider} subscription to fetch models.`
      : '',
  )
  const boundSub = $derived(subscriptions.find((sub) => sub.name === subscriptionName))

  const modelDisplayLabel = (value: string | null | undefined) => {
    const normalized = value || ''
    return providerModels.find((m) => m.value === normalized)?.label || modelLabel(normalized, family)
  }

  const normalizeCurrentModel = (value: string | null | undefined) => {
    const normalized = value || ''
    if (!normalized) return ''
    if (providerModels.some((m) => m.value === normalized)) return normalized
    return normalizeModelForProvider(normalized, family)
  }

  const normalizeEnabledSelection = (values: string[] | null | undefined, defaultModel?: string | null) => {
    const seen = new Set<string>()
    for (const value of values || []) {
      const normalized = normalizeCurrentModel(value)
      if (normalized) seen.add(normalized)
    }
    const def = normalizeCurrentModel(defaultModel)
    if (def) seen.add(def)
    return [...seen]
  }

  const dropdownModelOptions = () => {
    const options: ModelOption[] = [{ value: '', label: '(provider default)' }, ...providerModels]
    const normalized = normalizeCurrentModel(model)
    if (normalized && !options.some((m) => m.value === normalized)) options.push({ value: normalized, label: normalized })
    return options
  }

  async function fetchModels() {
    fetchingModels = true
    modelFetchError = ''
    modelFetchSource = ''
    try {
      const result = await api.fetchIpModels({ ip_name: ip.name, subscription_name: subscriptionName || null })
      const next = result.models || []
      remoteModels = next
      modelFetchSource = result.source || ''
      if (managedModels && enabledModels.length === 0 && next[0]?.value) {
        enabledModels = [next[0].value]
        model = next[0].value
      }
    } catch (e) {
      modelFetchError = e instanceof Error ? e.message : String(e)
    } finally {
      fetchingModels = false
    }
  }

  async function save() {
    saving = true
    try {
      const normalizedModel = normalizeCurrentModel(model)
      const normalizedEnabled = managedModels
        ? normalizeEnabledSelection(enabledModels, normalizedModel)
        : normalizeEnabledSelection(enabledModels)
      await api.setIpSettings({
        ip_name: ip.name,
        subscription_name: subscriptionName || null,
        default_model: normalizedModel,
        enabled_models: normalizedEnabled,
        thinking_level: thinking,
        enabled_thinking_levels: Object.fromEntries(Object.entries(enabledThinkingLevels).filter(([modelId]) => normalizedEnabled.includes(modelId))),
        is_global_default: globalDefault,
        full_permissions: fullPermissions,
      })
      await api.setRepoRules(ip.name, defaultRepos, prohibitedRepos)
      onSaved()
    } finally {
      saving = false
    }
  }

  const repoOpts = $derived(repos.map((r) => ({ value: r.path, label: r.name })))
  // A repo can't be both default and prohibited — prohibited wins; warn softly.
  const conflict = $derived(defaultRepos.filter((r) => prohibitedRepos.includes(r)))
  const modelCount = $derived(enabledModels.length)

  // --- ModelManagerPopup helpers ---
  const enabledSet = $derived(new Set(enabledModels))
  const listedModels = $derived([
    ...providerModels,
    ...[...new Set([model, ...enabledModels])]
      .filter((m) => m && !providerModels.some((opt) => opt.value === m))
      .map((m) => ({ value: m, label: `${modelLabel(m, family)} (saved)` })),
  ])

  function thinkingLevelsForModel(id: string): string[] {
    return enabledThinkingLevels[id] || THINKING_LEVELS
  }

  function toggleThinkingLevel(modelId: string, level: string, checked: boolean) {
    const current = thinkingLevelsForModel(modelId)
    const next = checked ? [...new Set([...current, level])] : current.filter((value) => value !== level)
    if (next.length === 0) return
    enabledThinkingLevels = { ...enabledThinkingLevels, [modelId]: THINKING_LEVELS.filter((value) => next.includes(value)) }
    if (model === modelId && !next.includes(thinking)) thinking = next[0]
  }

  function toggleEnabled(id: string, checked: boolean) {
    const next = checked ? [...enabledModels, id] : enabledModels.filter((m) => m !== id)
    const unique = [...new Set(next)]
    enabledModels = unique
    if (!checked && model === id) model = unique[0] || ''
  }

  function makeDefault(id: string) {
    if (!enabledSet.has(id)) enabledModels = [...enabledModels, id]
    model = id
    const allowed = thinkingLevelsForModel(id)
    if (!allowed.includes(thinking)) thinking = allowed[0]
  }

  // Esc closes the popup first (capture phase), above the Modal's own Esc handler.
  $effect(() => {
    if (!modelManagerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      modelManagerOpen = false
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  function onPopupBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) modelManagerOpen = false
  }
</script>

<Modal
  title={`Edit ${ip.label || ip.name}`}
  subtitle={`${family === 'zai' ? 'z.ai · claude transport' : ip.provider} · v${ip.version} · ${ip.name}`}
  onClose={onClose}
  width={620}
>
  {#snippet icon()}<RingsMark size={22} color="var(--arbol-color-accent)" />{/snippet}
  {#snippet children()}
    {#if !loaded}
      <div style="color:var(--arbol-color-text-muted)">Loading…</div>
    {:else}
      <Field
        label="Subscription"
        hint={boundSub ? `Routes turns through the "${boundSub.label}" account.` : 'Bind an authenticated account so this IP can run.'}
      >
        {#snippet children()}
          <Dropdown
            value={subscriptionName}
            onChange={(v) => (subscriptionName = v)}
            options={[{ value: '', label: '(none)' }, ...subscriptions.map((s) => ({ value: s.name, label: s.label }))]}
          />
        {/snippet}
      </Field>

      {@render checkbox(
        globalDefault,
        (v) => (globalDefault = v),
        'Make Default Intelligence Provider',
        'The single global default IP across all working dirs.',
      )}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--arbol-space-4)">
        <Field label="Make Default for Repos">
          {#snippet children()}
            <MultiSelect options={repoOpts} selected={defaultRepos} onChange={(v) => (defaultRepos = v)} placeholder="No default repos" />
          {/snippet}
        </Field>
        <Field label="Make Prohibited for Repos">
          {#snippet children()}
            <MultiSelect options={repoOpts} selected={prohibitedRepos} onChange={(v) => (prohibitedRepos = v)} placeholder="No blocked repos" />
          {/snippet}
        </Field>
      </div>
      {#if conflict.length > 0}
        <div style="margin-top:-8px;margin-bottom:var(--arbol-space-4);font-size:var(--arbol-type-label);color:var(--arbol-color-warn);display:flex;align-items:center;gap:6px">
          ⚠ {conflict.length} repo{conflict.length > 1 ? 's are' : ' is'} both default and prohibited — prohibited wins.
        </div>
      {/if}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--arbol-space-4)">
        <Field label="Default model" hint={managedModels ? `${modelCount} model${modelCount === 1 ? '' : 's'} enabled for Ctrl+M.` : undefined}>
          {#snippet children()}
            <div style="display:flex;gap:8px;align-items:center">
              <div style="flex:1;min-width:0">
                {#if managedModels}
                  <button
                    type="button"
                    onclick={() => (modelManagerOpen = true)}
                    style="width:100%;text-align:left;display:flex;align-items:center;gap:8px;
                           background:var(--arbol-color-surface-2);color:var(--arbol-color-text);
                           border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                           padding:var(--arbol-space-2) var(--arbol-space-3);
                           font:400 var(--arbol-type-body)/1.2 var(--arbol-font-ui);cursor:pointer"
                  >
                    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{modelDisplayLabel(model)}</span>
                    <span style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">Manage…</span>
                  </button>
                {:else}
                  <Dropdown value={model} onChange={(v) => (model = v)} options={dropdownModelOptions()} />
                {/if}
              </div>
              <Button size="s" kind="ghost" onclick={fetchModels} disabled={fetchingModels}>
                {#snippet children()}{fetchingModels ? 'Fetching…' : remoteModels ? 'Refresh' : 'Fetch'}{/snippet}
              </Button>
            </div>
            {#if modelFetchError || modelFetchSource || modelFetchUnavailableReason}
              <div style="margin-top:6px;font-size:var(--arbol-type-label);color:{modelFetchError ? 'var(--arbol-color-warn)' : 'var(--arbol-color-text-muted)'}">
                {modelFetchError || (modelFetchSource ? `Fetched from ${modelFetchSource}` : modelFetchUnavailableReason)}
              </div>
            {/if}
          {/snippet}
        </Field>
        <Field label="Default thinking level" hint="Limited by the default model's enabled levels.">
          {#snippet children()}
            <Dropdown value={thinking} onChange={(v) => (thinking = v)} options={thinkingLevelsForModel(model).map((t) => ({ value: t, label: t }))} />
          {/snippet}
        </Field>
      </div>


      {@render checkbox(
        fullPermissions,
        (v) => (fullPermissions = v),
        'Full permissions',
        'Auto-approve permission requests made by this Intelligence Provider CLI for native tool calls. Arbol tool calls and dedicated restart or PostgreSQL lifecycle confirmations remain separate and still show approval Comunicados. Malformed requests are still rejected.',
      )}
      {#if fullPermissions}
        <div style="margin-top:-8px;margin-bottom:var(--arbol-space-4);font-size:var(--arbol-type-label);color:var(--arbol-color-warn)">
          ⚠ Native tool calls from this provider can run commands, modify protected files, and access sensitive data without confirmation. Restart and PostgreSQL lifecycle approvals remain required.
        </div>
      {/if}

      {#if modelManagerOpen}
        {@render modelManagerPopup()}
      {/if}
    {/if}
  {/snippet}
  {#snippet footer()}
    <Button kind="ghost" onclick={onClose}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" onclick={save} disabled={saving || !loaded || (managedModels && enabledModels.length === 0)}>
      {#snippet children()}{saving ? 'Saving…' : 'Save changes'}{/snippet}
    </Button>
  {/snippet}
</Modal>

{#snippet checkbox(checked: boolean, onChange: (v: boolean) => void, label: string, hint?: string)}
  <label
    style="display:flex;gap:var(--arbol-space-3);align-items:flex-start;cursor:pointer;
           margin-bottom:var(--arbol-space-4);padding:var(--arbol-space-3);border-radius:var(--arbol-radius-m);
           background:{checked ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};
           border:1px solid {checked ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
           transition:background .12s, border-color .12s"
  >
    <input type="checkbox" {checked} onchange={(e) => onChange(e.currentTarget.checked)} style="display:none" />
    <span
      style="width:17px;height:17px;border-radius:5px;flex-shrink:0;margin-top:1px;
             border:1px solid {checked ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};
             background:{checked ? 'var(--arbol-color-accent)' : 'transparent'};
             color:var(--arbol-color-accent-ink);display:grid;place-items:center;font-size:11px;font-weight:700"
    >{checked ? '✓' : ''}</span>
    <span>
      <div style="font-weight:600;font-size:var(--arbol-type-body)">{label}</div>
      {#if hint}
        <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:2px">{hint}</div>
      {/if}
    </span>
  </label>
{/snippet}

{#snippet modelManagerPopup()}
  <div
    onmousedown={onPopupBackdrop}
    role="presentation"
    style="position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:24px;
           background:color-mix(in oklch, var(--arbol-color-bg) 48%, transparent);backdrop-filter:blur(2px)"
  >
    <div
      role="dialog"
      aria-modal="true"
      style="width:620px;max-width:100%;max-height:86vh;display:flex;flex-direction:column;
             background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
             border-radius:var(--arbol-radius-l);box-shadow:var(--arbol-shadow-pop);overflow:hidden"
    >
      <div style="padding:var(--arbol-space-4) var(--arbol-space-5);border-bottom:1px solid var(--arbol-color-border)">
        <div style="display:flex;align-items:center;gap:var(--arbol-space-3)">
          <div style="flex:1">
            <div style="font-size:var(--arbol-type-title);font-weight:700">Model settings</div>
            <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:3px">
              Choose models for Ctrl+M, their allowed thinking levels for Ctrl+Tab, and the default model for this IP.
            </div>
          </div>
          <Button size="s" kind="ghost" onclick={fetchModels} disabled={fetchingModels}>
            {#snippet children()}{fetchingModels ? 'Fetching…' : modelFetchSource ? 'Refresh' : 'Fetch'}{/snippet}
          </Button>
        </div>
        {#if modelFetchError || modelFetchSource || modelFetchUnavailableReason}
          <div style="font-size:var(--arbol-type-label);color:{modelFetchError ? 'var(--arbol-color-warn)' : 'var(--arbol-color-text-muted)'};margin-top:8px">
            {modelFetchError || (modelFetchSource ? `Fetched from ${modelFetchSource}` : modelFetchUnavailableReason)}
          </div>
        {/if}
      </div>

      <div style="overflow:auto;padding:var(--arbol-space-3)">
        {#each listedModels as m (m.value)}
          {@const checked = enabledSet.has(m.value)}
          {@const isDefault = model === m.value}
          <div
            style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:var(--arbol-space-3);
                   padding:var(--arbol-space-3);margin-bottom:6px;border-radius:var(--arbol-radius-m);
                   background:{isDefault ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};
                   border:1px solid {isDefault ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'}"
          >
            <label style="display:flex;align-items:center;gap:var(--arbol-space-3);cursor:pointer;min-width:0">
              <input type="checkbox" {checked} onchange={(e) => toggleEnabled(m.value, e.currentTarget.checked)} />
              <span style="min-width:0">
                <span style="display:block;font-weight:650">{m.label}</span>
                <span style="display:block;font-family:var(--arbol-font-mono);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{m.value}</span>
              </span>
            </label>
            <Button size="s" kind={isDefault ? 'soft' : 'ghost'} disabled={isDefault} onclick={() => makeDefault(m.value)}>
              {#snippet children()}Default{/snippet}
            </Button>
            {#if checked}
              <div style="grid-column:1 / -1;padding-left:27px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-right:2px">Thinking</span>
                {#each THINKING_LEVELS as level}
                  {@const levelChecked = thinkingLevelsForModel(m.value).includes(level)}
                  <label style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;cursor:{levelChecked && thinkingLevelsForModel(m.value).length === 1 ? 'not-allowed' : 'pointer'};font-size:var(--arbol-type-label);background:{levelChecked ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface)'};border:1px solid {levelChecked ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'}">
                    <input type="checkbox" checked={levelChecked} disabled={levelChecked && thinkingLevelsForModel(m.value).length === 1} onchange={(e) => toggleThinkingLevel(m.value, level, e.currentTarget.checked)} style="display:none" />
                    {levelChecked ? '✓ ' : ''}{level}
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div style="display:flex;align-items:center;gap:var(--arbol-space-3);padding:var(--arbol-space-4) var(--arbol-space-5);border-top:1px solid var(--arbol-color-border)">
        <span style="font-size:var(--arbol-type-label);color:{enabledModels.length ? 'var(--arbol-color-text-muted)' : 'var(--arbol-color-warn)'}">
          {enabledModels.length ? `${enabledModels.length} enabled` : 'Enable at least one model before saving.'}
        </span>
        <span style="flex:1"></span>
        <Button kind="primary" onclick={() => (modelManagerOpen = false)} disabled={enabledModels.length === 0}>
          {#snippet children()}Done{/snippet}
        </Button>
      </div>
    </div>
  </div>
{/snippet}
