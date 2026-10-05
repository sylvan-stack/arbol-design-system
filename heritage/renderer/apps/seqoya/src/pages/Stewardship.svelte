<script lang="ts">
  import { onMount } from 'svelte'
  import { entityLinkTarget } from '@arbol/design-system'
  import { api, type ActivationRule, type Mandate, type Steward } from '../api'
  import './settingsCrud.css'

  let stewards = $state<Steward[]>([])
  let mandates = $state<Mandate[]>([])
  let rules = $state<ActivationRule[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let saving = $state<string[]>([])

  const errorText = (value: unknown) => value instanceof Error ? value.message : String(value)
  const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2)
  const mandateLabel = (type: string) => ({
    new_chat_session: 'Create Chat Sessions',
    post_in_chat: 'Post in Chats',
    chat_history: 'Read Steward Chat History',
    brain_recipe: 'Use Brain Recipes',
    blueprint: 'Call Blueprints',
  }[type] || type.replace(/_/g, ' '))
  const format = (value: number | null) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
    : null
  const isSaving = (key: string) => saving.includes(key)

  function markSaving(key: string, value: boolean) {
    saving = value ? [...saving, key] : saving.filter((item) => item !== key)
  }

  async function setStewardActive(steward: Steward, active: boolean) {
    const key = `steward:${steward.steward_id}`
    markSaving(key, true)
    error = null
    try {
      const updated = await api.stewards.setActive(steward.steward_id, active)
      stewards = stewards.map((item) => item.steward_id === updated.steward_id ? updated : item)
    } catch (value) {
      error = `Could not ${active ? 'enable' : 'disable'} ${steward.title}: ${errorText(value)}`
    } finally {
      markSaving(key, false)
    }
  }

  async function setMandateActive(mandate: Mandate, active: boolean) {
    const key = `mandate:${mandate.mandate_id}`
    markSaving(key, true)
    error = null
    try {
      const updated = await api.mandates.setActive(mandate.mandate_id, active)
      mandates = mandates.map((item) => item.mandate_id === updated.mandate_id ? updated : item)
      stewards = stewards.map((steward) => ({
        ...steward,
        mandates: steward.mandates.map((held) => held.mandate_id === updated.mandate_id
          ? { ...held, status: updated.status }
          : held),
      }))
    } catch (value) {
      error = `Could not ${active ? 'enable' : 'disable'} ${mandate.title}: ${errorText(value)}`
    } finally {
      markSaving(key, false)
    }
  }

  async function setRuleActive(rule: ActivationRule, active: boolean) {
    const key = `rule:${rule.activation_rule_id}`
    markSaving(key, true)
    error = null
    try {
      const updated = await api.activationRules.setActive(rule.activation_rule_id, active)
      rules = rules.map((item) => item.activation_rule_id === updated.activation_rule_id ? updated : item)
    } catch (value) {
      error = `Could not ${active ? 'enable' : 'disable'} ${rule.title}: ${errorText(value)}`
    } finally {
      markSaving(key, false)
    }
  }

  async function load() {
    loading = true
    error = null
    try {
      const [nextStewards, nextMandates, nextRules] = await Promise.all([
        api.stewards.list(),
        api.mandates.list(),
        api.activationRules.list(),
      ])
      stewards = nextStewards
      mandates = nextMandates
      rules = nextRules
    } catch (value) {
      error = errorText(value)
    } finally {
      loading = false
    }
  }

  onMount(() => { void load() })
</script>

