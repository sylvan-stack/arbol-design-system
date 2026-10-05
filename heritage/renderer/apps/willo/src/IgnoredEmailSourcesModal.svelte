<script lang="ts">
  import { Button, Modal } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import { mailApi, type EmailIgnoreRule } from './mailApi'

  let { onClose, onChanged, onError }:
    { onClose: () => void; onChanged: () => void; onError: (message: string) => void } = $props()

  let rules = $state<EmailIgnoreRule[]>([])
  let loading = $state(true)
  let removing = $state<string | null>(null)

  async function load() {
    loading = true
    try { rules = await mailApi.ignoreRules() }
    catch (value) { onError(value instanceof Error ? value.message : String(value)) }
    finally { loading = false }
  }

  async function remove(rule: EmailIgnoreRule) {
    removing = rule.rule_id
    try {
      await mailApi.deleteIgnoreRule(rule.rule_id)
      rules = rules.filter((item) => item.rule_id !== rule.rule_id)
      onChanged()
    } catch (value) { onError(value instanceof Error ? value.message : String(value)) }
    finally { removing = null }
  }

  onMount(() => { void load() })
</script>

<Modal title="Ignored email sources" subtitle="Global across email accounts" onClose={onClose} width={660}>
  {#snippet children()}
    <div class="mail-ignored-list">
      {#if loading}<p>Loading ignored sources…</p>
      {:else if rules.length === 0}<p>No senders, domains, or body strings are ignored.</p>
      {:else}
        {#each rules as rule (rule.rule_id)}
          <div class="mail-ignored-row">
            <div><b>{rule.display_value}</b><span>{rule.kind === 'domain' && rule.include_subdomains ? 'Domain and subdomains' : rule.kind === 'domain' ? 'Domain' : rule.kind === 'body_substring' ? 'Body string' : 'Sender'}</span></div>
            <Button onclick={() => remove(rule)} disabled={removing === rule.rule_id}>{#snippet children()}{removing === rule.rule_id ? 'Removing…' : 'Stop ignoring'}{/snippet}</Button>
          </div>
        {/each}
      {/if}
      <p class="mail-ignored-note">Stopping an Ignore Rule allows later synchronization, but does not restore content that was already purged.</p>
    </div>
  {/snippet}
  {#snippet footer()}<Button onclick={onClose}>{#snippet children()}Done{/snippet}</Button>{/snippet}
</Modal>
