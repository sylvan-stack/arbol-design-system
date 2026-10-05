<script lang="ts">
  /* Seqoya Lab[Intelligence Providers] page (§3.5): Subscriptions Usage rows +
   * Intelligence Providers cards + click→Edit modal. (Ported from React.)
   *
   * The page never blocks on Core: it paints instantly from the last-good
   * lists cache (real cards, data refreshing inside them), or skeletons on a
   * first-ever run. Each list loads independently with retry + reconnect, so
   * a cold launch where Core is still starting fills in by itself. */
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { Card, onCoreReconnect } from '@arbol/design-system'
  import { api, type Ip, type Subscription } from '../api'
  import type { IpDetail } from '../types'
  import SubscriptionRow from './SubscriptionRow.svelte'
  import IpCard from './IpCard.svelte'
  import IpEditModal from './ip-edit/IntelligenceProviderEditModal.svelte'

  // Last-good lists (identity + cached usage) AND per-IP details so relaunch
  // shows the real components immediately — settings/repo-rules are local data
  // and must never sit on "loading…"; live data then replaces them in place
  // (keyed each-blocks keep the rows/cards mounted through the swap).
  const CACHE_KEY = 'arbol.seqoya.ip-page.v2'
  function readCache(): { ips: Ip[]; subs: Subscription[]; details: Record<string, IpDetail> } | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  const cached = readCache()

  let subs = $state<Subscription[]>(cached?.subs ?? [])
  let ips = $state<Ip[]>(cached?.ips ?? [])
  let ipDetails = $state<Record<string, IpDetail>>(cached?.details ?? {})
  let auth = $state<Record<string, boolean>>({})
  let editing = $state<string | null>(null)
  // "Loading" = the live list hasn't been confirmed yet (cache may be painted).
  let ipsLoading = $state(true)
  let subsLoading = $state(true)

  const editingIp = $derived(ips.find((i) => i.name === editing) || null)

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ips: $state.snapshot(ips),
        subs: $state.snapshot(subs),
        details: $state.snapshot(ipDetails),
      }))
    } catch {
      /* cache is best-effort */
    }
  }

  async function loadIps() {
    try {
      ips = await api.ips()
      saveCache()
    } finally {
      ipsLoading = false
    }
    // Load each IP's details independently so cards fill in progressively
    // instead of all appearing at once after the slowest provider responds.
    for (const ip of ips) {
      api
        .ipSettings(ip.name)
        .then(({ settings, repo_rules }) => {
          ipDetails = { ...ipDetails, [ip.name]: { settings, repo_rules } }
          saveCache()
        })
        .catch(() => {
          // Keep the cached last-good detail on a transient failure; only fill
          // an empty placeholder when we have nothing at all to show.
          if (!(ip.name in ipDetails)) {
            ipDetails = { ...ipDetails, [ip.name]: { settings: null, repo_rules: { default: [], prohibited: [] } } }
          }
        })
    }
  }

  async function loadSubs() {
    try {
      subs = await api.subscriptions()
      saveCache()
    } finally {
      subsLoading = false
    }
    const next = { ...auth }
    for (const s of subs) if (!(s.name in next)) next[s.name] = s.auth_state === 'logged_in'
    auth = next
  }

  // On launch Core may still be starting (socket absent → the bridge fails
  // fast), so a one-shot load would leave the page dead until reload. Retry
  // with backoff until it answers; onCoreReconnect covers later drops.
  let alive = true
  const inFlight = new Set<string>()
  async function retrying(key: string, load: () => Promise<void>) {
    if (inFlight.has(key)) return
    inFlight.add(key)
    try {
      for (let delay = 1000; alive; delay = Math.min(delay * 2, 8000)) {
        try {
          await load()
          return
        } catch (e) {
          console.error(`${key} load failed`, e)
        }
        await new Promise((r) => setTimeout(r, delay))
      }
    } finally {
      inFlight.delete(key)
    }
  }

  function refresh() {
    retrying('ips', loadIps)
    retrying('subs', loadSubs)
  }

  function setLoggedIn(name: string, val: boolean) {
    if (auth[name] !== val) auth = { ...auth, [name]: val }
  }

  onMount(() => {
    refresh()
    const offReconnect = onCoreReconnect(() => refresh())
    return () => {
      alive = false
      offReconnect()
    }
  })
