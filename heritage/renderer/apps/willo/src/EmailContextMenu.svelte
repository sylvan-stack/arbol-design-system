<script lang="ts">
  import { onMount } from 'svelte'
  import type { EmailIgnoreKind, MailMessageSummary } from './mailApi'
  import { clampContextMenu } from './emailAutomationState'

  let { message, x, y, onForceRefetch, forceRefetching = false, onLinkEntity, onIgnore, onTestParser, onSignal, onClose }:
    {
      message: MailMessageSummary
      x: number
      y: number
      onForceRefetch?: () => void
      forceRefetching?: boolean
      onLinkEntity: () => void
      onIgnore?: (kind: EmailIgnoreKind) => void
      onTestParser: () => void
      onSignal?: () => void
      onClose: () => void
    } = $props()

  let menu: HTMLDivElement
  let position = $state({ x: 0, y: 0 })

  onMount(() => {
    position = clampContextMenu(
      { x, y }, menu.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
    )
    menu.querySelector<HTMLButtonElement>('button')?.focus()
  })

  $effect(() => {
    const dismiss = () => onClose()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
      event.preventDefault()
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      buttons[(current + delta + buttons.length) % buttons.length]?.focus()
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('blur', dismiss)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('keydown', key)
    }
  })

  function run(action: () => void) {
    action()
    onClose()
  }
</script>

<div
  bind:this={menu}
  class="mail-context-menu"
  role="menu"
  tabindex="-1"
  aria-label={`Actions for ${message.subject || 'email'}`}
  style:left={`${position.x}px`}
  style:top={`${position.y}px`}
  onmousedown={(event) => event.stopPropagation()}
>
  <button type="button" role="menuitem" onclick={() => run(onLinkEntity)}>Link Entity…</button>
  <span class="mail-context-separator"></span>
  {#if onForceRefetch}
    <button type="button" role="menuitem" disabled={forceRefetching} onclick={() => run(onForceRefetch)}>{forceRefetching ? 'Refetching…' : 'Force refetch'}</button>
    <span class="mail-context-separator"></span>
  {/if}
  {#if onIgnore}
    <button type="button" role="menuitem" onclick={() => run(() => onIgnore!('domain'))}>Ignore domain</button>
    <button type="button" role="menuitem" onclick={() => run(() => onIgnore!('sender'))}>Ignore sender</button>
    <button type="button" role="menuitem" onclick={() => run(() => onIgnore!('body_substring'))}>Ignore by string</button>
    <span class="mail-context-separator"></span>
  {/if}
  <button type="button" role="menuitem" onclick={() => run(onTestParser)}>Test Parser…</button>
  {#if onSignal}
    <button type="button" role="menuitem" onclick={() => run(onSignal!)}>Create/Edit Signal</button>
  {/if}
</div>
