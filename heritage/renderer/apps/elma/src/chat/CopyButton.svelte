<script lang="ts">
  /* Small explicit copy action for whole chat messages. Markdown block controls
   * copy individual authored blocks; this control copies the complete prompt or
   * the final user-facing answer. */
  import { onDestroy } from 'svelte'
  import CopyIcon from '../quick/CopyIcon.svelte'

  let { text, label = 'Copy', disabled = false, iconOnly = false }: { text: string; label?: string; disabled?: boolean; iconOnly?: boolean } = $props()

  let status = $state<'idle' | 'copied' | 'error'>('idle')
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  function legacyCopy(value: string): boolean {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }

  async function copy() {
    if (disabled || !text) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else if (!legacyCopy(text)) throw new Error('Clipboard copy was rejected')
      status = 'copied'
    } catch {
      try {
        if (!legacyCopy(text)) throw new Error('Clipboard copy was rejected')
        status = 'copied'
      } catch {
        status = 'error'
      }
    }
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (status = 'idle'), 1800)
  }

  onDestroy(() => {
    if (resetTimer) clearTimeout(resetTimer)
  })

  const visibleLabel = $derived(status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : label)
</script>

<button type="button" onclick={copy} {disabled} class:icon-only={iconOnly} aria-label={visibleLabel} title={visibleLabel}>
  {#if iconOnly}
    {#if status === 'idle'}
      <CopyIcon />
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if status === 'copied'}<path d="m5 12 4 4L19 6" />{:else}<circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" />{/if}
      </svg>
    {/if}
  {:else}
    {visibleLabel}
  {/if}
</button>

<style>
  button {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    color: var(--arbol-color-text-muted);
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui);
  }
  button:hover, button:focus-visible { color: var(--arbol-color-text); outline: none; }
  button:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
  button:disabled { cursor: default; opacity: 0.5; }
  button.icon-only { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; }
  button.icon-only:hover { background: var(--arbol-color-surface-2); }
  button.icon-only:focus-visible { outline: 2px solid var(--arbol-color-link); outline-offset: 2px; }
</style>
