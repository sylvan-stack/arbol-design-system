<script lang="ts" module>
  /* Composer — the auto-growing textarea. Used both for the empty-state hero
   * (large, min 10 rows) and the active-state collapsed→expanded composer (3 rows).
   * Uncontrolled: the draft lives in `valueRef` so keystrokes don't re-render the
   * page. ⌘⏎ / ⌃⏎ sends; Esc delegates to the owner (when `onEsc` is given).
   *
   * Image paste support: clipboard image files are captured as base64 attachments
   * in `attachmentsRef` and previewed below the textarea. Core persists them on
   * USER_SENT_MESSAGE.attachments; vision-capable IPs convert them to provider
   * image blocks. */
  import type { ImageAttachment } from '../constants'
  import { pastedChatNoteContent } from './chatNoteClipboard'

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024
  const MAX_IMAGES = 4
  const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

  function dataUrlFor(a: ImageAttachment): string {
    return `data:${a.mime_type};base64,${a.data}`
  }

  function readImage(file: File): Promise<ImageAttachment> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onerror = () => reject(new Error('failed to read pasted image'))
      r.onload = () => {
        const url = String(r.result || '')
        const comma = url.indexOf(',')
        resolve({
          type: 'image',
          mime_type: file.type || 'image/png',
          data: comma >= 0 ? url.slice(comma + 1) : url,
          name: file.name || `pasted-image-${Date.now()}.png`,
          size: file.size,
        })
      }
      r.readAsDataURL(file)
    })
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { createTemporaryTextFile } from '../api'
  import EntityComposerInput from './EntityComposerInput.svelte'
  import { isLargeTextPaste, pastedTextFileLink } from './largeTextPaste'
  import type { ImageAttachment } from '../constants'

  type Ref<T> = { current: T }
  type ComposerDraftChange = {
    text: string
    attachments: ImageAttachment[]
    hasDraft: boolean
    source: HTMLTextAreaElement | null
    composerToken: number
  }

  let {
    valueRef,
    attachmentsRef,
    large,
    minRows,
    hint,
    placeholder,
    onSend,
    onEsc,
    onDraftChange,
    onPasteChatNote,
    autoFocus,
    inputRef,
    composerToken,
  }: {
    valueRef: Ref<string>
    attachmentsRef?: Ref<ImageAttachment[]>
    large?: boolean
    minRows?: number
    hint: string
    placeholder: string
    onSend: () => void
    onEsc?: () => void
    onDraftChange?: (change: ComposerDraftChange) => boolean | void
    onPasteChatNote?: (content: string) => void
    autoFocus?: boolean
    inputRef?: Ref<HTMLTextAreaElement | null>
    composerToken: number
  } = $props()

  // Capture the token at mount. The prop may update before Svelte destroys a
  // keyed instance, but input queued by that instance must retain its origin.
  const mountedComposerToken = untrack(() => composerToken)

  let localEl: HTMLTextAreaElement | null = $state(null)
  const minPx = (minRows || 1) * 22 + 24
  let attachments = $state<ImageAttachment[]>(attachmentsRef?.current || [])
  let pasteError = $state('')
  let savingLargePaste = $state(false)
  let sendAfterLargePaste = false

  const notifyDraft = (text: string, imgs: ImageAttachment[]): boolean => {
    if (!onDraftChange) {
      valueRef.current = text
      if (attachmentsRef) attachmentsRef.current = imgs
      return true
    }
    return onDraftChange({
      text,
      attachments: [...imgs],
      hasDraft: Boolean(text.trim() || imgs.length),
      source: localEl,
      composerToken: mountedComposerToken,
    }) !== false
  }

  const setBothAttachments = (next: ImageAttachment[]) => {
    // Async paste completion can outlive this keyed Composer instance. Let the
    // owner reject a snapshot from a detached textarea before mutating shared
    // refs; otherwise an old UI can overwrite the newly attached session.
    if (!notifyDraft(valueRef.current, next)) return
    if (attachmentsRef) attachmentsRef.current = next
    attachments = next
  }



  function onPaste(e: ClipboardEvent) {
    const clipboardText = e.clipboardData?.getData('text/plain') ?? ''
    const chatNoteContent = pastedChatNoteContent(clipboardText)
    if (chatNoteContent !== null) {
      e.preventDefault()
      onPasteChatNote?.(chatNoteContent)
      return
    }
    const files = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f)
    if (!files.length && isLargeTextPaste(clipboardText)) {
      e.preventDefault()
      if (savingLargePaste) return
      savingLargePaste = true
      pasteError = ''
      const source = e.currentTarget as HTMLTextAreaElement & { insertText?: (text: string) => boolean | void }
      void createTemporaryTextFile(clipboardText)
        .then((result) => {
          if (!result.ok || !result.path) throw new Error(result.error || 'Could not save pasted text')
          const link = pastedTextFileLink(result.path, clipboardText.length)
          if (source.insertText?.(link) !== true) throw new Error('The composer changed before the paste completed')
          const shouldSend = sendAfterLargePaste
          sendAfterLargePaste = false
          savingLargePaste = false
          // ⌘⏎ may arrive while the native host is still writing the paste.
          // Honor it after the link has synchronously updated the shared Draft;
          // otherwise the guarded keypress is swallowed and appears to do nothing.
          if (shouldSend) onSend()
        })
        .catch((err) => {
          sendAfterLargePaste = false
          savingLargePaste = false
          pasteError = err instanceof Error ? err.message : String(err)
        })
      return
    }
    if (!files.length) return
    e.preventDefault()
    pasteError = ''
    const room = MAX_IMAGES - (attachmentsRef?.current || attachments).length
    const accepted = files.slice(0, Math.max(0, room)).filter((f) => SUPPORTED_IMAGE_TYPES.has(f.type) && f.size <= MAX_IMAGE_BYTES)
    if (accepted.length !== files.length) {
      pasteError = `Only PNG/JPEG/WebP/GIF images up to 8 MiB are supported (${MAX_IMAGES} max).`
    }
    Promise.all(accepted.map(readImage))
      .then((imgs) => {
        if (!imgs.length) return
        setBothAttachments([...(attachmentsRef?.current || attachments), ...imgs].slice(0, MAX_IMAGES))
      })
      .catch((err) => {
        pasteError = err instanceof Error ? err.message : String(err)
      })
  }

  function onRichInput(text: string, source: HTMLTextAreaElement) {
    localEl = source
    // The rich editor's public value remains the exact source string. Entity
    // Chips are only a visual projection, so Core and the agent receive URIs.
    return notifyDraft(text, attachmentsRef?.current || attachments)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (savingLargePaste) sendAfterLargePaste = true
      else onSend()
    } else if (e.key === 'Escape' && !e.metaKey && onEsc) {
      e.preventDefault()
      onEsc()
    }
  }

