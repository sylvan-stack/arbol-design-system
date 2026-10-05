<script lang="ts">
  import { onMount } from 'svelte'
  import { addOrReplaceTag, applyTagInput, defaultTagSymbol, matchingTagSuggestion, parseTagToken, withTagSymbol, type ChatTag } from './sessionTags'

  let {
    initialTags,
    knownTags,
    saving = false,
    editTag = null,
    onApply,
    onClose,
  }: {
    initialTags: ChatTag[]
    knownTags: string[]
    saving?: boolean
    editTag?: ChatTag | null
    onApply: (tags: ChatTag[]) => void
    onClose: () => void
  } = $props()

  let tags = $state<ChatTag[]>([])
  let input = $state('')
  let symbol = $state('')
  let inputEl = $state<HTMLInputElement | null>(null)

  // Handle dismissal at the window capture boundary rather than only on the
  // tag input. The dialog contains other focusable controls (notably the Willo
  // symbol input), so an input-local Escape handler can miss the key entirely.
  $effect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', dismissOnEscape, true)
    return () => window.removeEventListener('keydown', dismissOnEscape, true)
  })

  onMount(() => {
    tags = initialTags.map((tag) => ({ ...tag }))
    if (editTag) {
      tags = tags.filter((tag) => tag.name.toLocaleLowerCase() !== editTag.name.toLocaleLowerCase())
      input = editTag.value === undefined ? editTag.name : `${editTag.name}=${editTag.value}`
      symbol = editTag.symbol || defaultTagSymbol(editTag.name)
    }
    inputEl?.focus()
    if (editTag) inputEl?.select()
  })

  const suggestion = $derived(matchingTagSuggestion(knownTags, input, tags))
  const parsed = $derived(parseTagToken(input))
  const symbolLength = $derived(Array.from(symbol.trim()).length)
  const symbolValid = $derived(!symbol.trim() || (symbolLength >= 3 && symbolLength <= 4))
  const isPreviousTagValue = $derived(input.trimStart().startsWith('='))
  const validPreviousTagValue = $derived(
    isPreviousTagValue
    && tags.length > 0
    && input.trim().slice(1).trim().length > 0
    && input.trim().slice(1).trim().length <= 256,
  )
  const availableTags = $derived.by(() => {
    const applied = new Set(tags.map((tag) => tag.name.toLocaleLowerCase()))
    const query = input.trim().toLocaleLowerCase()
    return knownTags.filter((name) =>
      !applied.has(name.toLocaleLowerCase())
      && (!query || (!query.includes('=') && name.toLocaleLowerCase().includes(query))),
    )
  })

  function addTag(tag: ChatTag) {
    const decorated = withTagSymbol(tag, symbol)
    if (!decorated) return
    tags = addOrReplaceTag(tags, decorated)
    input = ''
    symbol = ''
    inputEl?.focus()
  }

  function applyCurrentSymbol(next: ChatTag[], raw: string): ChatTag[] | null {
    if (raw.trimStart().startsWith('=')) return next
    const current = parseTagToken(raw)
    if (!current) return next
    const decorated = withTagSymbol(current, symbol)
    if (!decorated) return null
    return next.map((tag) => tag.name.toLocaleLowerCase() === current.name.toLocaleLowerCase()
      ? { ...tag, symbol: decorated.symbol }
      : tag)
  }

  function addCurrent() {
    const next = applyTagInput(tags, input)
    if (!next) return false
    const decorated = applyCurrentSymbol(next, input)
    if (!decorated) return false
    tags = decorated
    input = ''
    symbol = ''
    inputEl?.focus()
    return true
  }

  function submit() {
    if (saving || !symbolValid) return
    let next = tags
    if (input.trim()) {
      const applied = applyTagInput(next, input)
      if (!applied) return
      const decorated = applyCurrentSymbol(applied, input)
      if (!decorated) return
      next = decorated
      tags = next
      input = ''
      symbol = ''
    }
    onApply(next.map((tag) => withTagSymbol(tag, tag.symbol || '') ?? tag))
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && suggestion) {
      event.preventDefault()
      addTag({ name: suggestion })
      return
    }
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      submit()
      return
    }
    if (event.key === ',') {
      event.preventDefault()
      addCurrent()
      return
    }
    if (event.key === 'Backspace' && !input && tags.length) tags = tags.slice(0, -1)
  }

  function dismissFromBackdrop(event: MouseEvent) {
    // Only the backdrop itself dismisses. This remains reliable for children
    // that stop propagation and for future controls that do not.
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    onClose()
  }
</script>