<div class="settings-page documentation-page stewardship-page">
  <header>
    <div>
      <h2>Stewardship</h2>
      <p>Documentation of Stewards, the Mandates they may hold, and the independent Activation Rules that emit Signals. Use each switch to enable or disable an entity; ask an agent to change its definition.</p>
    </div>
    <button class="reload" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
  </header>

  <div class="concept-grid">
    <aside class="concept-note"><strong>Steward</strong><span>A Delegate activated to accomplish a mission. It may hold static Mandates and receive or lose Mandates at runtime.</span></aside>
    <aside class="concept-note"><strong>Mandate</strong><span>A bounded permission—an access card, credential, or key. It knows nothing about Stewards or Activation Rules.</span></aside>
    <aside class="concept-note"><strong>Activation Rule</strong><span>An independent listener over time, Signals, and windowed state. When its expression succeeds, it emits a Signal.</span></aside>
  </div>

  {#if error}<div class="error" role="alert">{error}</div>{/if}

  <section class="documentation-group" aria-labelledby="activation-rules-heading">
    <div class="group-heading">
      <div><h2 id="activation-rules-heading">Activation Rules</h2><p>Enabled listeners and the Signals they emit.</p></div>
      <span class="count-badge">{rules.length}</span>
    </div>
    <div class="card-list">
      {#each rules as rule (rule.activation_rule_id)}
        {@const active = rule.status === 'active'}
        {@const savingKey = `rule:${rule.activation_rule_id}`}
        <article class="doc-card">
          <div class="card-summary">
            <div class="card-title"><strong>{rule.title}</strong><div class="meta"><span class="badge" data-status={rule.status}>{rule.status}</span><span>emits {rule.emitted_signal_type}</span><span>v{rule.version}</span><span>{rule.activation_rule_id}</span></div></div>
            <button class:enabled={active} class="entity-switch" type="button" role="switch" aria-checked={active} aria-label={`${active ? 'Disable' : 'Enable'} Activation Rule ${rule.title}`} title={`${active ? 'Disable' : 'Enable'} this Activation Rule`} disabled={isSaving(savingKey)} onclick={() => void setRuleActive(rule, !active)}>
              <span class="switch-label">{isSaving(savingKey) ? 'Saving…' : active ? 'Enabled' : 'Disabled'}</span><span class="switch-track" aria-hidden="true"><span></span></span>
            </button>
          </div>
          {#if rule.description}<p class="description">{rule.description}</p>{/if}
          <section class="doc-section"><h3>Listener expression</h3><pre>{pretty(rule.definition)}</pre></section>
        </article>
      {:else}<div class="empty">{loading ? 'Loading Activation Rules…' : 'No Activation Rules documented.'}</div>{/each}
    </div>
  </section>

  <section class="documentation-group" aria-labelledby="stewards-heading">
    <div class="group-heading">
      <div><h2 id="stewards-heading">Stewards</h2><p>Durable Delegates, their missions, runtime data, and currently held permissions.</p></div>
      <span class="count-badge">{stewards.length}</span>
    </div>
    <div class="card-list">
      {#each stewards as steward (steward.steward_id)}
        {@const active = steward.status === 'active'}
        {@const savingKey = `steward:${steward.steward_id}`}
        <article class="doc-card">
          <div class="card-summary">
            <div class="card-title"><strong>{steward.title}</strong><div class="meta"><span class="badge" data-status={steward.status}>{steward.status}</span><span>{steward.mandate_count} active {steward.mandate_count === 1 ? 'Mandate' : 'Mandates'}</span>{#if steward.default_brain_recipe_id}<span>Brain: {steward.default_brain_recipe_id}</span>{/if}<span>{steward.steward_id}</span></div></div>
            <button class:enabled={active} class="entity-switch" type="button" role="switch" aria-checked={active} aria-label={`${active ? 'Disable' : 'Enable'} Steward ${steward.title}`} title={`${active ? 'Disable' : 'Enable'} this Steward`} disabled={isSaving(savingKey)} onclick={() => void setStewardActive(steward, !active)}>
              <span class="switch-label">{isSaving(savingKey) ? 'Saving…' : active ? 'Enabled' : 'Disabled'}</span><span class="switch-track" aria-hidden="true"><span></span></span>
            </button>
          </div>
          <div class="doc-grid"><section><h3>Mission</h3><p>{steward.mission || 'No mission documented.'}</p>{#if steward.description}<p class="muted">{steward.description}</p>{/if}</section><section><h3>Metadata</h3><pre>{pretty(steward.metadata)}</pre></section></div>
          {#if steward.instruction_files?.length}<section class="doc-section"><h3>Instruction files</h3><div class="meta">{#each steward.instruction_files as file}<span>{file}</span>{/each}</div></section>{/if}
          <section class="doc-section"><h3>Held Mandates</h3>{#if steward.mandates?.length}<div class="permission-list">{#each steward.mandates as mandate}<div class:revoked={mandate.revoked_at !== null}><strong>{mandate.title}</strong><span class="badge" data-status={mandate.status}>{mandate.status}</span><span>{mandateLabel(mandate.mandate_type)}</span><span>{mandate.assignment_kind}</span>{#if mandate.source_activation_rule_id}<span>by rule {mandate.source_activation_rule_id}</span>{/if}{#if mandate.revoked_at}<span>revoked {new Date(mandate.revoked_at).toLocaleString()}</span>{/if}</div>{/each}</div>{:else}<p class="muted">No Mandates assigned.</p>{/if}</section>
        </article>
      {:else}<div class="empty">{loading ? 'Loading Stewards…' : 'No Stewards documented.'}</div>{/each}
    </div>
  </section>

  <section class="documentation-group" aria-labelledby="mandates-heading">
    <div class="group-heading">
      <div><h2 id="mandates-heading">Mandates</h2><p>Independent, versioned permissions that a Steward may hold.</p></div>
      <span class="count-badge">{mandates.length}</span>
    </div>
    <div class="card-list">
      {#each mandates as mandate (mandate.mandate_id)}
        {@const active = mandate.status === 'active'}
        {@const savingKey = `mandate:${mandate.mandate_id}`}
        <article class="doc-card" use:entityLinkTarget={{ repo: 'Arbol', kind: 'mandate', entityId: mandate.mandate_id, title: mandate.title }}>
          <div class="card-summary">
            <div class="card-title"><strong>{mandate.title}</strong><div class="meta"><span class="badge" data-status={mandate.status}>{mandate.status}</span><span>{mandateLabel(mandate.mandate_type)}</span><span>v{mandate.version}</span>{#if mandate.effective_at}<span>from {format(mandate.effective_at)}</span>{/if}{#if mandate.expires_at}<span>until {format(mandate.expires_at)}</span>{/if}<span>{mandate.mandate_id}</span></div></div>
            <button class:enabled={active} class="entity-switch" type="button" role="switch" aria-checked={active} aria-label={`${active ? 'Disable' : 'Enable'} Mandate ${mandate.title}`} title={`${active ? 'Disable' : 'Enable'} this Mandate`} disabled={isSaving(savingKey)} onclick={() => void setMandateActive(mandate, !active)}>
              <span class="switch-label">{isSaving(savingKey) ? 'Saving…' : active ? 'Enabled' : 'Disabled'}</span><span class="switch-track" aria-hidden="true"><span></span></span>
            </button>
          </div>
          {#if mandate.description}<p class="description">{mandate.description}</p>{/if}
          <section class="doc-section"><h3>Permission bounds</h3><pre>{pretty(mandate.definition)}</pre></section>
        </article>
      {:else}<div class="empty">{loading ? 'Loading Mandates…' : 'No Mandates are currently defined.'}</div>{/each}
    </div>
  </section>
</div>
