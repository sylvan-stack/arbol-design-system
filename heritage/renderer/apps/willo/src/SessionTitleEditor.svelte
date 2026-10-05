<script lang="ts">
  /* Inline station-title editor (Cmd-click a card title). Enter saves, Escape
   * cancels; classes come from willo.css (.willo-title-edit). */
  import { focusCurrentWindow } from './api'

  let { value, busy = false, onSave, onCancel }: {
    value: string
    busy?: boolean
    onSave: (title: string) => void
    onCancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally — the editor intentionally seeds
  // from the title at mount; live renames while editing must not clobber input
  let draft = $state(value)
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    /* A Cmd-click can mount this editor without making the WKWebView key, so
     * the input looks focused but receives no key events until clicked. Make
     * the native window key first, then focus the actual HTML input. */
    let cancelled = false
    focusCurrentWindow().finally(() => requestAnimationFrame(() => {
      if (cancelled) return
      input?.focus()
      input?.select()
    }))
    return () => { cancelled = true }
  })

  function submit() {
    const title = draft.trim()
    if (!title || busy) return
    onSave(title)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="willo-title-edit" onclick={(e) => e.stopPropagation()}>
  <input bind:this={input} bind:value={draft} disabled={busy} aria-label="Session title" onkeydown={onKeydown} />
  <button type="button" class="willo-title-edit-ok" disabled={busy || !draft.trim()} onclick={submit}>OK</button>
  <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
</div>