<div role="presentation" onmousedown={dismissFromBackdrop}
  style="position:absolute;inset:0;z-index:70;display:flex;justify-content:flex-start;align-items:flex-start;padding:76px 8px 8px;background:color-mix(in oklch,var(--arbol-color-bg) 65%,transparent)">
  <div role="dialog" aria-modal="true" aria-label={editTag ? 'Edit Chat Tag' : 'Tag Chat'} tabindex="-1"
    style="position:relative;width:100%;padding:var(--arbol-space-3);background:var(--arbol-color-surface);border:1px solid color-mix(in oklch,var(--arbol-color-accent) 55%,var(--arbol-color-border));border-left:4px solid var(--arbol-color-accent);border-radius:3px var(--arbol-radius-m) var(--arbol-radius-m) 3px;box-shadow:var(--arbol-shadow-pop)">
    <div style="margin:1px 2px 9px;font:800 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:1px;text-transform:uppercase;color:var(--arbol-color-accent)">
      {editTag ? 'Edit metadata tag' : 'Add metadata tags'}
    </div>
    <form onsubmit={(event) => { event.preventDefault(); submit() }}>
    <div style="width:100%;min-height:44px;display:flex;align-content:flex-start;align-items:center;flex-wrap:wrap;gap:6px;padding:7px 9px;background:var(--arbol-color-bg);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);cursor:text">
      {#each tags as tag, index (`${tag.name}=${tag.value ?? ''}`)}
        <span style="display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 7px;border-radius:999px;background:var(--arbol-color-accent-soft);border:1px solid color-mix(in oklch,var(--arbol-color-accent) 28%,transparent);color:var(--arbol-color-text);font:600 calc(var(--arbol-type-label) * .92)/1.2 var(--arbol-font-mono)">
          <span style="overflow:hidden;text-overflow:ellipsis">{tag.name}{tag.value !== undefined ? `=${tag.value}` : ''}</span>
          <button type="button" aria-label={`Remove ${tag.name}`} onclick={(event) => { event.stopPropagation(); tags = tags.filter((_, i) => i !== index); inputEl?.focus() }}
            style="all:unset;color:var(--arbol-color-text-muted);cursor:pointer;line-height:1">×</button>
        </span>
      {/each}
      <input bind:this={inputEl} bind:value={input} onkeydown={onKeydown}
        placeholder={tags.length ? '=value or add tag…' : 'tag or tag=value'} aria-label="Tag name and optional value"
        style="all:unset;box-sizing:border-box;flex:1;min-width:120px;padding:3px 0;color:var(--arbol-color-text);font:500 var(--arbol-type-body)/1.2 var(--arbol-font-mono)" />
    </div>

    {#if parsed || editTag}
      <label style="display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;margin-top:7px;color:var(--arbol-color-text-muted);font:600 calc(var(--arbol-type-label) * .88)/1 var(--arbol-font-ui)">
        <span>Willo symbol</span>
        <input bind:value={symbol} maxlength="4" placeholder={parsed ? defaultTagSymbol(parsed.name) : '3–4 chars'} aria-label="Willo tag symbol, 3 to 4 characters"
          style="box-sizing:border-box;width:100%;min-width:0;padding:5px 7px;border:1px solid {symbolValid ? 'var(--arbol-color-border)' : 'var(--arbol-color-err)'};border-radius:var(--arbol-radius-s);background:var(--arbol-color-bg);color:var(--arbol-color-accent);font:750 var(--arbol-type-label)/1 var(--arbol-font-mono);letter-spacing:.5px;text-transform:uppercase" />
      </label>
      {#if !symbolValid}<div style="padding:5px 3px 0;color:var(--arbol-color-err);font:400 calc(var(--arbol-type-label) * .9)/1.2 var(--arbol-font-ui)">Use 3–4 characters.</div>{/if}
    {/if}

    {#if input.trim() && !parsed && !suggestion && !validPreviousTagValue}
      <div style="padding:6px 3px 0;font:400 calc(var(--arbol-type-label) * .9)/1.2 var(--arbol-font-ui);color:var(--arbol-color-err)">
        {#if isPreviousTagValue && tags.length}Type a value after <code>=</code> for <code>{tags[tags.length - 1].name}</code>.
        {:else}Use <code>name</code> or <code>name=value</code>; names cannot contain spaces.{/if}
      </div>
    {/if}

    {#if availableTags.length}
      <div aria-label="Existing repo tags" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:var(--arbol-space-2)">
        {#each availableTags as name (name)}
          <button type="button" onclick={() => addTag({ name })} title={name === suggestion ? 'Tab to insert' : `Add ${name}`}
            style="padding:3px 7px;border-radius:999px;border:1px solid {name === suggestion ? 'var(--arbol-color-accent)' : 'var(--arbol-color-border)'};background:{name === suggestion ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};color:var(--arbol-color-text-muted);font:500 calc(var(--arbol-type-label) * .9)/1.2 var(--arbol-font-mono);cursor:pointer">{name}</button>
        {/each}
      </div>
    {/if}

    <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:7px;color:var(--arbol-color-text-muted);font:400 calc(var(--arbol-type-label) * .82)/1 var(--arbol-font-mono)">
      <span>Enter apply · Esc cancel</span>
      <button type="submit" disabled={saving || !symbolValid || (!!input.trim() && !parsed && !validPreviousTagValue)}
        style="padding:5px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-accent-soft);color:var(--arbol-color-text);font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);cursor:pointer">
        {saving ? 'Applying…' : 'Apply'}
      </button>
    </div>
    </form>
  </div>
</div>
