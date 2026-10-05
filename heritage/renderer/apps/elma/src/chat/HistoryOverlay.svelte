<script lang="ts">
  /* HistoryOverlay (⌘P) — branch-aware command-palette quick-jump, scoped to the
   * Viewport. The SAME overlay as before, extended for the conversation tree:
   *   · Empty query → the active path, newest-first. Any turn at a FORK renders as
   *     a boxed "⎇ Branch point · m paths" group listing all sibling paths; the
   *     active one is highlighted + tagged "active branch". Selecting any sibling
   *     switches to that branch and jumps.
   *   · Typing digits (default "jump" mode) → targets a turn number; jumps the
   *     moment the number is unambiguous, otherwise highlights and waits for ⏎.
   *   · Search is opt-in: the "Search" button switches to a flat search across
   *     the WHOLE tree (every node's message, newest-first).
   * Index badge = the turn's depth (1-based position on its own path); siblings
   * share a depth. ↑/↓ move, ⏎ jumps (switching branch as needed), Esc closes. */
  import { Dot, KbdHint, RingsMark } from '@arbol/design-system'
  import type { ActiveChild, Turn, TurnMap } from '../constants'
  import { pathToNode, siblings } from './branching/tree'
  import { fmtAgo, firstLine } from './util'

  type Entry = { type: 'row'; id: string } | { type: 'group'; ids: string[]; activeId: string }

  let {
    nodes,
    rootId,
    activeChild,
    path,
    viewIndex,
    onJump,
    onClose,
  }: {
    nodes: TurnMap
    rootId: string | null
    activeChild: ActiveChild
    path: string[]
    viewIndex: number
    onJump: (id: string) => void
    onClose: () => void
  } = $props()

  let q = $state('')
  let mode = $state<'jump' | 'search'>('jump')
  let inputEl: HTMLInputElement | null = $state(null)

  const currentId = $derived(path[viewIndex])
  const depthOf = (id: string) => pathToNode(nodes, id).length // 1-based turn position
  const onPath = (id: string) => path.indexOf(id) >= 0
  const query = $derived(q.trim().toLowerCase())

  // Build the display model + a flat ordered id list for keyboard nav.
  const built = $derived.by(() => {
    const entries: Entry[] = []
    const ordered: string[] = []
    if (mode === 'search' && query) {
      Object.values(nodes)
        .filter((n) => n.message.toLowerCase().includes(query))
        .sort((a, b) => b.sentAt - a.sentAt)
        .forEach((n) => {
          entries.push({ type: 'row', id: n.id })
          ordered.push(n.id)
        })
    } else {
      for (let k = path.length - 1; k >= 0; k--) {
        const id = path[k]
        const sibs = siblings(nodes, rootId, id)
        if (sibs.length > 1) {
          entries.push({ type: 'group', ids: sibs.slice(), activeId: id })
          sibs.forEach((s) => ordered.push(s))
        } else {
          entries.push({ type: 'row', id })
          ordered.push(id)
        }
      }
    }
    return { entries, ordered }
  })
  const entries = $derived(built.entries)
  const ordered = $derived(built.ordered)

  let sel = $state<string | undefined>(undefined)
  // Seed the selection from the current turn on first render.
  let seeded = false
  $effect(() => {
    if (!seeded) {
      sel = currentId
      seeded = true
    }
  })

  // Focus the input on mount.
  $effect(() => {
    if (inputEl) inputEl.focus()
  })

  // Re-anchor the selection to the first row whenever the query changes and the
  // current selection is no longer present.
  $effect(() => {
    void q
    if (!sel || ordered.indexOf(sel) < 0) sel = ordered[0]
  })

  // Jump mode: typed digits target a turn number (1-based depth on the active
  // path). When the typed prefix matches exactly one possible turn number, jump
  // immediately; while ambiguous (e.g. "1" could still become 10 or 11), just
  // highlight the exact match and wait for more digits or ⏎.
  $effect(() => {
    if (mode !== 'jump') return
    const s = q.trim()
    if (!/^\d+$/.test(s)) return
    const candidates: number[] = []
    for (let d = 1; d <= path.length; d++) if (String(d).startsWith(s)) candidates.push(d)
    const n = Number(s)
    if (candidates.length === 1 && candidates[0] === n) {
      onJump(path[n - 1])
      return
    }
    if (n >= 1 && n <= path.length) sel = path[n - 1]
  })

  function onInput() {
    // Jump mode only accepts turn numbers; searching is opt-in via the button.
    if (mode === 'jump') q = q.replace(/\D+/g, '')
  }

  function enterSearch() {
    mode = 'search'
    q = ''
    inputEl?.focus()
  }

  function onKey(e: KeyboardEvent) {
    const i = Math.max(0, sel ? ordered.indexOf(sel) : 0)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = ordered[Math.min(ordered.length - 1, i + 1)]
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = ordered[Math.max(0, i - 1)]
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (sel) onJump(sel)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }
</script>

