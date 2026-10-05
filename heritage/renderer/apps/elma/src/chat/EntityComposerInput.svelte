<script lang="ts">
  import { mount, tick, unmount } from 'svelte'
  import { EntityChip, splitEntityUris } from '@arbol/design-system'
  import { api, type QuickText } from '../api'
  import { expandQuickText } from './quickText'

  let {
    value = '',
    placeholder,
    minPx,
    large = false,
    onInput,
    onPaste,
    onKeydown,
    onQuickTextSubmit,
    inputRef,
    autoFocus = false,
  }: {
    value?: string
    placeholder: string
    minPx: number
    large?: boolean
    onInput: (text: string, source: HTMLTextAreaElement) => boolean | void
    onPaste?: (event: ClipboardEvent) => void
    onKeydown?: (event: KeyboardEvent) => void
    onQuickTextSubmit?: () => void
    inputRef?: { current: HTMLTextAreaElement | null }
    autoFocus?: boolean
  } = $props()

  let editor: HTMLDivElement | null = $state(null)
  let focused = $state(false)
  let composing = false
  let renderedValue = ''
  let chipMounts: ReturnType<typeof mount>[] = []
  let managedCaret: number | null = null
  let quickTexts = $state<QuickText[]>([])
  let quickTextOpen = $state(false)
  let quickTextTrigger = $state<number | null>(null)

  let quickTextRequest = 0
  function loadQuickTexts() {
    const request = ++quickTextRequest
    void api.quickText().then((items) => { if (request === quickTextRequest) quickTexts = items }).catch(() => {
      if (request === quickTextRequest) quickTexts = []
    })
  }
  $effect(() => { loadQuickTexts() })

  function updateQuickTextTrigger(text: string, caret: number) {
    const startsHere = caret >= 2 && text.slice(caret - 2, caret) === '!@'
    if (startsHere && !quickTextOpen) loadQuickTexts()
    quickTextOpen = startsHere
    quickTextTrigger = startsHere ? caret - 2 : null
  }

  // WebKit cannot reliably edit beside a contenteditable=false element when it
  // is the editor's final child. A zero-width text marker provides an editable
  // caret position but remains absent from the composer's plain-text value.
  const caretMarker = '\u200B'
  const visibleText = (text: string) => text.replaceAll(caretMarker, '')

  const source = () => editor as unknown as HTMLTextAreaElement

  function disposeChips() {
    for (const component of chipMounts) void unmount(component)
    chipMounts = []
  }

  function renderText(text: string) {
    if (!editor) return
    disposeChips()
    const fragment = document.createDocumentFragment()
    for (const segment of splitEntityUris(text)) {
      if (segment.kind === 'text') {
        fragment.append(document.createTextNode(segment.text))
      } else {
        const token = document.createElement('span')
        token.className = 'entity-composer-token'
        token.dataset.entityUri = segment.uri
        token.setAttribute('contenteditable', 'false')
        fragment.append(token)
        chipMounts.push(mount(EntityChip, { target: token, props: { uri: segment.uri } }))
        fragment.append(document.createTextNode(caretMarker))
      }
    }
    editor.replaceChildren(fragment)
    renderedValue = text
  }

  const blockTags = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION', 'FIGURE',
    'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN',
    'NAV', 'OL', 'P', 'PRE', 'SECTION', 'UL',
  ])

  function isBlock(node: Node): node is HTMLElement {
    return node instanceof HTMLElement && blockTags.has(node.tagName)
  }

  function childrenText(node: Node): string {
    let text = ''
    let previousWasBlock = false
    for (const child of Array.from(node.childNodes)) {
      const block = isBlock(child)
      // contenteditable represents Enter differently across WebKit versions:
      // as a literal newline, <br>, or adjacent <div>/<p> blocks. DOM textContent
      // omits the visual boundary between those blocks, which used to turn a
      // multiline draft into one concatenated string when it was saved.
      if (block && (previousWasBlock || (text.length > 0 && !text.endsWith('\n')))) text += '\n'
      else if (!block && previousWasBlock) text += '\n'
      text += nodeText(child)
      previousWasBlock = block
    }
    return text
  }

  function nodeText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return visibleText(node.textContent ?? '')
    if (node instanceof HTMLElement && node.dataset.entityUri) return node.dataset.entityUri
    if (node instanceof HTMLBRElement) return '\n'
    // A lone <br> is the browser's caret placeholder for an empty block. The
    // boundary before that block already represents its newline.
    if (isBlock(node) && node.childNodes.length === 1 && node.firstChild instanceof HTMLBRElement) return ''
    return childrenText(node)
  }

  function rawText(): string {
    if (!editor) return ''
    let text = childrenText(editor).replace(/\u00a0/g, ' ')
    // Chromium/WebKit may retain a lone trailing <br> as a caret placeholder
    // after replacing editor contents. It is not a user-entered newline.
    const last = editor.lastChild
    if (last instanceof HTMLBRElement && !('composerCaret' in last.dataset) && text.endsWith('\n')) text = text.slice(0, -1)
    return text
  }

  function characterOffset(container: Node, offset: number): number {
    if (!editor) return 0
    let count = 0
    const visit = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        count += visibleText(node === container ? text.slice(0, offset) : text).length
        return node === container
      }
      if (node === container) {
        for (let i = 0; i < Math.min(offset, node.childNodes.length); i += 1) count += nodeText(node.childNodes[i]).length
        return true
      }
      if (node instanceof HTMLElement && node.dataset.entityUri) { count += node.dataset.entityUri.length; return false }
      if (node instanceof HTMLBRElement) { count += 1; return false }
      for (const child of node.childNodes) if (visit(child)) return true
      return false
    }
    visit(editor)
    return count
  }

  function restoreCaret(offset: number) {
    if (!editor) return
    const range = document.createRange()
    let remaining = offset
    const place = (node: Node): boolean => {
      if (node instanceof HTMLElement && node.dataset.entityUri) {
        const length = node.dataset.entityUri.length
        if (remaining === 0) { range.setStartBefore(node); return true }
        if (remaining <= length) {
          // A Chip is atomic. Its logical end belongs to the editable marker
          // that follows it, rather than to an uneditable DOM boundary.
          remaining = 0
          return false
        }
        remaining -= length
        return false
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        const length = visibleText(text).length
        if (remaining <= length) {
          let domOffset = 0
          let visibleOffset = 0
          // Skip leading caret markers even for logical offset zero, placing the
          // caret on their editable side. Otherwise typed text could precede the
          // marker and leave WebKit trapped against the Chip again.
          while (domOffset < text.length && (text[domOffset] === caretMarker || visibleOffset < remaining)) {
            if (text[domOffset] !== caretMarker) visibleOffset += 1
            domOffset += 1
          }
          range.setStart(node, domOffset)
          return true
        }
        remaining -= length
        return false
      }
      if (node instanceof HTMLBRElement) {
        if (remaining <= 1) { range.setStartAfter(node); return true }
        remaining -= 1
        return false
      }
      for (const child of node.childNodes) if (place(child)) return true
      return false
    }
    if (!place(editor)) { range.selectNodeContents(editor); range.collapse(false) }
    else range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  async function normalize(caret: number) {
    const text = rawText()
    managedCaret = caret
    renderText(text)
    await tick()
    restoreCaret(caret)
  }

  function handleInput() {
    if (!editor || composing) return
    const selection = window.getSelection()
    const caret = selection?.rangeCount ? characterOffset(selection.anchorNode ?? editor, selection.anchorOffset) : rawText().length
    const text = rawText()
    managedCaret = caret
    updateQuickTextTrigger(text, caret)
    if (onInput(text, source()) === false) return
    // Keep the browser's native editing/caret behavior for ordinary text. Only
    // rebuild the DOM when a complete URI has appeared or an existing Chip was
    // deleted; rebuilding on every keystroke makes contenteditable carets jump.
    const expectedTokens = splitEntityUris(text).filter((segment) => segment.kind === 'entity').length
    const currentTokens = editor.querySelectorAll(':scope > [data-entity-uri]').length
    if (expectedTokens !== currentTokens || chipMounts.length !== currentTokens) void normalize(caret)
    else renderedValue = text
  }

  function sourceSelection(): { start: number; end: number } | null {
    if (!editor) return null
    const selection = window.getSelection()
    if (!selection?.rangeCount) return null
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null
    if (selection.isCollapsed && managedCaret !== null) return { start: managedCaret, end: managedCaret }
    return {
      start: characterOffset(range.startContainer, range.startOffset),
      end: characterOffset(range.endContainer, range.endOffset),
    }
  }

  function horizontalCaretStops(text: string): number[] {
    const stops = [0]
    let offset = 0
    for (const segment of splitEntityUris(text)) {
      offset += segment.kind === 'entity' ? segment.uri.length : segment.text.length
      if (segment.kind === 'entity') {
        // Chips are atomic: the URI's internal source offsets do not correspond
        // to visible caret positions in the editor.
        stops.push(offset)
      } else {
        let textOffset = stops[stops.length - 1]
        for (const character of segment.text) {
          textOffset += character.length
          stops.push(textOffset)
        }
      }
    }
    return stops
  }

  function adjacentCaret(text: string, caret: number, direction: -1 | 1): number {
    const stops = horizontalCaretStops(text)
    if (direction < 0) {
      for (let index = stops.length - 1; index >= 0; index -= 1) {
        if (stops[index] < caret) return stops[index]
      }
      return 0
    }
    for (const stop of stops) if (stop > caret) return stop
    return text.length
  }

  function moveCaretHorizontally(event: KeyboardEvent): boolean {
    if (!editor || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return false
    if (!editor.querySelector('[data-entity-uri]')) return false
    // Preserve the browser's word/document and selection-modifying shortcuts.
    // Clearing managedCaret below lets the next edit use their resulting DOM
    // selection rather than a stale logical position.
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
    const selected = sourceSelection()
    if (!selected) return false
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const caret = selected.start !== selected.end
      ? (direction < 0 ? selected.start : selected.end)
      : adjacentCaret(rawText(), selected.start, direction)
    event.preventDefault()
    managedCaret = caret
    restoreCaret(caret)
    return true
  }

  function commitEdit(next: string, caret: number): boolean {
    const current = rawText()
    const previousSelection = sourceSelection()

    // Programmatic edits (large-paste links and Entity insert/delete handling)
    // must update the DOM before notifying the owner. The production Draft
    // callback immediately snapshots `source.value`; notifying first lets that
    // persistence boundary read the old DOM and overwrite the new Draft with an
    // empty/stale value even though the link is visibly rendered afterward.
    managedCaret = caret
    renderText(next)
    restoreCaret(caret)
    if (onInput(next, source()) === false) {
      const rollbackCaret = previousSelection?.start ?? current.length
      managedCaret = rollbackCaret
      renderText(current)
      restoreCaret(rollbackCaret)
      return false
    }
    return true
  }

  function insertText(text: string): boolean {
    const selection = sourceSelection() || { start: rawText().length, end: rawText().length }
    const current = rawText()
    return commitEdit(
      current.slice(0, selection.start) + text + current.slice(selection.end),
      selection.start + text.length,
    )
  }

  function insertAroundEntity(event: KeyboardEvent): boolean {
    if (!editor || composing || event.isComposing || event.key.length !== 1 || event.metaKey || event.ctrlKey) return false
    if (!editor.querySelector('[data-entity-uri]')) return false
    const selected = sourceSelection()
    if (!selected) return false
    const text = rawText()
    event.preventDefault()
    commitEdit(text.slice(0, selected.start) + event.key + text.slice(selected.end), selected.start + event.key.length)
    return true
  }

  function deleteAroundEntity(event: KeyboardEvent): boolean {
    if (!editor || (event.key !== 'Backspace' && event.key !== 'Delete')) return false
    if (!editor.querySelector('[data-entity-uri]')) return false
    const selected = sourceSelection()
    if (!selected) return false
    const text = rawText()
    let { start, end } = selected
    const segments = splitEntityUris(text)
    // A lone pasted Chip has no meaningful alternate caret position: WebKit can
    // report either side of it (and sometimes a placeholder newline). Backspace
    // or Delete should always remove that atomic draft item.
    if (segments.length === 1 && segments[0].kind === 'entity') {
      start = 0
      end = text.length
    }

    if (start === end) {
      let offset = 0
      for (const segment of splitEntityUris(text)) {
        const segmentEnd = offset + (segment.kind === 'entity' ? segment.uri.length : segment.text.length)
        if (segment.kind === 'entity' && (
          (event.key === 'Backspace' && segmentEnd === start) ||
          (event.key === 'Delete' && offset === start)
        )) {
          start = offset
          end = segmentEnd
          break
        }
        offset = segmentEnd
      }
      if (start === end) {
        if (event.key === 'Backspace' && start > 0) start -= 1
        else if (event.key === 'Delete' && end < text.length) end += 1
        else return false
      }
    }

    event.preventDefault()
    commitEdit(text.slice(0, start) + text.slice(end), start)
    return true
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    if (quickTextOpen && quickTextTrigger !== null && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing) {
      const item = event.key.length === 1
        ? quickTexts.find((candidate) => candidate.activation_key === event.key.toUpperCase())
        : undefined
      if (item) {
        event.preventDefault()
        const text = rawText()
        const trigger = quickTextTrigger
        const expanded = expandQuickText(item.content)
        quickTextOpen = false
        quickTextTrigger = null
        const committed = commitEdit(
          text.slice(0, trigger) + expanded.text + text.slice(trigger + 2),
          trigger + expanded.text.length,
        )
        // Submit through Composer's normal send path rather than synthesizing a
        // keyboard event. commitEdit synchronously publishes the updated Draft,
        // so the sender observes the expanded text and never the [ENTER] token.
        if (committed && expanded.submit) onQuickTextSubmit?.()
        return
      }
      // The picker accepts exactly one assigned key. Any other key dismisses it
      // and continues through the editor's ordinary key handling unchanged.
      quickTextOpen = false
      quickTextTrigger = null
    }
    // Treat Chips as atomic editor content. Native WebKit deletion at a
    // contenteditable=false boundary is inconsistent, especially for a lone Chip.
    if (deleteAroundEntity(event)) return
    if (insertAroundEntity(event)) return
    // WebKit can leave the caret trapped on one side of contenteditable=false
    // children. Move through the source model instead, exposing each Chip as one
    // horizontal caret step regardless of the URI's length.
    if (moveCaretHorizontally(event)) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      // Native navigation (vertical, modified, or selection-extending) changes
      // the DOM selection after keydown. Stop preferring the old logical caret.
      managedCaret = null
    }
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault()
      document.execCommand('insertText', false, '\n')
      return
    }
    onKeydown?.(event)
  }

  function handlePaste(event: ClipboardEvent) {
    onPaste?.(event)
    if (event.defaultPrevented) return
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    event.preventDefault()
    document.execCommand('insertText', false, text)
    // Record the plain-text insertion point synchronously. The input handler
    // will refine this after the browser mutates the DOM and projects the URI.
    managedCaret = rawText().length
  }

  $effect(() => {
    if (!editor) return
    const facade = source()
    Object.defineProperty(editor, 'value', {
      configurable: true,
      get: () => rawText(),
      set: (next: string) => renderText(String(next ?? '')),
    })
    Object.defineProperty(editor, 'insertText', {
      configurable: true,
      value: insertText,
    })
    renderText(value)
    if (inputRef) inputRef.current = facade
    if (autoFocus) editor.focus()
    return () => {
      disposeChips()
      if (inputRef?.current === facade) inputRef.current = null
    }
  })

  $effect(() => {
    if (!focused && value !== renderedValue) renderText(value)
  })
