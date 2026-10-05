<script lang="ts">
  /* Elma > Viewport > Navigation Panel (§1.5 + §3.3).
   *   R1  Shell Insignia — shared <ShellInsignia>, Elma identity = the Elma Chat glyph.
   *   R2  hotkey legend (NOT buttons — a hotkey index; rows clickable for convenience):
   *        · Repo list (⌘1…⌘9 / ⌘0) — hotkeys open a new chat; mouse clicks
   *          change the current Chat Session's Repo when one is attached.
   *        · History (active + >1 turn): Older ⌘[, Newer ⌘], Jump to turn… ⌘P
   *        · Intelligence: Thinking ⌃⇥, then each IP ⌃1…⌃N */
  import { ShellInsignia } from '@arbol/design-system'
  import type { Ip, SessionTokenUsage } from '../api'
  import type { ChatTag, ChatTagDefinition } from '../chat/sessionTags'
  import TagChatDialog from '../chat/TagChatDialog.svelte'
  import MetaCockpit from './MetaCockpit.svelte'
  import ElmaChatGlyph from '../ElmaChatGlyph.svelte'
  import RepoGlyph from '../RepoGlyph.svelte'
  import type { RepoSlot } from './NavigationPanel.types'
  import HotkeyRow from './HotkeyRow.svelte'
  import FolderGlyph from './FolderGlyph.svelte'
  import NavSep from './NavSep.svelte'

  let {
    repoSlots,
    activeRepo,
    chatTitle,
    phase,
    onOpenRepo,
    onOther,
    ips,
    enabledIpNames,
    prohibitedIpNames,
    prohibitedRepoPaths,
    currentIp,
    onSelectIp,
    thinking,
    model,
    modelLabel,
    onCycleModel,
    turnCount,
    turnNumber,
    onOlder,
    onNewer,
    onHistory,
    onChangeWalkthrough,
    changeWalkthroughEnabled = false,
    sessionOnGoing,
    parentChatSession = null,
    ongoingSaving,
    onToggleOnGoing,
    onQuick,
    chatTags,
    tagDefinitions,
    tokenUsage,
    tokenUsageActive = false,
    tagSaving,
    onToggleTag,
    onEditTag,
    onRemoveTag,
    onAddTag,
    onToggleTagVip,
    tagDialogOpen,
    knownTags,
    tagEditing,
    onApplyTags,
    onCloseTagDialog,
  }: {
    repoSlots: RepoSlot[]
    activeRepo: string
    chatTitle: string
    phase: 'empty' | 'active'
    onOpenRepo: (name: string, path: string) => void
    onOther: () => void
    ips: Ip[]
    enabledIpNames: Set<string>
    prohibitedIpNames: Set<string>
    prohibitedRepoPaths: Set<string>
    currentIp: string
    onSelectIp: (name: string) => void
    thinking: string
    model: string
    modelLabel: string
    onCycleModel: () => void
    turnCount: number
    turnNumber: number
    onOlder: () => void
    onNewer: () => void
    onHistory: () => void
    onChangeWalkthrough: () => void
    changeWalkthroughEnabled?: boolean
    sessionOnGoing: boolean
    parentChatSession?: import('../api').ParentChatSession | null
    ongoingSaving: boolean
    onToggleOnGoing: () => void
    onQuick: () => void
    chatTags: ChatTag[]
    tagDefinitions: ChatTagDefinition[]
    tokenUsage?: SessionTokenUsage | null
    tokenUsageActive?: boolean
    tagSaving?: boolean
    onToggleTag: (tag: ChatTag, active: boolean) => void
    onEditTag: (tag: ChatTag) => void
    onRemoveTag: (tag: ChatTag) => void
    onAddTag: () => void
    onToggleTagVip: (name: string, vip: boolean) => void
    tagDialogOpen: boolean
    knownTags: string[]
    tagEditing?: ChatTag | null
    onApplyTags: (tags: ChatTag[]) => void
    onCloseTagDialog: () => void
  } = $props()

  const ipLabel = $derived(ips.find((i) => i.name === currentIp)?.label || '—')
  let repoOpen = $state(true)
  let intelligenceOpen = $state(true)
  let autoCollapsed = $state(false)
  $effect(() => {
    if (turnCount > 0 && !autoCollapsed) {
      repoOpen = false
      intelligenceOpen = false
      autoCollapsed = true
    } else if (turnCount === 0) {
      autoCollapsed = false
      repoOpen = true
      intelligenceOpen = true
    }
  })

</script>