</script>

<div style="width:100%;max-width:var(--arbol-text-area-max-width);margin:0 auto">
  <EntityComposerInput
    value={valueRef.current}
    {placeholder}
    {minPx}
    {large}
    onInput={onRichInput}
    {onPaste}
    {onKeydown}
    onQuickTextSubmit={onSend}
    inputRef={inputRef}
    {autoFocus}
  />
  {#if attachments.length > 0}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      {#each attachments as a, i (`${a.name || 'image'}-${i}`)}
        <div
          title={a.name || 'Pasted image'}
          style="position:relative;width:74px;height:74px;border-radius:var(--arbol-radius-m);overflow:hidden;border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2)"
        >
          <img src={dataUrlFor(a)} alt={a.name || 'Pasted image'} style="width:100%;height:100%;object-fit:cover;display:block" />
          <button
            type="button"
            aria-label="Remove image"
            onclick={() => setBothAttachments(attachments.filter((_, j) => j !== i))}
            style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:999px;border:1px solid var(--arbol-color-border);background:var(--arbol-color-bg);color:var(--arbol-color-text);cursor:pointer;line-height:18px;padding:0"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}
  <div
    style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px 8px;margin-top:var(--arbol-space-2);
           font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:{pasteError
      ? 'var(--arbol-color-warn)'
      : 'var(--arbol-color-text-muted)'}"
  >
    <span>{pasteError || (savingLargePaste
      ? 'Saving pasted text…'
      : attachments.length
        ? `${attachments.length} image${attachments.length === 1 ? '' : 's'} attached · ${hint}`
        : hint)}</span>
  </div>
</div>
