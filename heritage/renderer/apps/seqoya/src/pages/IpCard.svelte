<script lang="ts">
  /* Intelligence Providers List card (§3.5 R2). (Ported from React.) */
  import { Badge, Button, Card, Dot } from '@arbol/design-system'
  import { api, type Ip, type Subscription } from '../api'
  import { modelLabel } from '../constants'
  import type { IpDetail } from '../types'
  import ProviderGlyph from './ProviderGlyph.svelte'

  let { ip, detail, subs, auth, onEdit, onToggled }:
    {
      ip: Ip
      detail?: IpDetail
      subs: Subscription[]
      auth: Record<string, boolean>
      onEdit: () => void
      onToggled?: () => void
    } = $props()

  let testState = $state<'idle' | 'testing' | 'ok' | 'err'>('idle')
  let testErr = $state('')
  let toggling = $state(false)

  const detailLoading = $derived(detail === undefined)
  const settings = $derived(detail?.settings)
  const rules = $derived(detail?.repo_rules || { default: [], prohibited: [] })
  const boundName = $derived(settings?.subscription_name || null)
  const boundSub = $derived(subs.find((s) => s.name === boundName))
  const boundLoggedIn = $derived(boundName ? !!auth[boundName] : false)
  // Vendor family = the bound subscription's provider when there is one (glm:
  // z.ai), else the IP's transport provider. Models and tests key on the
  // vendor, never on the claude transport a z.ai gateway happens to speak.
  const family = $derived(boundSub?.provider || ip.provider)
  // The user Enable/Disable switch: the detail's settings are authoritative
  // once loaded; the list row's flag covers the first paint.
  const isEnabled = $derived(
    detailLoading ? (ip.enabled ?? true) : (settings?.enabled ?? (ip.enabled ?? true)),
  )

  async function toggle(e: MouseEvent) {
    e.stopPropagation()
    toggling = true
    try {
      if (isEnabled) await api.disableIp(ip.name)
      else await api.enableIp(ip.name)
      onToggled?.()
    } finally {
      toggling = false
    }
  }

  async function test(e: MouseEvent) {
    e.stopPropagation()
    testState = 'testing'
    try {
      const { settings: s } = await api.ipSettings(ip.name)
      const subName = s?.subscription_name
      if (!subName) { testState = 'err'; testErr = 'no subscription bound'; return }
      const fam = subs.find((x) => x.name === subName)?.provider || ip.provider
      const label = subs.find((x) => x.name === subName)?.label || subName
      if (fam === 'codex') {
        if (auth[subName]) testState = 'ok'
        else { testState = 'err'; testErr = `${label}: not logged in` }
        return
      }
      if (fam === 'zai') {
        // z.ai has no web session: Test = a real quota-API call with the
        // stored key (daemon-side), never a claude.ai scrape.
        const r = await api.zaiUsage(subName)
        if (r.ok) testState = 'ok'
        else { testState = 'err'; testErr = r.error || `${label}: usage fetch failed` }
        return
      }
      const r = await api.webUsage.fetch(subName, fam)
      if (r.ok) testState = 'ok'
      else { testState = 'err'; testErr = r.needsLogin ? `${label}: not logged in` : r.error || 'failed' }
    } catch (err) {
      testState = 'err'; testErr = String(err)
    }
  }
</script>