</script>

{#snippet section(title: string, count: number | string, body: Snippet)}
  <section style="margin-bottom:var(--arbol-space-6)">
    <div style="display:flex;align-items:center;gap:var(--arbol-space-3);margin-bottom:var(--arbol-space-4)">
      <h3 style="margin:0;font-size:var(--arbol-type-title);font-weight:700;letter-spacing:0.1px;white-space:nowrap">{title}</h3>
      <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);font-family:var(--arbol-font-mono);
                   background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-hairline);border-radius:99px;padding:1px 9px">{count}</span>
      <span style="flex:1;height:1px;background:var(--arbol-color-border);opacity:0.6"></span>
    </div>
    {@render body()}
  </section>
{/snippet}

{#snippet bone(w: string, h: string = '10px')}
  <span class="bone" style="width:{w};height:{h}"></span>
{/snippet}

{#snippet subSkeleton()}
  <Card style="padding:var(--arbol-space-4) var(--arbol-space-5)">
    <div style="display:flex;align-items:center;gap:var(--arbol-space-4)">
      {@render bone('34px', '34px')}
      <div style="flex:1;display:flex;flex-direction:column;gap:7px">
        {@render bone('140px', '12px')}
        {@render bone('220px')}
      </div>
      {@render bone('64px', '24px')}
    </div>
  </Card>
{/snippet}

{#snippet ipSkeleton()}
  <Card style="display:flex;flex-direction:column;gap:var(--arbol-space-3)">
    <div style="display:flex;align-items:center;gap:var(--arbol-space-3)">
      {@render bone('34px', '34px')}
      <div style="flex:1;display:flex;flex-direction:column;gap:7px">
        {@render bone('120px', '12px')}
        {@render bone('90px')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:9px">
      {@render bone('75%')}
      {@render bone('60%')}
      {@render bone('68%')}
      {@render bone('52%')}
    </div>
  </Card>
{/snippet}

<div style="padding:var(--arbol-space-5) var(--arbol-space-6);height:100%;min-height:0;overflow:auto">
  {@render section('Subscriptions Usage', subsLoading && subs.length === 0 ? '…' : subs.length, subsBody)}
  {@render section('Intelligence Providers', ipsLoading && ips.length === 0 ? '…' : ips.length, ipsBody)}

  {#if editing && editingIp}
    <IpEditModal ip={editingIp} subscriptions={subs} onClose={() => (editing = null)} onSaved={() => { editing = null; refresh() }} />
  {/if}
</div>

{#snippet subsBody()}
  <div style="display:flex;flex-direction:column;gap:var(--arbol-row-gap, var(--arbol-space-3))">
    {#each subs as s (s.name)}<SubscriptionRow sub={s} onLogin={setLoggedIn} />{/each}
    {#if subs.length === 0}
      {#if subsLoading}
        {@render subSkeleton()}
        {@render subSkeleton()}
      {:else}
        <div style="color:var(--arbol-color-text-muted)">No subscriptions (connect Core to load).</div>
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet ipsBody()}
  <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:var(--arbol-space-4)">
    {#each ips as ip (ip.name)}<IpCard {ip} detail={ipDetails[ip.name]} {subs} {auth} onEdit={() => (editing = ip.name)} onToggled={() => void loadIps()} />{/each}
    {#if ips.length === 0}
      {#if ipsLoading}
        {@render ipSkeleton()}
        {@render ipSkeleton()}
        {@render ipSkeleton()}
      {:else}
        <div style="color:var(--arbol-color-text-muted)">No Intelligence Providers (connect Core to load).</div>
      {/if}
    {/if}
  </div>
{/snippet}

<style>
  .bone {
    display: inline-block;
    flex-shrink: 0;
    border-radius: 5px;
    background: var(--arbol-color-surface-2);
    border: 1px solid var(--arbol-color-hairline);
    animation: bone-pulse 1.3s ease-in-out infinite;
  }
  @keyframes bone-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
</style>