</script>

<div class="entity-composer-wrap" class:large style={`--composer-min:${minPx}px`}>
  {#if !rawText() && !focused}<div class="placeholder">{placeholder}</div>{/if}
  <div
    bind:this={editor}
    class="entity-composer-input"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    aria-label={placeholder}
    tabindex="0"
    spellcheck="true"
    oninput={handleInput}
    onpaste={handlePaste}
    onkeydown={handleEditorKeydown}
    onfocus={() => (focused = true)}
    onpointerdown={() => (managedCaret = null)}
    onblur={() => (focused = false)}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => { composing = false; handleInput() }}
  ></div>
  {#if quickTextOpen}
    <div class="quick-text-popup" aria-live="polite">
      <div class="quick-text-title">Quick Text <span>press one key</span></div>
      {#each quickTexts as item (item.quick_text_id)}
        <div class="quick-text-row"><kbd>{item.activation_key}</kbd><span>{item.name}</span><small>{item.content.replace(/\s+/g, ' ').slice(0, 72)}</small></div>
      {:else}
        <div class="quick-text-empty">No Quick Text configured in Seqoya</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entity-composer-wrap { position: relative; }
  .placeholder {
    position: absolute; z-index: 1; inset: 0; pointer-events: none;
    padding: var(--arbol-space-3) var(--arbol-space-4);
    color: var(--arbol-color-text-muted); font: 400 var(--arbol-type-body)/1.55 var(--arbol-font-ui);
  }
  .large .placeholder { padding: var(--arbol-space-4) var(--arbol-space-5); font-size: var(--arbol-type-title); }
  .entity-composer-input {
    box-sizing: border-box; display: block; width: 100%; min-height: min(var(--composer-min), 50vh); max-height: 50vh;
    overflow-y: auto; outline: none; white-space: pre-wrap; overflow-wrap: anywhere;
    padding: var(--arbol-space-3) var(--arbol-space-4); border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-l); background: var(--arbol-color-surface); color: var(--arbol-color-text);
    box-shadow: var(--arbol-shadow-1); font: 400 var(--arbol-type-body)/1.55 var(--arbol-font-ui);
  }
  .large .entity-composer-input { padding: var(--arbol-space-4) var(--arbol-space-5); font-size: var(--arbol-type-title); }
  .entity-composer-input:focus { border-color: var(--arbol-color-accent); }
  .quick-text-popup { position:absolute; z-index:20; left:12px; right:12px; bottom:calc(100% + 6px); max-height:260px; overflow:auto; padding:8px; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-m); background:var(--arbol-color-bg); box-shadow:var(--arbol-shadow-3); }
  .quick-text-title { display:flex; justify-content:space-between; padding:4px 6px 8px; color:var(--arbol-color-text); font:600 var(--arbol-type-label)/1 var(--arbol-font-ui); }
  .quick-text-title span { color:var(--arbol-color-text-muted); font-weight:400; }
  .quick-text-row { display:grid; grid-template-columns:28px minmax(120px,auto) 1fr; align-items:center; gap:8px; min-height:32px; padding:3px 6px; border-radius:5px; }
  .quick-text-row kbd { display:grid; place-items:center; width:24px; height:24px; border:1px solid var(--arbol-color-accent); border-radius:5px; color:var(--arbol-color-text); font:700 12px var(--arbol-font-mono); }
  .quick-text-row span { color:var(--arbol-color-text); font:500 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  .quick-text-row small { overflow:hidden; color:var(--arbol-color-text-muted); font:11px/1.2 var(--arbol-font-ui); text-overflow:ellipsis; white-space:nowrap; }
  .quick-text-empty { padding:12px 6px; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); }
  .entity-composer-input :global(.entity-composer-token) { display: inline-flex; vertical-align: middle; margin: 0 1px; }
</style>
