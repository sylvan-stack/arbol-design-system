<script lang="ts">
  /* Editable chat title in the Elma header (extracted from App.svelte; mirrors
   * the React ElmaHeaderTitle + ElmaHeaderTitleEditor pair). Display mode shows
   * "Elma Chat - <title>" with a Cmd-click-to-edit button; edit mode swaps in an
   * inline input + OK/Cancel. The draft text + input focus are owned here; App
   * owns `editing`/`busy` and the actual rename (onSave). */
  import { focusCurrentWindow } from './api'

  let { title, editing, busy, onStartEdit, onSave, onCancel }: {
    title: string
    editing: boolean
    busy: boolean
    onStartEdit: (e: MouseEvent) => void
    onSave: (title: string) => void
    onCancel: () => void
  } = $props()

  let draft = $state(title)
  let inputEl: HTMLInputElement | null = null

  // Seed the draft + focus the field when editing begins.
  $effect(() => {
    if (!editing) return
    draft = title.trim() || 'Untitled chat'
    let cancelled = false
    focusCurrentWindow().finally(() => {
      requestAnimationFrame(() => { if (!cancelled) { inputEl?.focus(); inputEl?.select() } })
    })
    return () => { cancelled = true }
  })

  const submit = () => { const t = draft.trim(); if (!t || busy) return; onSave(t) }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  const chatTitle = $derived(title.trim())
</script>

{#if editing}
  <span onclick={(e) => e.stopPropagation()} onmousedown={(e) => e.stopPropagation()} role="presentation"
        style="display:inline-flex;align-items:center;gap:6px;min-width:0">
    <span>Elma Chat -</span>
    <input
      bind:this={inputEl}
      bind:value={draft}
      disabled={busy}
      onkeydown={onKeyDown}
      aria-label="Chat title"
      style="width:min(360px, 42vw);height:24px;box-sizing:border-box;border:1px solid var(--arbol-color-border);
             border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);
             padding:2px 7px;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);outline:none"
    />
    <button type="button" disabled={busy || !draft.trim()} onclick={submit}
      style="height:24px;border:1px solid color-mix(in oklch, var(--arbol-color-accent) 45%, var(--arbol-color-border));
             border-radius:var(--arbol-radius-s);background:var(--arbol-color-accent-soft);color:var(--arbol-color-accent);
             padding:0 8px;font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);
             cursor:{busy || !draft.trim() ? 'default' : 'pointer'};opacity:{busy || !draft.trim() ? 0.55 : 1}">OK</button>
    <button type="button" disabled={busy} onclick={onCancel}
      style="height:24px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);
             background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted);padding:0 8px;
             font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);cursor:{busy ? 'default' : 'pointer'};opacity:{busy ? 0.55 : 1}">Cancel</button>
  </span>
{:else if !chatTitle}
  <span>Elma Chat</span>
{:else}
  <span style="display:inline-flex;align-items:center;gap:6px;min-width:0">
    <span>Elma Chat -</span>
    <button type="button" title="Cmd-click to edit chat title" onclick={onStartEdit}
      style="appearance:none;border:0;background:transparent;color:inherit;padding:0;margin:0;font:inherit;
             font-weight:inherit;letter-spacing:inherit;white-space:nowrap;cursor:default">{chatTitle}</button>
  </span>
{/if}