{#snippet Row(id: string, inGroup?: boolean)}
  {@const n = nodes[id] as Turn}
  {@const on = id === sel}
  {@const isCurrent = id === currentId}
  {@const active = onPath(id)}
  {@const pending = n.respondedAt === null}
  <div
    role="option"
    aria-selected={on}
    style="width:100%;text-align:left;display:flex;align-items:flex-start;gap:var(--arbol-space-3);background:{on
      ? 'var(--arbol-color-accent-soft)'
      : 'transparent'};border:1px solid {on
      ? 'color-mix(in oklch, var(--arbol-color-accent) 30%, transparent)'
      : 'transparent'};border-radius:var(--arbol-radius-m);padding:var(--arbol-space-2) var(--arbol-space-3);margin-bottom:2px"
  >
    <span
      style="flex-shrink:0;min-width:22px;height:22px;margin-top:1px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:{inGroup && active
        ? 'var(--arbol-color-accent)'
        : 'var(--arbol-color-surface-2)'};border:1px solid {inGroup && active
        ? 'var(--arbol-color-accent)'
        : 'var(--arbol-color-border)'};font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);color:{inGroup && active
        ? 'var(--arbol-color-accent-ink)'
        : on
          ? 'var(--arbol-color-accent)'
          : 'var(--arbol-color-text-muted)'}"
    >
      {depthOf(id)}
    </span>
    <span style="flex:1;min-width:0">
      <span
        style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 var(--arbol-type-body)/1.35 var(--arbol-font-ui);color:{on
          ? 'var(--arbol-color-accent)'
          : 'var(--arbol-color-text)'}"
      >
        {firstLine(n.message)}
      </span>
      <span
        style="display:flex;align-items:center;gap:7px;margin-top:2px;flex-wrap:nowrap;white-space:nowrap;font:400 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
      >
        {fmtAgo(n.sentAt)}
        {#if pending}
          <span style="opacity:0.4">·</span>
          <span style="display:inline-flex;align-items:center;gap:4px;color:var(--arbol-color-accent)">
            <Dot color="var(--arbol-color-accent)" pulse /> responding
          </span>
        {/if}
        {#if inGroup && active}
          <span style="opacity:0.4">·</span>
          <span style="color:var(--arbol-color-accent)">active branch</span>
        {/if}
        {#if isCurrent && !inGroup}
          <span style="opacity:0.4">·</span>
          <span>current</span>
        {/if}
      </span>
    </span>
  </div>
{/snippet}

{#snippet BranchGlyph(size: number)}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="display:block"
    aria-hidden="true"
  >
    <line x1="6" y1="4" x2="6" y2="14.5" />
    <circle cx="6" cy="18" r="2.6" />
    <circle cx="18" cy="6.5" r="2.6" />
    <path d="M18 9.1a8.4 8.4 0 0 1-8.4 8.4" />
  </svg>
{/snippet}

<div
  style="position:absolute;inset:0;z-index:60;display:flex;justify-content:center;align-items:flex-start;padding-top:9vh;background:color-mix(in oklch, var(--arbol-color-bg) 55%, transparent);backdrop-filter:blur(2px);animation:arbolfade .12s ease"
>
  <div
    style="width:min(560px, 92%);max-height:78%;display:flex;flex-direction:column;background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);box-shadow:var(--arbol-shadow-pop);overflow:hidden;animation:arbolpop .14s cubic-bezier(.2,.7,.2,1)"
  >
    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-3);padding:var(--arbol-space-3) var(--arbol-space-4);border-bottom:1px solid var(--arbol-color-border)"
    >
      <span style="color:var(--arbol-color-text-muted);display:flex;flex-shrink:0">
        <RingsMark size={16} color="var(--arbol-color-accent)" />
      </span>
      <input
        bind:this={inputEl}
        bind:value={q}
        oninput={onInput}
        onkeydown={onKey}
        placeholder={mode === 'jump' ? 'Type a turn number to jump…' : 'Search every branch…'}
        style="flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--arbol-color-text);font:400 var(--arbol-type-body)/1.3 var(--arbol-font-ui)"
      />
      {#if mode === 'jump'}
        <button
          onclick={enterSearch}
          style="flex-shrink:0;cursor:pointer;padding:3px 9px;border-radius:6px;background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);color:var(--arbol-color-text-muted);font:500 var(--arbol-type-label)/1 var(--arbol-font-mono)"
        >
          Search
        </button>
      {/if}
      <span style="flex-shrink:0;font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)">
        {ordered.length}
      </span>
    </div>

    <div style="overflow-y:auto;padding:5px">
      {#if ordered.length === 0}
        <div style="padding:var(--arbol-space-5);text-align:center;color:var(--arbol-color-text-muted);font:400 var(--arbol-type-body)/1.4 var(--arbol-font-ui)">
          No turns match “{q}”.
        </div>
      {/if}
      {#each entries as en, i (en.type === 'row' ? en.id : 'g' + i)}
        {#if en.type === 'row'}
          {@render Row(en.id)}
        {:else}
          <!-- Branch group — a boxed cluster of the sibling paths at a fork. -->
          <div
            style="margin:4px 0 6px;padding:5px 5px 3px;border-radius:var(--arbol-radius-m);background:color-mix(in oklch, var(--arbol-color-accent) 6%, transparent);border:1px solid color-mix(in oklch, var(--arbol-color-accent) 22%, transparent)"
          >
            <div
              style="display:flex;align-items:center;gap:6px;padding:2px 6px 5px;color:var(--arbol-color-accent);font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:0.4px;text-transform:uppercase"
            >
              {@render BranchGlyph(13)}
              Branch point · {en.ids.length} paths
            </div>
            {#each en.ids as sid (sid)}
              {@render Row(sid, true)}
            {/each}
          </div>
        {/if}
      {/each}
    </div>

    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-4);flex-shrink:0;padding:var(--arbol-space-2) var(--arbol-space-4);border-top:1px solid var(--arbol-color-border);font:400 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
    >
      <span style="display:inline-flex;align-items:center;gap:6px">
        <KbdHint k="↑" />
        <KbdHint k="↓" /> move
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px">
        <KbdHint k="⏎" /> jump
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px">
        <KbdHint k="esc" /> close
      </span>
      <span style="flex:1"></span>
      <span style="display:inline-flex;align-items:center;gap:5px;opacity:0.85;white-space:nowrap">
        {@render BranchGlyph(12)} switches branch
      </span>
    </div>
  </div>
</div>
