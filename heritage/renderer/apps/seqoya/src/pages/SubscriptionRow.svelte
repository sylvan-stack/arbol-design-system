<script lang="ts">
  /* Seqoya[Subscriptions Usage] row (§3.5 R1) — one account: provider glyph,
   * label + active state, provider-shaped usage (Claude session/weekly meters vs
   * Codex rate windows vs z.ai GLM Coding Plan windows from the z.ai quota API),
   * Login/Logout. Claude account auth is Core OAuth; web usage is only a meter
   * source. z.ai is its own vendor family — auth is a static API key and usage
   * comes from z.ai's quota API, NEVER from claude.ai. (Ported React → Svelte 5.) */
  import { Button, Card, Dot, Meter } from '@arbol/design-system'
  import {
    api,
    type ClaudeUsage,
    type ClaudeUsageResult,
    type CodexRateWindow,
    type CodexUsage as CodexUsageData,
    type CodexUsageResult,
    type Subscription,
    type UsageMeter,
    type WebRequestRow,
    type ZaiUsage as ZaiUsageData,
    type ZaiUsageResult,
    type ZaiWindow,
  } from '../api'
  import ProviderGlyph from './ProviderGlyph.svelte'

  let { sub, onLogin }: { sub: Subscription; onLogin: (name: string, val: boolean) => void } = $props()

  // Codex has no in-app web session: openai.com is domain-blocked, so there is no
  // claude.ai-style login window or usage scrape. "Login" instead imports the
  // `universe` CLI's ~/.universe/auth.json via the daemon (subscription.login) and
  // status is the DB auth_state — it never touches the native webUsage bridge.
  const isCodex = $derived(sub.provider === 'codex')
  const isClaude = $derived(sub.provider === 'claude')
  // z.ai (GLM): a separate vendor. Like codex it has no claude.ai-style web
  // session — "login" is storing a static API key (auth_mode api_key) and usage
  // is a daemon-side fetch of z.ai's quota API (subscription.zai.usage).
  const isZai = $derived(sub.provider === 'zai')
  // Static-key subscriptions (e.g. glm on a z.ai gateway): "login" is storing
  // the key, never an OAuth page.
  const isApiKey = $derived(sub.auth_mode === 'api_key')

  // Seed from the DB cache so metrics show instantly on launch (no "not logged
  // in" flash); the live scrape below then confirms/refreshes.
  let usage = $state<ClaudeUsageResult | null>(sub.usage ? { ok: true, data: sub.usage } : null)
  let codexUsage = $state<CodexUsageResult | null>(null)
  let zaiUsage = $state<ZaiUsageResult | null>(null)
  let phase = $state<'idle' | 'loading' | 'logging-in'>('idle')
  // Core account login state is auth_state-driven. Web usage/cache is only a
  // meter source and must not imply the subscription can run turns.
  let coreLoggedIn = $state(sub.auth_state === 'logged_in')
  let loginErr = $state<string | null>(null)
  let vscodePhase = $state<'idle' | 'opening'>('idle')
  let vscodeErr = $state<string | null>(null)
  let keyEntryOpen = $state(false)
  let keyDraft = $state('')
  let keyPhase = $state<'idle' | 'saving'>('idle')

  async function saveKey() {
    if (keyPhase === 'saving') return
    const key = keyDraft.trim()
    if (!key) return
    keyPhase = 'saving'
    loginErr = null
    try {
      await api.setToken(sub.name, key)
      keyDraft = ''
      keyEntryOpen = false
      coreLoggedIn = true
      onLogin?.(sub.name, true)
      if (isZai) loadZaiUsage().catch(() => {})
    } catch (e) {
      loginErr = e instanceof Error ? e.message : String(e)
    } finally {
      keyPhase = 'idle'
    }
  }

  $effect(() => {
    coreLoggedIn = sub.auth_state === 'logged_in'
  })

  async function loadUsage() {
    if (isCodex || isZai) return
    phase = 'loading'
    try {
      const r = await api.webUsage.fetch(sub.name, sub.provider)
      usage = r
      if (r.ok) api.cacheUsage(sub.name, r.data).catch(() => {})
    } finally {
      phase = 'idle'
    }
  }

  async function loadCodexUsage() {
    if (!isCodex || !coreLoggedIn) return
    phase = 'loading'
    try {
      codexUsage = await api.codexUsage(sub.name)
    } finally {
      phase = 'idle'
    }
  }

  async function loadZaiUsage() {
    if (!isZai || !coreLoggedIn) return
    phase = 'loading'
    try {
      zaiUsage = await api.zaiUsage(sub.name)
    } finally {
      phase = 'idle'
    }
  }

  // Initial load: codex / z.ai vs web-usage providers. Re-runs if provider/login flips.
  $effect(() => {
    if (isCodex) loadCodexUsage().catch(() => {})
    else if (isZai) loadZaiUsage().catch(() => {})
    else loadUsage().catch(() => {})
  })

  const u = $derived(usage?.ok ? usage.data : null)
  const zaiU = $derived(zaiUsage?.ok ? zaiUsage.data : null)
  const loggedIn = $derived(coreLoggedIn)

  // Lift the row's login state up so IP-card Test reflects it.
  $effect(() => {
    onLogin(sub.name, loggedIn)
  })

  async function waitForCoreLogin() {
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const subs = await api.subscriptions()
      const fresh = subs.find((s) => s.name === sub.name)
      if (fresh?.auth_state === 'logged_in') return fresh
      // Do not abort on auth_state=error here: it may be a stale error from a
      // previous attempt while a new OAuth callback is still pending.
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    throw new Error('timed out waiting for subscription login to complete')
  }

  async function login() {
    if (isApiKey) {
      keyEntryOpen = !keyEntryOpen
      keyDraft = ''
      loginErr = null
      return
    }
    phase = 'logging-in'
    loginErr = null
    try {
      if (isCodex) {
        // No browser/OAuth: import ~/.codex/auth.json and reflect logged-in.
        await api.login(sub.name)
        coreLoggedIn = true
        codexUsage = await api.codexUsage(sub.name)
        phase = 'idle'
        return
      }
      if (sub.provider === 'claude') {
        // Core OAuth is the source of truth. Core returns a PKCE URL; the native
        // shell opens it inside Arbol's internal WKWebView, never the external browser.
        const started = await api.login(sub.name)
        const opened = await api.oauth.open(sub.name, sub.provider, started.url, started.redirect_uri)
        if (!opened.ok) throw new Error(opened.error || 'OAuth login was cancelled')
        await waitForCoreLogin()
        coreLoggedIn = true
        await loadUsage().catch(() => {})
        return
      }
      const r = await api.webUsage.login(sub.name, sub.provider)
      if (r.ok) await loadUsage()
      else phase = 'idle'
    } catch (e) {
      loginErr = e instanceof Error ? e.message : 'login failed'
      phase = 'idle'
    }
  }

  async function logout() {
    if (sub.provider === 'claude' || isCodex || isZai) {
      await api.logout(sub.name)
      coreLoggedIn = false
      loginErr = null
      keyEntryOpen = false
      keyDraft = ''
      codexUsage = null
      zaiUsage = null
    }
    if (!isCodex && !isZai) {
      await api.webUsage.logout(sub.name)
      api.cacheUsage(sub.name, null).catch(() => {})
      usage = null
      if (sub.provider !== 'claude') await loadUsage()
    }
  }

  async function openVSCode() {
    // Daemon-side spawn: per-subscription --user-data-dir + token in child env,
    // so two accounts can run in two VS Code instances simultaneously.
    vscodePhase = 'opening'
    vscodeErr = null
    try {
      await api.openVSCode(sub.name)
    } catch (e) {
      vscodeErr = e instanceof Error ? e.message : 'failed to open VS Code'
    } finally {
      vscodePhase = 'idle'
    }
  }

  const providerName = $derived(sub.provider === 'codex' ? 'Codex' : isZai ? 'z.ai' : 'Claude')

  const subtitle = $derived(
    isCodex
      ? phase === 'logging-in'
        ? 'checking ~/.codex/auth.json…'
        : loggedIn
          ? [codexUsage?.ok ? codexUsage.data.planType : null, sub.subscription_type, sub.rate_limit_tier].filter(Boolean).join(' · ') || 'logged in via codex CLI'
          : loginErr || 'not logged in — run `codex login` in your terminal'
      : isZai
      ? phase === 'loading' && !zaiU
        ? 'loading z.ai usage…'
        : loggedIn
          ? [zaiU?.planType, 'z.ai API key'].filter(Boolean).join(' · ')
          : loginErr || (keyEntryOpen ? 'paste your z.ai API key below' : 'no z.ai API key stored — press Login to add it')
      : phase === 'loading' && !u
        ? 'loading usage…'
        : phase === 'logging-in'
          ? sub.provider === 'claude'
            ? `authorize ${providerName} OAuth in the Arbol window…`
            : `log in to ${providerName} in the window…`
          : loggedIn
            ? [u?.planType, u?.accountEmail || u?.accountName, u?.organizationName].filter(Boolean).join(' · ') || (sub.provider === 'claude' ? 'Core OAuth logged in' : 'logged in')
            : isApiKey
            ? loginErr || (keyEntryOpen ? 'paste your API key below' : 'no API key stored — press Login to add it')
            : loginErr || (sub.provider === 'claude' ? 'not logged in to Core OAuth' : 'not logged in'),
  )

  // --- presentational helpers (ported from React sub-components) ---
  function fmtPct(n: number) {
    return `${Math.round(n * 10) / 10}%`
  }
  function fmtDuration(seconds: number) {
    const s = Math.max(0, Math.round(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (h && m) return `${h}h ${m}m`
    if (h) return `${h}h`
    if (m) return `${m}m`
    return `${s}s`
  }
  function formatCodexResetAt(epochSeconds: number) {
    const reset = new Date(epochSeconds * 1000)
    const now = new Date()
    const resetDay = new Date(reset.getFullYear(), reset.getMonth(), reset.getDate()).getTime()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const days = Math.round((resetDay - today) / 86_400_000)
    const time = reset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (days <= 0) return `today at ${time}`
    if (days === 1) return `tomorrow at ${time}`
    const weekday = reset.toLocaleDateString([], { weekday: 'short' })
    return `in ${days} days at ${weekday}, ${time}`
  }
  function codexResetInfo(w: CodexRateWindow) {
    const parts: string[] = []
    if (w.resetAt) parts.push(`resets ${formatCodexResetAt(w.resetAt)}`)
    else if (w.resetAfterSeconds) parts.push(`resets in ${fmtDuration(w.resetAfterSeconds)}`)
    if (w.limitWindowSeconds) parts.push(`${fmtDuration(w.limitWindowSeconds)} window`)
    return parts.join(' · ') || 'reset time unavailable'
  }

  const codexWindows = $derived.by(() => {
    const u2 = codexUsage?.ok ? codexUsage.data : null
    if (!u2) return [] as { title: string; w: CodexRateWindow }[]
    return [
      { title: 'Primary window', w: u2.primaryWindow },
      { title: 'Secondary window', w: u2.secondaryWindow },
    ].filter((x): x is { title: string; w: CodexRateWindow } => !!x.w)
  })

  function codexMeter(title: string, w: CodexRateWindow): UsageMeter {
    const pct = typeof w.usedPercent === 'number' ? Math.max(0, Math.min(100, w.usedPercent)) : 0
    return {
      label: w.label || title,
      percentUsed: pct,
      displayText:
        typeof w.usedPercent === 'number'
          ? `${fmtPct(w.usedPercent)} used · ${fmtPct(Math.max(0, 100 - w.usedPercent))} left`
          : 'usage reported',
      resetInfo: codexResetInfo(w),
    }
  }

  // z.ai windows → the shared Meter shape. Real quota counts (when z.ai reports
  // them) ride the reset line; the reset timestamp is what the console shows.
  function zaiMeter(w: ZaiWindow): UsageMeter {
    const pct = Math.max(0, Math.min(100, w.usedPercent))
    const counts = [
      w.usage != null ? `${fmtTokens(w.usage)} limit` : null,
      w.remaining != null ? `${fmtTokens(w.remaining)} left` : null,
    ].filter(Boolean).join(' · ')
    return {
      label: w.label,
      percentUsed: pct,
      displayText: `${fmtPct(pct)} used · ${fmtPct(100 - pct)} left`,
      resetInfo:
        w.resetAtMs != null
          ? `resets ${new Date(w.resetAtMs).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
          : counts || 'reset time unavailable',
    }
  }

  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`

  const pillStyle =
    'font-size:var(--arbol-type-label);font-family:var(--arbol-font-mono);' +
    'background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-hairline);' +
    'border-radius:99px;padding:3px 10px'
  const preStyle =
    'margin-top:var(--arbol-space-2);font-family:var(--arbol-font-mono);font-size:var(--arbol-type-label);' +
    'color:var(--arbol-color-text-muted);white-space:pre-wrap;max-height:160px;overflow:auto'
</script>

<Card style="padding:var(--arbol-space-4) var(--arbol-space-5)">
  <div style="display:flex;align-items:center;gap:var(--arbol-space-4)">
    <ProviderGlyph provider={sub.provider} {loggedIn} />
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:700;font-size:var(--arbol-type-body);white-space:nowrap">{sub.label}</span>
        {#if loggedIn}
          <span style="display:inline-flex;align-items:center;gap:5px;margin-left:4px;font-size:var(--arbol-type-label);color:var(--arbol-color-ok)">
            <Dot color="var(--arbol-color-ok)" />
            active
          </span>
        {/if}
      </div>
      <div
        style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);
               font-family:{loggedIn ? 'var(--arbol-font-mono)' : 'var(--arbol-font-ui)'};
               white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
               font-style:{phase === 'logging-in' ? 'italic' : 'normal'}"
      >
        {subtitle}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:var(--arbol-space-2)">
      {#if loggedIn}
        <Button kind="ghost" size="s" onclick={isCodex ? loadCodexUsage : isZai ? loadZaiUsage : loadUsage} disabled={phase !== 'idle'}>
          {#snippet children()}{phase === 'loading' ? 'Refreshing…' : 'Refresh'}{/snippet}
        </Button>
      {/if}
      <!-- Claude/z.ai: a dedicated VS Code instance running on THIS account
           (the daemon injects the right credential env per vendor family). -->
      {#if (isClaude || isZai) && loggedIn}
        <Button kind="ghost" size="s" onclick={openVSCode} disabled={vscodePhase === 'opening'}>
          {#snippet children()}{vscodePhase === 'opening' ? 'Opening…' : 'Open in VS Code'}{/snippet}
        </Button>
      {/if}
      {#if isApiKey}
          <Button kind="primary" size="s" onclick={login} disabled={keyPhase === 'saving'}>
            {#snippet children()}{keyEntryOpen ? 'Cancel' : loggedIn ? 'Replace key' : 'Login'}{/snippet}
          </Button>
      {:else if !loggedIn}
          <Button kind="primary" size="s" onclick={login} disabled={phase === 'logging-in'}>
            {#snippet children()}{phase === 'logging-in' ? (isCodex ? 'Checking…' : 'Logging in…') : isCodex ? 'Check login' : 'Login'}{/snippet}
          </Button>
      {/if}
      {#if loggedIn}
        <Button kind="ghost" size="s" onclick={logout} disabled={keyPhase === 'saving'}>{#snippet children()}Logout{/snippet}</Button>
      {/if}
    </div>
  </div>

  {#if isApiKey && keyEntryOpen}
    <div style="margin-top:var(--arbol-space-3);display:flex;gap:var(--arbol-space-2);align-items:center">
      <input
        type="password"
        placeholder="z.ai API key"
        autocomplete="off"
        spellcheck="false"
        bind:value={keyDraft}
        onkeydown={(event) => { if (event.key === 'Enter') void saveKey() }}
        style="flex:1;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
               background:var(--arbol-color-surface-2);color:var(--arbol-color-text);
               font:var(--arbol-font-mono);font-size:var(--arbol-type-label)"
      />
      <Button kind="primary" size="s" onclick={saveKey} disabled={keyPhase === 'saving' || !keyDraft.trim()}>
        {#snippet children()}{keyPhase === 'saving' ? 'Saving…' : 'Save key'}{/snippet}
      </Button>
    </div>
  {/if}

  {#if isCodex && codexUsage?.ok}
    {@render codexUsagePanel(codexUsage.data)}
  {/if}
  {#if isZai && zaiU}
    {@render zaiUsagePanel(zaiU)}
  {/if}
  {#if !isCodex && !isZai && u}
    {@render claudeUsagePanel(u)}
  {/if}

  {#if isCodex && codexUsage && !codexUsage.ok && codexUsage.error && phase === 'idle'}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">
      {codexUsage.error}
    </div>
  {/if}

  {#if isZai && zaiUsage && !zaiUsage.ok && zaiUsage.error && phase === 'idle'}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">
      {zaiUsage.error}
    </div>
  {/if}

  {#if loginErr && phase === 'idle'}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-warn)">
      {loginErr}
    </div>
  {/if}

  {#if vscodeErr}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-warn)">
      {vscodeErr}
    </div>
  {/if}

  {#if !isCodex && usage && !usage.ok && usage.error && phase === 'idle'}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">
      {usage.error}
    </div>
  {/if}

</Card>

{#snippet codexUsagePanel(cu: CodexUsageData)}
  {@const status = cu.limitReached ? 'limit reached' : cu.allowed === false ? 'not allowed' : 'available'}
  <div style="margin-top:var(--arbol-space-3)">
    <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:var(--arbol-space-2)">
      <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">Real Codex limits from OpenAI</span>
      <a href={cu.usagePageUrl} target="_blank" rel="noreferrer"
        style="font-size:var(--arbol-type-label);color:var(--arbol-color-accent);text-decoration:none">Open limits page</a>
    </div>
    <div style="display:grid;grid-template-columns:{codexWindows.length > 1 ? '1fr 1fr' : '1fr'};gap:var(--arbol-space-2) var(--arbol-space-5)">
      {#each codexWindows as { title, w } (title)}
        <Meter {title} meter={codexMeter(title, w)} />
      {/each}
    </div>
    <div style="margin-top:var(--arbol-space-2);display:flex;gap:var(--arbol-space-2);flex-wrap:wrap">
      <span style={pillStyle + ';color:' + (cu.limitReached || cu.allowed === false ? 'var(--arbol-color-warn)' : 'var(--arbol-color-ok)')}>Status · {status}</span>
      {#if cu.planType}
        <span style={pillStyle + ';color:var(--arbol-color-text-muted)'}>Plan · {cu.planType}</span>
      {/if}
    </div>
    {#if codexWindows.length === 0}
      <pre style={preStyle}>{JSON.stringify(cu.raw || {}, null, 2)}</pre>
    {/if}
  </div>
{/snippet}

{#snippet zaiUsagePanel(zu: ZaiUsageData)}
  <div style="margin-top:var(--arbol-space-3)">
    <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:var(--arbol-space-2)">
      <span style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">Real GLM Coding Plan limits from z.ai</span>
      <a href={zu.usagePageUrl} target="_blank" rel="noreferrer"
        style="font-size:var(--arbol-type-label);color:var(--arbol-color-accent);text-decoration:none">Open z.ai usage page</a>
    </div>
    <div style="display:grid;grid-template-columns:{zu.windows.length > 1 ? '1fr 1fr' : '1fr'};gap:var(--arbol-space-2) var(--arbol-space-5)">
      {#each zu.windows as w (w.kind + w.label)}
        <Meter title={w.label} meter={zaiMeter(w)} />
      {/each}
    </div>
    <div style="margin-top:var(--arbol-space-2);display:flex;gap:var(--arbol-space-2);flex-wrap:wrap">
      {#if zu.planType}
        <span style={pillStyle + ';color:var(--arbol-color-text-muted)'}>Plan · {zu.planType}</span>
      {/if}
      {#each zu.models.slice(0, 6) as m (m.modelCode)}
        <span style={pillStyle + ';color:var(--arbol-color-text-muted)'}>{m.modelCode} · {fmtTokens(m.usage)} tok</span>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet claudeUsagePanel(cu: ClaudeUsage)}
  <div style="margin-top:var(--arbol-space-2);display:grid;grid-template-columns:1fr 1fr;gap:var(--arbol-space-2) var(--arbol-space-5)">
    {#if cu.currentSession}
      <Meter title={cu.currentSession.label || 'Current session'} meter={cu.currentSession} />
    {/if}
    {#each cu.weeklyLimits as m, i (i)}
      <Meter title={m.label || 'Weekly limit'} meter={m} />
    {/each}
  </div>
  {#if cu.additionalFeatures.length > 0}
    <div style="margin-top:var(--arbol-space-3);display:flex;gap:var(--arbol-space-2);flex-wrap:wrap">
      {#each cu.additionalFeatures as f, i (i)}
        <span style={pillStyle + ';color:var(--arbol-color-text-muted)'}>{f.label} · {f.used}/{f.total}</span>
      {/each}
    </div>
  {/if}
  {#if !cu.currentSession && cu.weeklyLimits.length === 0 && cu.additionalFeatures.length === 0 && cu.raw}
    <pre style={preStyle}>{cu.raw}</pre>
  {/if}
{/snippet}

{#snippet requestList(rows: WebRequestRow[])}
  {#if rows.length === 0}
    <div style="margin-top:var(--arbol-space-2);font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">No requests.</div>
  {:else}
    <div style="margin-top:var(--arbol-space-2);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:var(--arbol-type-label);font-family:var(--arbol-font-mono)">
        <thead>
          <tr style="color:var(--arbol-color-text-muted);text-align:left;background:var(--arbol-color-surface-2)">
            <th style="padding:7px 12px;font-weight:600;letter-spacing:0.3px">When</th>
            <th style="padding:7px 12px;font-weight:600;letter-spacing:0.3px">Model</th>
            <th style="padding:7px 12px;font-weight:600;letter-spacing:0.3px;text-align:right">Tokens</th>
            <th style="padding:7px 12px;font-weight:600;letter-spacing:0.3px;text-align:right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {#each rows.slice(0, 40) as r, i (i)}
            <tr style="border-top:1px solid var(--arbol-color-hairline)">
              <td style="padding:6px 12px;color:var(--arbol-color-text-muted)">{r.when || '—'}</td>
              <td style="padding:6px 12px;color:var(--arbol-color-text)">{r.model || '—'}</td>
              <td style="padding:6px 12px;color:var(--arbol-color-text-muted);text-align:right">{r.detail || '—'}</td>
              <td style="padding:6px 12px;color:var(--arbol-color-text);text-align:right">{r.cost || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}
