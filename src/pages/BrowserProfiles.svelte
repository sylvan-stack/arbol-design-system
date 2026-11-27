<script lang="ts">
  import { onMount } from 'svelte';
  import { mountProfileNavigation } from '../components/browser-profile-navigation.mjs';
  import '../components/browser-profile-navigation.css';

  type Tab = { id: number; site: string; note: string; past?: string[]; future?: string[] };
  type Profile = { id: string; name: string; selected: number | null; tabs: Tab[]; home?: string; workspaceAccount?: string; unavailable?: true };
  type Request = { type: string; value?: string | number; profile: string; tab: number | null };
  const browserIcon = new URL('../assets/ArbolBrowser.png', import.meta.url).href;
  let { presentation = 'preview', foreground = false }: {
    presentation?: 'preview' | 'signed' | 'starting'; foreground?: boolean;
  } = $props();

  let frame = $state<HTMLDivElement>();
  let browserWindow = $state<HTMLElement>();
  let fixture = $state<HTMLElement>();
  let profiles = $state<Profile[]>([
    { id: 'default', name: 'Default', selected: 1, tabs: [{ id: 1, site: 'library.example', note: '' }] },
    { id: 'studio', name: 'Studio account', selected: 2, workspaceAccount: 'Studio', tabs: [
      { id: 2, site: 'workspace.example', note: 'A draft in Studio' },
      { id: 3, site: 'support.example', note: '' },
    ] },
    { id: 'personal', name: 'Personal account', selected: 4, workspaceAccount: 'Personal', tabs: [
      { id: 4, site: 'workspace.example', note: 'A separate personal draft' },
    ] },
    { id: 'empty', name: 'Research', selected: null, tabs: [] },
    { id: 'usage', name: 'Usage plan', selected: null, tabs: [], home: 'usage.example' },
    { id: 'archive', name: 'Archive', selected: null, tabs: [], unavailable: true },
  ]);
  let selected = $state('studio');
  let requested = $state('studio');
  let profileName = $state('');
  let profileStatus = $state('');
  let address = $state('');
  let profileForm = $state<HTMLDetailsElement>();
  let active = $derived(profiles.find(profile => profile.id === selected)!);
  let tab = $derived(active.tabs.find(item => item.id === active.selected));
  let destination = $derived(profiles.find(profile => profile.id === requested));
  let nextTab = 4;
  let revision = 0;

  onMount(() => {
    if (foreground) browserWindow?.focus({ preventScroll: true });
    if (presentation !== 'preview' || !frame || !fixture) return;
    const navigation = mountProfileNavigation(frame, { onAction });
    navigation.page.append(fixture);
    function publish() {
      navigation.update({ revision: ++revision, profile: active.id, tab: active.selected, profiles });
    }
    function newTab(site = '') {
      const tab = { id: ++nextTab, site, note: '' };
      active.tabs.push(tab);
      active.selected = tab.id;
    }
    function onAction(request: Request) {
      if (request.profile !== active.id || request.tab !== active.selected)
        return { error: 'The active profile or tab changed. Try again.' };
      switch (request.type) {
        case 'select-profile':
          selectProfile(profiles.find(profile => profile.id === request.value));
          break;
        case 'select-tab':
          if (active.tabs.some(tab => tab.id === request.value)) active.selected = Number(request.value);
          break;
        case 'new-tab': newTab(); break;
        case 'close-tab':
          active.tabs = active.tabs.filter(tab => tab.id !== request.value);
          if (active.selected === request.value) active.selected = active.tabs[0]?.id ?? null;
          break;
        case 'navigate': {
          let address;
          try { address = new URL(String(request.value)); }
          catch { return { error: 'Enter an HTTP or HTTPS address.' }; }
          if (!['https:', 'http:'].includes(address.protocol)) return { error: 'Enter an HTTP or HTTPS address.' };
          if (tab) { tab.site = address.hostname; tab.note = ''; }
          else newTab(address.hostname);
          break;
        }
      }
      publish();
      return { ok: true };
    }
    publish();
  });

  const titles: Record<string, string> = {
    'library.example': 'Library',
    'workspace.example': 'Workspace',
    'support.example': 'Support center',
    'usage.example': 'Subscription usage',
  };
  function tabTitle(item: Tab) {
    return titles[item.site] ?? (item.site || 'New tab');
  }
  function openTab(site = '') {
    const id = ++nextTab;
    active.tabs.push({ id, site, note: '' });
    active.selected = id;
  }
  function selectProfile(profile: Profile | undefined) {
    if (!profile || profile.unavailable) return;
    selected = profile.id;
    profileStatus = '';
    if (!profile.tabs.length && profile.home) {
      const id = ++nextTab;
      profile.tabs.push({ id, site: profile.home, note: '' });
      profile.selected = id;
    }
  }
  function closeTab(id: number) {
    active.tabs = active.tabs.filter(item => item.id !== id);
    if (active.selected === id) active.selected = active.tabs[0]?.id ?? null;
  }
  function navigate(event: SubmitEvent) {
    event.preventDefault();
    const draft = address.trim();
    if (!draft) return;
    const url = URL.parse(/^[a-z][a-z0-9+.-]*:/i.test(draft) ? draft : 'https://' + draft);
    if (!url || !['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      profileStatus = 'Enter an HTTP or HTTPS address.';
      return;
    }
    profileStatus = '';
    if (!tab) { openTab(url.hostname); return; }
    (tab.past ??= []).push(tab.site);
    tab.future = [];
    tab.site = url.hostname;
    tab.note = '';
  }
  function moveHistory(direction: 'past' | 'future') {
    const site = tab?.[direction]?.pop();
    if (!tab || site === undefined) return;
    const other = direction === 'past' ? 'future' : 'past';
    (tab[other] ??= []).push(tab.site);
    tab.site = site;
    tab.note = '';
  }
  function reload() {
    if (tab) tab.note = '';
  }

  function createProfile(event: SubmitEvent) {
    event.preventDefault();
    const id = profileName.trim();
    if (!/^[a-z](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id) || /^seqoya-[0-9a-f]{32}$/.test(id)) {
      profileStatus = 'Use lowercase letters, numbers and hyphens.';
      return;
    }
    if (profiles.some(profile => profile.id === id)) { profileStatus = 'That profile already exists.'; return; }
    profiles.push({ id, name: id, selected: null, tabs: [] });
    profileName = '';
    if (profileForm) profileForm.open = false;
    profileStatus = 'Profile created.';
  }
</script>

{#if presentation === 'starting'}
  <section class="profile-example" aria-label="Arbol Browser window" tabindex="-1" bind:this={browserWindow}>
    <header class="browser-title"><img src={browserIcon} alt="" width="28" height="28" /> Arbol Browser</header>
    <div class="signed-profiles">
      <label>Profile
        <select bind:value={requested}>
          {#each profiles as profile (profile.id)}
            <option value={profile.id} disabled={profile.unavailable}>{profile.name}</option>
          {/each}
        </select>
      </label>
      <button type="button" disabled={!destination || destination.unavailable || !!profileStatus}
        onclick={() => { if (destination) profileStatus = `Opening ${destination.name}…`; }}>Open Profile</button>
    </div>
    <div class="startup-status" role="status">{profileStatus || 'Opening the subscription profile…'}</div>
  </section>
{:else if presentation === 'signed'}
  <section class="profile-example compact-browser" aria-label="Arbol Browser window" tabindex="-1" bind:this={browserWindow}>
    <header class="compact-toolbar" aria-label="Browser toolbar">
      <span class="window-controls" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="history">
        <button class="icon" type="button" aria-label="Back" title="Back" disabled={!tab?.past?.length} onclick={() => moveHistory('past')}>←</button>
        <button class="icon" type="button" aria-label="Forward" title="Forward" disabled={!tab?.future?.length} onclick={() => moveHistory('future')}>→</button>
        <button class="icon" type="button" aria-label="Reload" title="Reload" disabled={!tab} onclick={reload}>↻</button>
      </div>
      <form class="compact-address" onsubmit={navigate}>
        <input aria-label="Address" inputmode="url" placeholder="Enter address" bind:value={address} autocomplete="off" spellcheck={false} />
      </form>
    </header>
    <div class="compact-body">
      <aside class="compact-rail" aria-label="Browser navigation">
        <div class="rail-heading">
          <strong>Profiles</strong>
          <button class="icon" type="button" aria-label="New tab" title="New tab" onclick={() => openTab()}>+</button>
        </div>
        <nav aria-label="Browser profiles">
          {#each profiles as profile (profile.id)}
            <button class="profile-choice" type="button" disabled={profile.unavailable} aria-current={profile.id === selected ? 'true' : undefined}
              aria-expanded={profile.id === selected} aria-controls={profile.id === selected ? 'signed-tabs' : undefined}
              onclick={() => selectProfile(profile)}>
              <span>{profile.name}{profile.unavailable ? ' (unavailable)' : ''}</span>
            </button>
            {#if profile.id === selected}
              <div class="signed-tabs" id="signed-tabs" role="group" aria-label={'Open tabs in ' + profile.name}>
                {#each profile.tabs as item (item.id)}
                  <div class="tab-row">
                    <button class="tab-title" type="button" title={tabTitle(item)} aria-current={active.selected === item.id ? 'page' : undefined}
                      onclick={() => active.selected = item.id}>{tabTitle(item)}</button>
                    <button class="icon close" type="button" aria-label={'Close tab: ' + tabTitle(item)} title="Close tab" onclick={() => closeTab(item.id)}>×</button>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </nav>
        <details bind:this={profileForm}>
          <summary>New profile</summary>
          <form class="create-profile" onsubmit={createProfile}>
            <input aria-label="New profile name" placeholder="profile-name" bind:value={profileName} maxlength="64" required />
            <button type="submit">Create</button>
          </form>
        </details>
        {#if profileStatus}<p class="profile-status" role="status">{profileStatus}</p>{/if}
      </aside>
      <main class="fixture-page" aria-label="Fictional website">{@render page()}</main>
    </div>
  </section>
{:else}
  <div class="profile-example" bind:this={frame}></div>
  <section bind:this={fixture} hidden={!tab} aria-label="Fictional website">{@render page()}</section>
{/if}

{#snippet page()}
<div class="fictional-profile-page">
  {#if tab}
    <h2>{presentation === 'signed' ? tabTitle(tab) : tab.site || 'New tab'}</h2>
    {#if presentation === 'signed' && tab.site === 'workspace.example' && active.workspaceAccount}
      <p>Signed in as {active.workspaceAccount}</p>
    {/if}
    <label>Fictional page draft
      <textarea bind:value={tab.note} rows="3"></textarea>
    </label>
  {/if}
</div>
{/snippet}

<style>
  .profile-example { border: 1px solid var(--border); border-radius: var(--radius-md); }
  .browser-title {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }
  .fictional-profile-page { padding: 24px; }
  .startup-status { padding: 0 12px 14px; color: var(--text); }
  h2 { margin: 0 0 16px; font-size: 18px; }
  label { display: grid; max-width: 360px; gap: 6px; }
  textarea { padding: 8px; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); }
  textarea:focus-visible { outline: 2px solid var(--focus); }
  .signed-profiles { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
  button, input, select { padding: 6px 8px; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); }
  :is(button, input, select, summary):focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .compact-browser { container-type: inline-size; overflow: hidden; font-size: 13px; }
  .compact-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 12px 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .window-controls { display: flex; gap: 7px; width: 58px; flex: none; }
  .window-controls i { width: 12px; height: 12px; border-radius: 50%; background: var(--negative, #ff5f57); }
  .window-controls i:nth-child(2) { background: var(--warning, #febc2e); }
  .window-controls i:nth-child(3) { background: var(--positive, #28c840); }
  .history { display: flex; gap: 2px; }
  .compact-address { flex: 1; min-width: 0; }
  .compact-address input { width: 100%; height: 30px; }
  .compact-body { display: grid; grid-template-columns: 216px minmax(0, 1fr); min-height: 420px; }
  @container (max-width: 719px) { .compact-body { grid-template-columns: 168px minmax(0, 1fr); } }
  .compact-rail { padding: 8px; background: var(--surface); border-right: 1px solid var(--border); }
  .rail-heading, .tab-row { display: flex; align-items: center; justify-content: space-between; }
  .rail-heading { padding-left: 7px; margin-bottom: 4px; }
  .compact-browser button { background: transparent; border-color: transparent; border-radius: 6px; }
  .compact-browser button:enabled, summary { cursor: pointer; }
  .compact-browser button:enabled:hover { background: var(--canvas); }
  .compact-browser button:disabled { opacity: .55; }
  .icon { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; font-size: 17px; }
  .close { width: 24px; height: 24px; }
  .profile-choice { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 30px; text-align: left; }
  .profile-choice::before { content: '›'; font-size: 16px; }
  .profile-choice[aria-current='true'] { font-weight: 600; }
  .profile-choice[aria-current='true']::before { transform: rotate(90deg); }
  .profile-choice span, .tab-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .signed-tabs { margin: 3px 0 6px 8px; padding-left: 6px; border-left: 1px solid var(--border); }
  .tab-row:has([aria-current='page']) { background: var(--canvas); border-radius: 6px; }
  .tab-title { min-width: 0; min-height: 28px; flex: 1; text-align: left; }
  .tab-title[aria-current='page'] { box-shadow: inset 2px 0 var(--accent); }
  .compact-rail details { margin: 6px 2px 0; }
  summary { border-radius: 6px; padding: 6px; }
  .create-profile { display: grid; gap: 2px; margin-top: 4px; }
  .create-profile input { min-width: 0; }
  .create-profile button { text-align: left; }
  .profile-status { margin: 6px 4px; }
  .fixture-page textarea { width: 100%; }
</style>
