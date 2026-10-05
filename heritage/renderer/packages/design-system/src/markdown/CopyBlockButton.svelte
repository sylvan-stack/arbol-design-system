<script lang="ts">
  /* Quiet action shared by copyable markdown blocks. It keeps the authored text
   * (rather than rendered DOM text) on the clipboard and briefly confirms the
   * successful action in place. CodeBlock can place it inline beside its other
   * controls; other blocks retain the self-positioning sticky rail. */
  import { onDestroy } from 'svelte'

  let { text, label = 'Copy block', inline = false }:
    { text: string; label?: string; inline?: boolean } = $props()

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

  async function copy(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else if (!legacyCopy(text)) throw new Error('Clipboard copy was rejected')
      status = 'copied'
    } catch {
      // WKWebView clipboard availability can differ by app/OS version. If the
      // modern API rejects, retain the established textarea fallback.
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

  const title = $derived(status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : label)
</script>

<!-- The zero-space sticky rail keeps the action in the visible top-right of a
     tall block without reserving room above its content. Its parent bounds the
     sticky movement, so the action leaves with the block. -->
<div class="copy-block-action" class:inline>
  <button
    type="button"
    class:copied={status === 'copied'}
    class:error={status === 'error'}
    onclick={copy}
    aria-label={title}
    {title}
  >
    {#if status === 'copied'}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
    {:else if status === 'error'}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0 2 2v7a2 2 0 0 0 2 2h3" /></svg>
    {/if}
  </button>
</div>

<style>
  .copy-block-action {
    position: sticky;
    z-index: 2;
    top: 0;
    box-sizing: border-box;
    height: 36px;
    margin-bottom: -36px;
    padding: 8px 8px 0 0;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    pointer-events: none;
  }

  .copy-block-action.inline {
    position: static;
    height: auto;
    margin: 0;
    padding: 0;
  }

  button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    pointer-events: auto;
    opacity: 0.72;
    color: var(--arbol-color-text-muted);
    border: 1px solid color-mix(in oklch, var(--arbol-color-border) 85%, transparent);
    border-radius: var(--arbol-radius-s);
    background: color-mix(in oklch, var(--arbol-color-surface-2) 92%, transparent);
    box-shadow: 0 1px 3px color-mix(in oklch, black 14%, transparent);
    transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease, background 120ms ease;
  }

  button:hover,
  button:focus-visible {
    opacity: 1;
    color: var(--arbol-color-text);
    border-color: var(--arbol-color-accent);
    background: var(--arbol-color-surface-2);
    outline: none;
  }

  button.copied { color: var(--arbol-color-ok); opacity: 1; }
  button.error { color: var(--arbol-color-err); opacity: 1; }
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
