<script lang="ts">
  import { onMount } from 'svelte';
  import { mountProfileNavigation } from '../components/browser-profile-navigation.mjs';
  import '../components/browser-profile-navigation.css';

  type Tab = { id: number; site: string; note: string };
  type Profile = { id: string; name: string; selected: number | null; tabs: Tab[]; unavailable?: true };
  type Request = { type: string; value?: string | number; profile: string; tab: number | null };
  let { presentation = 'preview' }: { presentation?: 'preview' | 'signed' } = $props();

  let frame = $state<HTMLDivElement>();
  let fixture = $state<HTMLElement>();
  let profiles = $state<Profile[]>([
    { id: 'default', name: 'Default', selected: 1, tabs: [{ id: 1, site: 'library.example', note: '' }] },
    { id: 'studio', name: 'Studio account', selected: 2, tabs: [
      { id: 2, site: 'workspace.example', note: 'A draft in Studio' },
      { id: 3, site: 'support.example', note: '' },
    ] },
    { id: 'personal', name: 'Personal account', selected: 4, tabs: [
      { id: 4, site: 'workspace.example', note: 'A separate personal draft' },
    ] },
    { id: 'empty', name: 'Research', selected: null, tabs: [] },
    { id: 'archive', name: 'Archive', selected: null, tabs: [], unavailable: true },
  ]);
  let selected = $state('studio');
  let requested = $state('studio');
  let profileName = $state('');
  let profileStatus = $state('');
  let showProfiles = $state(false);
  let active = $derived(profiles.find(profile => profile.id === selected)!);
  let tab = $derived(active.tabs.find(item => item.id === active.selected));
  let destination = $derived(profiles.find(profile => profile.id === requested));
  let nextTab = 4;
  let revision = 0;

  onMount(() => {
    if (presentation === 'signed' || !frame || !fixture) return;
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
          if (profiles.some(profile => profile.id === request.value && !profile.unavailable)) selected = String(request.value);
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

  function createProfile(event: SubmitEvent) {
    event.preventDefault();
    const id = profileName.trim();
    if (!/^[a-z](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id) || /^seqoya-[0-9a-f]{32}$/.test(id)) {
      profileStatus = 'Use lowercase letters, numbers and hyphens.';
      return;
    }
    if (profiles.some(profile => profile.id === id)) { profileStatus = 'That profile already exists.'; return; }
    profiles.push({ id, name: id, selected: null, tabs: [] });
    requested = id;
    profileName = '';
    profileStatus = 'Profile created.';
  }
</script>

{#if presentation === 'signed'}
  <div class="profile-example">
    <div class="signed-profiles">
      <button type="button" aria-expanded={showProfiles} aria-controls="signed-profiles" onclick={() => showProfiles = !showProfiles}>Profiles</button>
      <span>{active.name}</span>
      <div class="signed-panel" id="signed-profiles" hidden={!showProfiles}>
        <label>Browser profile
          <select bind:value={requested}>
            {#each profiles as profile (profile.id)}
              <option value={profile.id} disabled={profile.unavailable}>{profile.name}{profile.unavailable ? ' (unavailable)' : profile.id === selected ? ' (current)' : ''}</option>
            {/each}
          </select>
        </label>
        <button type="button" disabled={!destination || destination.unavailable || requested === selected} onclick={() => { if (!destination || destination.unavailable) return; selected = destination.id; profileStatus = 'Profile window opened.'; }}>Open profile</button>
        <form onsubmit={createProfile}>
          <label>New profile name <input bind:value={profileName} maxlength="64" required /></label>
          <button type="submit">Create profile</button>
        </form>
        <span role="status">{profileStatus}</span>
      </div>
      <div class="signed-tabs" aria-label="Open tabs">
        {#each active.tabs as item (item.id)}
          <button type="button" aria-pressed={active.selected === item.id} onclick={() => active.selected = item.id}>{item.site}</button>
        {/each}
      </div>
    </div>
    {@render page()}
  </div>
{:else}
  <div class="profile-example" bind:this={frame}></div>
  <section bind:this={fixture} hidden={!tab} aria-label="Fictional website">{@render page()}</section>
{/if}

{#snippet page()}
<div class="fictional-profile-page">
  {#if tab}
    <h2>{tab.site || 'New tab'}</h2>
    <label>Fictional page draft
      <textarea bind:value={tab.note} rows="3"></textarea>
    </label>
  {/if}
</div>
{/snippet}

<style>
  .profile-example { border: 1px solid var(--border); border-radius: var(--radius-md); }
  .fictional-profile-page { padding: 24px; }
  h2 { margin: 0 0 16px; font-size: 18px; }
  label { display: grid; max-width: 360px; gap: 6px; }
  textarea { padding: 8px; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); }
  textarea:focus-visible { outline: 2px solid var(--focus); }
  .signed-profiles { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
  .signed-panel, .signed-tabs, form { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
  .signed-panel, .signed-tabs { flex-basis: 100%; }
  .signed-panel[hidden] { display: none; }
  button, input, select { padding: 6px 8px; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); }
  button[aria-pressed='true'], :is(button, input, select):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