{#if !isEnabled}
  <Card style="align-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:var(--arbol-space-3)">
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:var(--arbol-type-body);overflow-wrap:anywhere">{ip.label || ip.name}</div>
      <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:2px;overflow-wrap:anywhere">
        {detailLoading ? 'loading…' : boundSub?.label || boundName || 'none bound'}
      </div>
    </div>
    <div style="display:flex;gap:var(--arbol-space-2)">
      <Button size="s" onclick={toggle} disabled={toggling}>{#snippet children()}{toggling ? '…' : 'Enable'}{/snippet}</Button>
      <Button size="s" onclick={onEdit}>{#snippet children()}Edit{/snippet}</Button>
    </div>
  </Card>
{:else}
<Card onclick={onEdit} style="display:flex;flex-direction:column;gap:var(--arbol-space-3)">
  <div style="display:flex;align-items:flex-start;gap:var(--arbol-space-3)">
    <ProviderGlyph provider={ip.provider} loggedIn={boundLoggedIn} />
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-weight:700;font-size:var(--arbol-type-body);white-space:nowrap">{ip.label || ip.name}</span>
        {#if settings?.is_global_default}<Badge kind="accent">{#snippet children()}global default{/snippet}</Badge>{/if}
      </div>
      <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);font-family:var(--arbol-font-mono);margin-top:2px">
        {family === 'zai' ? 'z.ai' : ip.provider} · v{ip.version}{ip.deprecated ? ' · deprecated' : ''}
      </div>
    </div>
    <span style="color:var(--arbol-color-text-muted);font-size:15px;opacity:0.6">↗</span>
  </div>

  <div style="display:flex;flex-direction:column;gap:6px;font-size:var(--arbol-type-label)">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:78px;color:var(--arbol-color-text-muted);flex-shrink:0">Subscription</span>
      <span style="color:var(--arbol-color-text)">
        {#if detailLoading}
          <span style="color:var(--arbol-color-text-muted)">loading…</span>
        {:else if boundName}
          <span style="display:inline-flex;align-items:center;gap:5px">
            <Dot color={boundLoggedIn ? 'var(--arbol-color-ok)' : 'var(--arbol-color-text-muted)'} />
            {boundSub ? boundSub.label : boundName}
          </span>
        {:else}<span style="color:var(--arbol-color-err)">none bound</span>{/if}
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:78px;color:var(--arbol-color-text-muted);flex-shrink:0">Model</span>
      <span style="font-family:var(--arbol-font-mono)">
        {#if detailLoading}<span style="color:var(--arbol-color-text-muted)">loading…</span>{:else}{modelLabel(settings?.default_model, family)}{/if}
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:78px;color:var(--arbol-color-text-muted);flex-shrink:0">Thinking</span>
      <span style="font-family:var(--arbol-font-mono)">
        {#if detailLoading}<span style="color:var(--arbol-color-text-muted)">loading…</span>{:else}{settings?.thinking_level || 'none'}{/if}
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:78px;color:var(--arbol-color-text-muted);flex-shrink:0">Repos</span>
      <span style="display:inline-flex;gap:6px">
        {#if detailLoading}
          <span style="color:var(--arbol-color-text-muted)">loading…</span>
        {:else}
          <Badge kind="ok">{#snippet children()}{rules.default.length} default{/snippet}</Badge>
          <Badge kind={rules.prohibited.length ? 'err' : 'mute'}>{#snippet children()}{rules.prohibited.length} blocked{/snippet}</Badge>
        {/if}
      </span>
    </div>
  </div>

  <div style="margin-top:auto;padding-top:var(--arbol-space-2);display:flex;align-items:center;gap:var(--arbol-space-2)">
    <Button size="s" onclick={toggle} disabled={toggling}>{#snippet children()}{toggling ? '…' : isEnabled ? 'Disable' : 'Enable'}{/snippet}</Button>
    <Button size="s" onclick={test} disabled={testState === 'testing'}>{#snippet children()}{testState === 'testing' ? 'Testing…' : 'Test'}{/snippet}</Button>
    {#if testState === 'ok'}
      <span style="color:var(--arbol-color-ok);font-size:var(--arbol-type-label);font-weight:600;display:inline-flex;align-items:center;gap:5px">
        <Dot color="var(--arbol-color-ok)" />Logged in ✓
      </span>
    {:else if testState === 'err'}
      <span style="color:var(--arbol-color-err);font-size:var(--arbol-type-label)">{testErr}</span>
    {/if}
    <span style="flex:1"></span>
    <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">Edit →</span>
  </div>
</Card>
{/if}