{#snippet noteTrailing(note: string, title: string)}
  <span
    {title}
    style="font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted);
           white-space:nowrap;margin-right:2px"
  >
    {note}
  </span>
{/snippet}

<div
  style="position:relative;display:grid;grid-template-rows:auto 1fr;border-right:1px solid var(--arbol-color-border);
         background:var(--arbol-color-bg);min-height:0"
>
  <ShellInsignia ui="Elma" variant="chat" showUiName={false} label={chatTitle.trim() || 'New Chat'} hue={24}
    detail={phase === 'active' && turnCount > 0 ? `Turn ${turnNumber} of ${turnCount}` : undefined}>
    {#snippet glyph()}<ElmaChatGlyph />{/snippet}
  </ShellInsignia>

  <div style="min-height:0;overflow:auto;padding:var(--arbol-space-2) 0 var(--arbol-space-3)">
    {#if phase === 'active'}
      <MetaCockpit
        {sessionOnGoing}
        {parentChatSession}
        {ongoingSaving}
        {onToggleOnGoing}
        tags={chatTags}
        definitions={tagDefinitions}
        usage={tokenUsage}
        active={tokenUsageActive}
        saving={tagSaving}
        onToggle={onToggleTag}
        onEdit={onEditTag}
        onRemove={onRemoveTag}
        onAdd={onAddTag}
        onToggleVip={onToggleTagVip}
      />
    {/if}

    <button type="button" onclick={() => (repoOpen = !repoOpen)} aria-expanded={repoOpen}
      style="all:unset;box-sizing:border-box;width:100%;display:flex;justify-content:space-between;padding:6px var(--arbol-space-4);cursor:pointer;color:var(--arbol-color-text-muted);font:700 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:.7px;text-transform:uppercase">
      <span>Repositories</span><span>{repoOpen ? '−' : '+'}</span>
    </button>
    {#if repoOpen}
      {#each repoSlots as r (r.key)}
        {@const prohibited = prohibitedRepoPaths.has(r.path)}
        <HotkeyRow label={r.name} keys={[r.key]} active={activeRepo === r.name} disabled={prohibited}
          onClick={prohibited ? undefined : () => onOpenRepo(r.name, r.path)}>
          {#snippet icon()}<RepoGlyph name={r.name} />{/snippet}
          {#snippet trailing()}{#if prohibited}{@render noteTrailing('prohibited', `Prohibited for ${ipLabel}`)}{/if}{/snippet}
        </HotkeyRow>
      {/each}
      <HotkeyRow label="Other…" keys={['⌘0']} muted onClick={onOther}>{#snippet icon()}<FolderGlyph />{/snippet}</HotkeyRow>
    {/if}

    <NavSep />
    <div style="padding:4px var(--arbol-space-3) 2px var(--arbol-space-4);font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:.6px;text-transform:uppercase;color:var(--arbol-color-text-muted);opacity:.7">History{turnCount > 0 ? ` · ${turnCount} turns` : ''}</div>
    {#if changeWalkthroughEnabled}
      <HotkeyRow label="Change Walkthrough" keys={['⌥', 'Tab']} onClick={onChangeWalkthrough} />
    {/if}
    {#if phase === 'active'}
      {#if turnCount > 1}
        <HotkeyRow label="Older turn" keys={['⌘', '[']} onClick={onOlder} />
        <HotkeyRow label="Newer turn" keys={['⌘', ']']} onClick={onNewer} />
        <HotkeyRow label="Jump to turn…" keys={['⌘', 'P']} onClick={onHistory} />
      {/if}
      <HotkeyRow label="Quick actions…" keys={['⇧', '⏎']} onClick={onQuick} />
    {/if}

    <NavSep />
    <button type="button" onclick={() => (intelligenceOpen = !intelligenceOpen)} aria-expanded={intelligenceOpen}
      style="all:unset;box-sizing:border-box;width:100%;display:flex;justify-content:space-between;padding:6px var(--arbol-space-4);cursor:pointer;color:var(--arbol-color-text-muted);font:700 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:.7px;text-transform:uppercase">
      <span>Intelligence</span><span>{intelligenceOpen ? '−' : '+'}</span>
    </button>
    {#if intelligenceOpen}
      <HotkeyRow muted={!model} active={!!model} label={`Model: ${modelLabel}`} keys={['⌃', 'M']} onClick={onCycleModel} />
      <HotkeyRow muted label={`Thinking: ${thinking}`} keys={['⌃', '⇥']} />
      {#each ips as ip, i (ip.name)}
        {@const prohibited = prohibitedIpNames.has(ip.name)}
        {@const loggedIn = enabledIpNames.has(ip.name)}
        {@const enabled = loggedIn && !prohibited}
        {@const note = prohibited ? 'prohibited here' : loggedIn ? null : 'logged out'}
        <HotkeyRow label={ip.label || ip.name} keys={['⌃', String(i + 1)]} active={currentIp === ip.name} disabled={!enabled} onClick={enabled ? () => onSelectIp(ip.name) : undefined}>
          {#snippet trailing()}{#if note}{@render noteTrailing(note, prohibited ? 'Prohibited for this repo — set in Seqoya Lab' : 'Not logged in — log in from Seqoya Lab')}{/if}{/snippet}
        </HotkeyRow>
      {/each}
    {/if}
  </div>
  {#if tagDialogOpen}
    <TagChatDialog initialTags={chatTags} {knownTags} saving={tagSaving} editTag={tagEditing} onApply={onApplyTags} onClose={onCloseTagDialog} />
  {/if}
</div>
