<script lang="ts">
  import { tick } from 'svelte'
  import type { WorktreeInfo } from './api'
  import { isWalkthroughBranchCommandClick } from './change-walkthrough/branchWalkthrough'

  let { branch, worktrees, busy, onOpen, onSelect, onCreate, onCommandClick }: {
    branch: string
    worktrees: WorktreeInfo[]
    busy: boolean
    onOpen: () => void
    onSelect: (path: string) => void
    onCreate: () => void
    onCommandClick: (path: string) => void
  } = $props()

  let open = $state(false)
  let triggerEl = $state<HTMLButtonElement | undefined>()
  let menuEl = $state<HTMLDivElement | undefined>()
  let position = $state({ left: 8, top: 8 })

  function place() {
    if (!triggerEl || !menuEl) return
    const trigger = triggerEl.getBoundingClientRect()
    const menu = menuEl.getBoundingClientRect()
    const margin = 8
    position = {
      left: Math.max(margin, Math.min(trigger.left, window.innerWidth - menu.width - margin)),
      top: Math.max(margin, trigger.top - menu.height - 7),
    }
  }

  async function showMenu(focus: 'selected' | 'first' | 'last' = 'selected') {
    if (busy || open) return
    open = true
    onOpen()
    await tick()
    place()
    await tick()
    const items = menuItems()
    const selected = menuEl?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    const target = focus === 'last' ? items.at(-1) : focus === 'first' ? items[0] : selected || items[0]
    target?.focus()
  }

  function toggle(event: MouseEvent) {
    const selected = worktrees.find((item) => item.path && item.branch === branch)
    if (selected && isWalkthroughBranchCommandClick(event, selected.branch)) {
      event.preventDefault()
      onCommandClick(selected.path)
      return
    }
    if (open) open = false
    else void showMenu()
  }

  function selectItem(event: MouseEvent, item: WorktreeInfo) {
    if (isWalkthroughBranchCommandClick(event, item.branch)) {
      event.preventDefault()
      open = false
      onCommandClick(item.path)
      return
    }
    open = false
    onSelect(item.path)
  }

  function menuItems() {
    return [...(menuEl?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') || [])]
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    void showMenu(event.key === 'ArrowUp' ? 'last' : 'first')
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const items = menuItems()
    if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (current + 1) % items.length
    else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'Tab') open = false
    else return
    if (next === undefined) return
    event.preventDefault()
    items[next]?.focus()
  }

  $effect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerEl?.contains(target) || menuEl?.contains(target)) return
      open = false
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      open = false
      triggerEl?.focus()
    }
    const reflow = () => place()
    const blur = () => { open = false }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', key)
    window.addEventListener('blur', blur)
    window.addEventListener('resize', reflow, true)
    window.addEventListener('scroll', reflow, true)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', key)
      window.removeEventListener('blur', blur)
      window.removeEventListener('resize', reflow, true)
      window.removeEventListener('scroll', reflow, true)
    }
  })

  // The status strip is an overflow-constrained shared-shell slot. Portal the
  // menu so it cannot be clipped by that strip or overlap in its stacking context.
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }
</script>

<div class="worktree-picker">
  <button bind:this={triggerEl} class="trigger" type="button" onclick={toggle} onkeydown={onTriggerKeydown}
    disabled={busy} aria-haspopup="menu" aria-expanded={open}
    title="Worktree — choose where subsequent agent turns run">
    <span aria-hidden="true">⑂</span><span>{branch || 'worktree'}</span><span class="chevron">▴</span>
  </button>
  {#if open}
    <div use:portal bind:this={menuEl} class="dropup" role="menu" tabindex="-1" aria-label="Choose worktree"
      style:left={`${position.left}px`} style:top={`${position.top}px`} onkeydown={onMenuKeydown}>
      {#each worktrees.filter((item) => item.exists) as item (item.path)}
        <button type="button" role="menuitemradio" aria-checked={item.branch === branch}
          onclick={(event) => selectItem(event, item)}>
          <span class="check">{item.branch === branch ? '✓' : ''}</span>
          <span>{item.branch || 'detached'}</span>
        </button>
      {/each}
      <div class="rule"></div>
      <button type="button" role="menuitem" onclick={() => { open = false; onCreate() }}>
        <span class="check">＋</span><span>New worktree…</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .worktree-picker { position:relative;display:inline-flex }
  button { font:600 var(--arbol-type-label)/1.2 var(--arbol-font-mono);color:var(--arbol-color-text);cursor:pointer }
  .trigger { all:unset;display:inline-flex;align-items:center;gap:5px;padding:3px 6px;margin-left:-6px;border-radius:5px;cursor:pointer }
  .trigger:hover,.trigger:focus-visible { background:var(--arbol-color-surface-2);outline:none }
  .trigger:disabled { opacity:.55;cursor:default }
  .chevron { font-size:8px;opacity:.55 }
  .dropup { position:fixed;z-index:2000;box-sizing:border-box;min-width:190px;max-width:calc(100vw - 16px);max-height:min(280px,calc(100vh - 16px));overflow:auto;padding:5px;background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);border-radius:8px;box-shadow:var(--arbol-shadow-pop,0 8px 30px rgba(0,0,0,.28)) }
  .dropup button { width:100%;display:flex;align-items:center;gap:7px;padding:7px 9px;border:0;border-radius:5px;background:transparent;text-align:left;white-space:nowrap }
  .dropup button:hover,.dropup button:focus-visible { background:var(--arbol-color-surface-2);outline:none }
  .check { width:13px;flex:0 0 13px;color:var(--arbol-color-accent);text-align:center }
  .rule { height:1px;background:var(--arbol-color-border);margin:4px 2px }
</style>
