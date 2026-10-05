<script lang="ts">
  // Tokens remain write-only; Telegram phone and API ID are readable identifiers.
  import { onMount, onDestroy } from 'svelte'
  import { api } from '../api'
  import QRCode from 'qrcode'

  const PAT_LABELS: Record<string, string> = {
    'jira-pat': 'Jira',
    'confluence-pat': 'Confluence',
    'gitlab-pat': 'GitLab',
    'github-pat': 'GitHub',
  }
  const URL_FIELDS = [
    { key: 'jira_url', label: 'Jira' },
    { key: 'confluence_url', label: 'Confluence' },
    { key: 'gitlab_url', label: 'GitLab' },
  ]
  // Jira Cloud tenants may forbid API tokens outright, leaving `jira-pat`
  // unfillable. Those authenticate with a browser session instead, so the PAT
  // row would be a dead control — the sign-in card replaces it.
  type JiraAuth = { mode: 'bearer' | 'browser'; ready: boolean; url?: string }
  let jiraAuth = $state<JiraAuth>({ mode: 'bearer', ready: false })
  let voyageConfigured = $state<boolean | null>(null)
  let voyageKey = $state('')
  let secrets = $state<Record<string, boolean>>({})
  let slackCredentials = $state<Record<'user' | 'app' | 'bot', boolean>>({ user: false, app: false, bot: false })
  let slackInputs = $state<Record<'user' | 'app' | 'bot', string>>({ user: '', app: '', bot: '' })
  type TelegramRole = 'api_id' | 'api_hash' | 'phone'
  type TelegramStatus = { credentials: Record<TelegramRole, boolean>; values?: Partial<Record<'api_id' | 'phone', string>>; session: boolean }
  let telegramStatus = $state<TelegramStatus>({ credentials: { api_id: false, api_hash: false, phone: false }, session: false })
  let telegramInputs = $state<Record<TelegramRole, string>>({ api_id: '', api_hash: '', phone: '' })
  // Sign-in is a two-step MTProto flow: request a login code, then complete
  // with the code (plus the 2FA password when Telegram demands one).
  let telegramStage = $state<'idle' | 'code-sent' | 'qr' | 'awaiting-password'>('idle')
  let telegramQrImage = $state('')
  let telegramLoginId = $state('')
  let destroyed = false
  onDestroy(() => { destroyed = true; resetTelegramLogin() })
  let telegramDelivery = $state('')
  $effect(() => {
    if (telegramStage !== 'qr' || telegramUnsaved) return
    const loginId = telegramLoginId
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await api.telegramLogin.complete('', '', loginId)
        if (!active) return
        if (result.pending) { timer = setTimeout(poll, 1000); return }
        telegramQrImage = ''
        if (result.expired) { await telegramStartQr(); return }
        if (result.password_required) { telegramStage = 'awaiting-password'; return }
        resetTelegramLogin()
        note = 'Signed in to Telegram. Willo Station can now sync your chats.'
        await loadSecrets()
      } catch (e) {
        if (active) { resetTelegramLogin(); error = msg(e) }
      }
    }
    timer = setTimeout(poll, 1000)
    return () => { active = false; clearTimeout(timer) }
  })
  let telegramCanResend = $state(false)
  let telegramRetryAfter = $state(0)
  $effect(() => {
    if (telegramRetryAfter <= 0 || telegramStage !== 'code-sent') return
    const timer = setTimeout(() => { telegramRetryAfter -= 1 }, 1000)
    return () => clearTimeout(timer)
  })
  let telegramCode = $state('')
  let telegramPassword = $state('')
  let inputs = $state<Record<string, string>>({})
  let urls = $state<Record<string, string>>({ jira_url: '', confluence_url: '', gitlab_url: '' })
  let loading = $state(true)
  let busy = $state<string | null>(null)
  let error = $state<string | null>(null)
  let note = $state<string | null>(null)
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function loadSecrets() {
    secrets = (await api.knowledge.secretsStatus()).secrets
    slackCredentials = (await api.slackCredentials.status()).credentials
    const previousValues = telegramStatus.values
    telegramStatus = await api.telegramCredentials.status()
    for (const role of ['api_id', 'phone'] as const) {
      if (!telegramInputs[role] || telegramInputs[role] === previousValues?.[role]) {
        telegramInputs[role] = telegramStatus.values?.[role] ?? ''
      }
    }
    jiraAuth = await api.knowledge.jiraAuthStatus()
  }

  const patNames = $derived(
    Object.keys(PAT_LABELS).filter((n) => !(n === 'jira-pat' && jiraAuth.mode === 'browser')),
  )

  async function jiraLogin() {
    busy = 'jira-login'; error = null; note = null
    try {
      const r = await api.knowledge.jiraLogin()
      note = r.account
        ? `Signed in to Jira as ${r.account}.`
        : 'Signed in to Jira.'
      await loadSecrets()
    } catch (e) { error = msg(e) } finally { busy = null }
  }
  async function loadUrls() {
    urls = { jira_url: '', confluence_url: '', gitlab_url: '', ...(await api.knowledge.mirrorsSettings()) }
  }
  async function load() {
    loading = true; error = null
    try {
      await Promise.all([loadSecrets(), loadUrls(), loadVoyageStatus()])
    }
    catch (e) { error = msg(e) } finally { loading = false }
  }
  onMount(load)

  async function loadVoyageStatus() {
    voyageConfigured = (await api.knowledge.embedderStatus()).has_key
  }

  async function saveVoyageKey() {
    const key = voyageKey.trim()
    if (!key) return
    busy = 'voyage'; error = null; note = null
    try {
      await api.knowledge.embedderSetKey(key)
      voyageKey = ''
      voyageConfigured = true
      note = 'Voyage API key stored in the Keychain.'
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function deleteVoyageKey() {
    if (!confirm('Delete the Voyage API key from the Keychain?')) return
    busy = 'voyage'; error = null; note = null
    try {
      await api.knowledge.embedderDeleteKey()
      voyageConfigured = false
      note = 'Voyage API key removed from the Keychain.'
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function save(name: string) {
    const value = (inputs[name] || '').trim()
    if (!value) return
    busy = name; error = null; note = null
    try {
      await api.knowledge.secretsSet(name, value)
      inputs[name] = ''
      note = `${PAT_LABELS[name] ?? name} token stored in the Keychain.`
      await loadSecrets()
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function del(name: string) {
    if (!confirm(`Delete the ${PAT_LABELS[name] ?? name} token from the Keychain?`)) return
    busy = name; error = null; note = null
    try { await api.knowledge.secretsDelete(name); await loadSecrets() }
    catch (e) { error = msg(e) } finally { busy = null }
  }

  async function saveSlack(role: 'user' | 'app' | 'bot') {
    const value = slackInputs[role].trim()
    if (!value) return
    busy = `slack-${role}`; error = null; note = null
    try {
      await api.slackCredentials.set(role, value)
      slackInputs[role] = ''
      note = `Slack ${role} token stored in the Arbol Keychain.`
      await loadSecrets()
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function deleteSlack(role: 'user' | 'app' | 'bot') {
    if (!confirm(`Delete the Slack ${role} token from the Keychain?`)) return
    busy = `slack-${role}`; error = null; note = null
    try { await api.slackCredentials.remove(role); await loadSecrets() }
    catch (e) { error = msg(e) } finally { busy = null }
  }

  const telegramReady = $derived(
    telegramStatus.credentials.api_id && telegramStatus.credentials.api_hash && telegramStatus.credentials.phone,
  )

  const telegramUnsaved = $derived(
    telegramInputs.api_id.trim() !== (telegramStatus.values?.api_id ?? '') ||
    telegramInputs.phone.trim() !== (telegramStatus.values?.phone ?? '') ||
    !!telegramInputs.api_hash.trim(),
  )

  function resetTelegramLogin() {
    if (telegramLoginId) void api.telegramLogin.cancel(telegramLoginId).catch(() => {})
    telegramStage = 'idle'
    telegramQrImage = ''
    telegramLoginId = ''
    telegramCode = ''
    telegramPassword = ''
    telegramDelivery = ''
  }

  async function saveTelegram(role: TelegramRole) {
    const value = telegramInputs[role].trim()
    if (!value) return
    busy = `telegram-${role}`; error = null; note = null
    try {
      await api.telegramCredentials.set(role, value)
      telegramInputs[role] = ''
      resetTelegramLogin()
      note = `Telegram ${role.replace('_', ' ')} stored in the Arbol Keychain.`
      await loadSecrets()
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function deleteTelegram(role: TelegramRole | 'session') {
    const label = role === 'session' ? 'Telegram session (sign out)' : `Telegram ${role.replace('_', ' ')}`
    if (!confirm(`Delete the ${label} from the Keychain?`)) return
    busy = `telegram-${role}`; error = null; note = null
    try {
      await api.telegramCredentials.remove(role)
      resetTelegramLogin()
      note = role === 'session' ? 'Signed out of Telegram.' : `${label} removed from the Keychain.`
      await loadSecrets()
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function telegramStartQr() {
    if (telegramUnsaved) { error = 'Save your Telegram changes before signing in.'; return }
    busy = 'telegram-login'; error = null; note = null
    try {
      const result = await api.telegramLogin.start(false, 'qr')
      telegramLoginId = result.login_id
      if (destroyed) { resetTelegramLogin(); return }
      if (!result.qr_url) throw new Error('Telegram did not return a QR code.')
      telegramQrImage = await QRCode.toDataURL(result.qr_url, { width: 256, margin: 4 })
      if (destroyed) { resetTelegramLogin(); return }
      telegramCode = ''
      telegramPassword = ''
      telegramStage = 'qr'
    } catch (e) { resetTelegramLogin(); error = msg(e) } finally { busy = null }
  }

  async function telegramSendCode(resend = false) {
    if (telegramUnsaved) { error = 'Save your Telegram changes before signing in.'; return }
    busy = 'telegram-login'; error = null; note = null
    try {
      const result = await api.telegramLogin.start(resend)
      telegramLoginId = ''
      telegramQrImage = ''
      telegramDelivery = result.message
      telegramCanResend = result.can_resend
      telegramRetryAfter = result.retry_after
      telegramCode = ''
      telegramStage = 'code-sent'
      note = null
    } catch (e) { error = msg(e) } finally { busy = null }
  }

  async function telegramCompleteSignIn() {
    const code = telegramStage === 'awaiting-password' ? '' : telegramCode.trim()
    const password = telegramPassword
    if (!code && telegramStage !== 'awaiting-password') return
    if (telegramStage === 'awaiting-password' && !password) return
    if (telegramUnsaved) { error = 'Save your Telegram changes before signing in.'; return }
    busy = 'telegram-login'; error = null; note = null
    try {
      const r = await api.telegramLogin.complete(code, password, telegramLoginId || undefined)
      if (r.password_required) {
        telegramStage = 'awaiting-password'
        note = 'This account has two-factor verification — enter your Telegram password.'
        return
      }
      resetTelegramLogin()
      note = 'Signed in to Telegram. Willo Station can now sync your chats.'
      await loadSecrets()
    } catch (e) {
      error = msg(e)
      // Preserve the challenge so a mistyped code or password can be corrected.
    } finally { busy = null }
  }

  async function saveUrls() {
    busy = 'urls'; error = null; note = null
    try {
      // plain snapshot: a $state proxy does not survive the WebKit bridge
      await api.knowledge.mirrorsSet({ ...urls })
      note = 'Connection URLs saved to ~/.mycel/config.toml.'
      await loadUrls()
      jiraAuth = await api.knowledge.jiraAuthStatus()
    } catch (e) { error = msg(e) } finally { busy = null }
  }
</script>

<div style="padding:var(--arbol-space-5);display:grid;gap:var(--arbol-space-5);max-width:760px">
  <div>
    <div style="font:600 var(--arbol-type-title)/1.3 var(--arbol-font-ui)">Secrets</div>
    <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label);margin-top:2px">
      API keys and Personal Access Tokens for external services. Secret values are
      write-only. Telegram phone numbers and API IDs remain visible.
    </div>
  </div>

  {#if error}<div style="color:var(--arbol-color-danger);font-size:var(--arbol-type-label)">{error}</div>{/if}
  {#if note}<div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">{note}</div>{/if}

  <section aria-label="Voyage API key" style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
    <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Voyage API key</div>
    <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
      Used by repositories with the Voyage embedder profile. Stored in the macOS Keychain.
    </div>
    <div style="display:grid;grid-template-columns:110px auto 1fr auto auto;gap:var(--arbol-space-2);align-items:center">
      <div style="font-size:var(--arbol-type-label)">Voyage</div>
      <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;
                   background:{voyageConfigured ? 'var(--arbol-color-positive-bg, #103a24)' : 'var(--arbol-color-surface)'};
                   color:{voyageConfigured ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'};
                   border:1px solid var(--arbol-color-border)">
        {voyageConfigured === null ? (loading ? 'Loading…' : 'unknown') : voyageConfigured ? 'configured' : 'not set'}
      </span>
      <input aria-label="Voyage API key" type="password" bind:value={voyageKey} autocomplete="off"
             placeholder={voyageConfigured ? 'paste to replace…' : 'paste Voyage API key…'}
             style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);color:var(--arbol-color-text)" />
      <button onclick={saveVoyageKey} disabled={busy !== null || !voyageKey.trim()}
              style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">
        {busy === 'voyage' ? 'Saving…' : 'Save'}
      </button>
      <button onclick={deleteVoyageKey} disabled={busy !== null || !voyageConfigured}
              title={voyageConfigured ? 'Remove from Keychain' : ''}
              style="padding:6px 10px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                     background:transparent;color:var(--arbol-color-text-muted);cursor:pointer">
        Delete
      </button>
    </div>
  </section>

  <div style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
    <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Personal Access Tokens</div>
    {#if loading}
      <div style="color:var(--arbol-color-text-muted)">Loading…</div>
    {:else}
      {#each patNames as name}
        <div style="display:grid;grid-template-columns:110px auto 1fr auto auto;gap:var(--arbol-space-2);align-items:center">
          <div style="font-size:var(--arbol-type-label)">{PAT_LABELS[name]}</div>
          <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;
                       background:{secrets[name] ? 'var(--arbol-color-positive-bg, #103a24)' : 'var(--arbol-color-surface)'};
                       color:{secrets[name] ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'};
                       border:1px solid var(--arbol-color-border)">
            {secrets[name] ? 'configured' : 'not set'}
          </span>
          <input type="password" placeholder={secrets[name] ? 'paste to replace…' : 'paste token…'}
                 bind:value={inputs[name]} autocomplete="off"
                 style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                        background:var(--arbol-color-surface);color:var(--arbol-color-text);font-size:var(--arbol-type-label)" />
          <button onclick={() => save(name)} disabled={busy !== null || !(inputs[name] || '').trim()}
                  style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                         background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">
            {busy === name ? 'Saving…' : 'Save'}
          </button>
          <button onclick={() => del(name)} disabled={busy !== null || !secrets[name]}
                  title={secrets[name] ? 'Remove from Keychain' : ''}
                  style="padding:6px 10px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                         background:transparent;color:var(--arbol-color-text-muted);cursor:pointer">
            Delete
          </button>
        </div>
      {/each}
    {/if}
  </div>


  {#if !loading && jiraAuth.mode === 'browser'}
    <div style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
      <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Jira sign-in</div>
      <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        This Jira does not permit API tokens, so Arbol borrows a browser session
        instead. Sign in once; the session is reused until it expires, then a
        fetch will fail and ask you to sign in again.
      </div>
      <div style="display:grid;grid-template-columns:110px auto 1fr auto;gap:var(--arbol-space-2);align-items:center">
        <div style="font-size:var(--arbol-type-label)">Jira</div>
        <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;
                     border:1px solid var(--arbol-color-border);
                     color:{jiraAuth.ready ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'}">
          {jiraAuth.ready ? 'session saved (not verified)' : 'no saved session'}
        </span>
        <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                    color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
          {jiraAuth.url ?? ''}
        </div>
        <button onclick={jiraLogin} disabled={busy !== null}
                style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">
          {busy === 'jira-login' ? 'Waiting for sign-in…' : jiraAuth.ready ? 'Sign in again' : 'Sign in'}
        </button>
      </div>
      {#if busy === 'jira-login'}
        <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
          A browser window is open — complete the sign-in there, then leave it to close itself.
        </div>
      {/if}
    </div>
  {/if}

  <div style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
    <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Slack Surface</div>
    <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
      User and app tokens power read-only ingestion in Willo Station. The bot token is optional and unused in V1; any future use requires a documented exception.
    </div>
    {#each ['user', 'app', 'bot'] as rawRole}
      {@const role = rawRole as 'user' | 'app' | 'bot'}
      <div style="display:grid;grid-template-columns:110px auto 1fr auto auto;gap:var(--arbol-space-2);align-items:center">
        <div style="font-size:var(--arbol-type-label);text-transform:capitalize">{role} token</div>
        <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid var(--arbol-color-border);color:{slackCredentials[role] ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'}">
          {slackCredentials[role] ? 'configured' : 'not set'}
        </span>
        <input type="password" placeholder={slackCredentials[role] ? 'paste to replace…' : role === 'user' ? 'xoxp-…' : role === 'app' ? 'xapp-…' : 'xoxb-…'} bind:value={slackInputs[role]} autocomplete="off"
               style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);color:var(--arbol-color-text)" />
        <button onclick={() => saveSlack(role)} disabled={busy !== null || !slackInputs[role].trim()}
                style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">Save</button>
        <button onclick={() => deleteSlack(role)} disabled={busy !== null || !slackCredentials[role]}
                style="padding:6px 10px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:transparent;color:var(--arbol-color-text-muted);cursor:pointer">Delete</button>
      </div>
    {/each}
  </div>

  <div style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
    <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Telegram</div>
    <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
      Signs in as your personal Telegram account (MTProto) so Willo Station can
      list your chats. Create api_id and api_hash at my.telegram.org → API
      development tools; the phone number is your account in international
      format. Sign in by scanning a QR code with Telegram on your phone, or request a login code.
    </div>
    {#each ['api_id', 'api_hash', 'phone'] as rawRole}
      {@const role = rawRole as TelegramRole}
      <div style="display:grid;grid-template-columns:110px auto 1fr auto auto;gap:var(--arbol-space-2);align-items:center">
        <div style="font-size:var(--arbol-type-label)">{role.replace('_', ' ')}</div>
        <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid var(--arbol-color-border);color:{telegramStatus.credentials[role] ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'}">
          {telegramStatus.credentials[role] ? 'configured' : 'not set'}
        </span>
        <input aria-label={`Telegram ${role.replace('_', ' ')}`} type={role === 'api_hash' ? 'password' : role === 'phone' ? 'tel' : 'text'} placeholder={telegramStatus.credentials[role] ? 'paste to replace…' : role === 'api_id' ? '1234567' : role === 'api_hash' ? '0123456789abcdef0123456789abcdef' : '+15551234567'} bind:value={telegramInputs[role]} autocomplete="off"
               style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);color:var(--arbol-color-text)" />
        <button onclick={() => saveTelegram(role)} disabled={busy !== null || !telegramInputs[role].trim()}
                style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">Save</button>
        <button onclick={() => deleteTelegram(role)} disabled={busy !== null || !telegramStatus.credentials[role]}
                style="padding:6px 10px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:transparent;color:var(--arbol-color-text-muted);cursor:pointer">Delete</button>
      </div>
    {/each}
    <div style="display:grid;grid-template-columns:110px auto 1fr auto auto;gap:var(--arbol-space-2);align-items:center">
      <div style="font-size:var(--arbol-type-label)">Sign-in</div>
      <span style="font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid var(--arbol-color-border);color:{telegramStatus.session ? 'var(--arbol-color-positive, #3fbf72)' : 'var(--arbol-color-text-muted)'}">
        {telegramStatus.session ? 'signed in' : 'not signed in'}
      </span>
      {#if telegramStatus.session}
        <div style="min-width:0;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">Session stored in the Keychain.</div>
        <button onclick={() => deleteTelegram('session')} disabled={busy !== null}
                style="padding:6px 10px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:transparent;color:var(--arbol-color-text-muted);cursor:pointer">Sign out</button>
        <span></span>
      {:else}
        <div style="min-width:0;color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
          {telegramUnsaved ? 'Save your Telegram changes before signing in.' : telegramStage === 'idle' ? `Request a login code for ${telegramStatus.values?.phone ?? 'your saved phone number'}.` :
           telegramStage === 'qr' ? 'In Telegram on your phone, open Settings → Devices → Link Desktop Device and scan the QR code.' :
           telegramStage === 'awaiting-password' ? 'Two-factor verification enabled.' :
           telegramDelivery}
        </div>
        <button onclick={telegramStage === 'idle' ? () => telegramSendCode() : telegramCompleteSignIn}
                disabled={busy !== null || !telegramReady || telegramUnsaved || telegramStage === 'qr' || (telegramStage !== 'idle' && telegramStage !== 'awaiting-password' && !telegramCode.trim()) || (telegramStage === 'awaiting-password' && !telegramPassword.trim())}
                style="padding:6px 12px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                       background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">
          {busy === 'telegram-login' ? 'Working…' : telegramStage === 'idle' ? 'Send code' : telegramStage === 'qr' ? 'Waiting for scan…' : telegramStage === 'awaiting-password' ? 'Verify password' : 'Sign in'}
        </button>
        <span></span>
      {/if}
    </div>
    {#if !telegramStatus.session && telegramStage !== 'awaiting-password'}
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        {#if telegramStage === 'qr'}
          {#if !telegramUnsaved && telegramQrImage}<img src={telegramQrImage} alt="Scan with Telegram to sign in" width="256" height="256" />{/if}
          <span>The QR code refreshes automatically. Use the account matching your saved phone number.</span>
          <button onclick={resetTelegramLogin} disabled={busy !== null}>Cancel</button>
        {:else}
          <button onclick={telegramStartQr} disabled={busy !== null || !telegramReady || telegramUnsaved}>Sign in with QR code</button>
          <span style="color:var(--arbol-color-text-muted)">No login message needed. Approve from Telegram on your phone.</span>
        {/if}
      </div>
    {/if}

    {#if !telegramStatus.session && telegramStage === 'code-sent'}
      <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
        {#if telegramCanResend}
          No code? Telegram allows another delivery attempt after {telegramRetryAfter} seconds.
          <button onclick={() => telegramSendCode(true)} disabled={busy !== null || telegramUnsaved || telegramRetryAfter > 0}>Resend code</button>
        {:else}
          Telegram offers no alternate code delivery method. If no code arrives, use QR sign-in above.
        {/if}
        <button onclick={resetTelegramLogin} disabled={busy !== null}>Start over</button>
      </div>
    {/if}
    {#if !telegramStatus.session && (telegramStage === 'code-sent' || telegramStage === 'awaiting-password')}
      <div style="display:grid;grid-template-columns:110px 1fr 1fr;gap:var(--arbol-space-2);align-items:center">
        <div style="font-size:var(--arbol-type-label)">{telegramStage === 'awaiting-password' ? 'Password' : 'Login code'}</div>
        {#if telegramStage === 'awaiting-password'}
          <input type="password" placeholder="two-factor password…" bind:value={telegramPassword} autocomplete="off"
                 style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);color:var(--arbol-color-text)" />
          <span></span>
        {:else}
          <input type="text" placeholder="12345" bind:value={telegramCode} autocomplete="one-time-code"
                 style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);color:var(--arbol-color-text)" />
          <span></span>
        {/if}
      </div>
    {/if}
  </div>

  <div style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);display:grid;gap:var(--arbol-space-3)">
    <div style="font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">Connections</div>
    <div style="color:var(--arbol-color-text-muted);font-size:var(--arbol-type-label)">
      Base URLs the mirror fetchers call (stored in ~/.mycel/config.toml — not secret).
    </div>
    {#each URL_FIELDS as f}
      <div style="display:grid;grid-template-columns:110px 1fr;gap:var(--arbol-space-2);align-items:center">
        <div style="font-size:var(--arbol-type-label)">{f.label}</div>
        <input type="text" placeholder="https://…" value={urls[f.key]} autocomplete="off" spellcheck="false"
               oninput={(e) => (urls[f.key] = (e.currentTarget as HTMLInputElement).value)}
               style="min-width:0;padding:6px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
                      background:var(--arbol-color-surface);color:var(--arbol-color-text);font-size:var(--arbol-type-label)" />
      </div>
    {/each}
    <div>
      <button onclick={saveUrls} disabled={busy !== null}
              style="padding:6px 14px;border-radius:var(--arbol-radius-m);border:1px solid var(--arbol-color-border);
                     background:var(--arbol-color-surface);color:var(--arbol-color-text);cursor:pointer">
        {busy === 'urls' ? 'Saving…' : 'Save connections'}
      </button>
    </div>
  </div>
</div>
