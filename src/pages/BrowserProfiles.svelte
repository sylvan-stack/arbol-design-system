<script lang="ts">
  import { onMount } from 'svelte';
  import { mountProfileNavigation } from '../components/browser-profile-navigation.mjs';
  import '../components/browser-profile-navigation.css';

  type Tab = { id: number; site: string; note: string };
  type Profile = { id: string; name: string; selected: number | null; tabs: Tab[]; unavailable?: true };
  type Request = { type: string; value?: string | number; profile: string; tab: number | null };

  let frame: HTMLDivElement;
  let fixture: HTMLElement;
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
  let active = $derived(profiles.find(profile => profile.id === selected)!);
  let tab = $derived(active.tabs.find(item => item.id === active.selected));
  let nextTab = 4;
  let revision = 0;

  onMount(() => {
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
</script>

<div class="profile-example" bind:this={frame}></div>
<section class="fictional-profile-page" bind:this={fixture} hidden={!tab} aria-label="Fictional website">
  {#if tab}
    <h2>{tab.site || 'New tab'}</h2>
    <label>Fictional page draft
      <textarea bind:value={tab.note} rows="3"></textarea>
    </label>
  {/if}
</section>

<style>
  .profile-example { border: 1px solid var(--border); border-radius: var(--radius-md); }
  .fictional-profile-page { padding: 24px; }
  h2 { margin: 0 0 16px; font-size: 18px; }
  label { display: grid; max-width: 360px; gap: 6px; }
  textarea { padding: 8px; color: var(--text); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-md); }
  textarea:focus-visible { outline: 2px solid var(--focus); }
</style>
