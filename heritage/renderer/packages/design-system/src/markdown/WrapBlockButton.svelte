<script lang="ts">
  /* Toggle for long lines in fenced code/Markdown blocks. The pressed state is
   * exposed to assistive technology and the icon changes from a straight line
   * to a returning line when wrapping is enabled. */
  let { wrapped = false, onToggle }:
    { wrapped?: boolean; onToggle: () => void } = $props()

  const title = $derived(wrapped ? 'Stop wrapping lines' : 'Wrap lines')

  function toggle(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }
</script>

<button
  type="button"
  class:active={wrapped}
  onclick={toggle}
  aria-label={title}
  aria-pressed={wrapped}
  {title}
>
  {#if wrapped}
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h12a4 4 0 0 1 0 8H8" />
      <path d="m11 12-3 3 3 3" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  {/if}
</button>

<style>
  button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    opacity: 0.72;
    color: var(--arbol-color-text-muted);
    border: 1px solid color-mix(in oklch, var(--arbol-color-border) 85%, transparent);
    border-radius: var(--arbol-radius-s);
    background: color-mix(in oklch, var(--arbol-color-surface-2) 92%, transparent);
    box-shadow: 0 1px 3px color-mix(in oklch, black 14%, transparent);
    transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease, background 120ms ease;
  }

  button:hover,
  button:focus-visible,
  button.active {
    opacity: 1;
    color: var(--arbol-color-text);
    border-color: var(--arbol-color-accent);
    background: var(--arbol-color-surface-2);
    outline: none;
  }

  button.active { color: var(--arbol-color-accent); }
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
