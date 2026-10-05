<script lang="ts">
  import { ENTITIES } from './data'
  import EntityChipGlyph from './EntityChipGlyph.svelte'
  import { parseEntityUri, type EntityUri } from './entityUri'
  import { defaultEntityNavigator, type EntityNavigator } from './navigation'
  import { entityLinkTarget } from './linkTarget'

  let {
    uri,
    navigate = defaultEntityNavigator,
    onNavigationError,
  }: {
    uri: EntityUri | string
    navigate?: EntityNavigator
    onNavigationError?: (error: Error) => void
  } = $props()

  const parsed = $derived(parseEntityUri(uri))
  const title = $derived(parsed.ok ? parsed.value.title : 'Invalid entity reference')
  const meta = $derived(parsed.ok ? ENTITIES.meta(parsed.value.kind) : ENTITIES.meta('chat'))

  let modifierPressed = false
  function rememberModifier(event: PointerEvent) { modifierPressed = event.metaKey || event.ctrlKey }
  function activate(event: MouseEvent | KeyboardEvent) {
    const mouse = event instanceof MouseEvent && event.button === 0
    const keyboard = event instanceof KeyboardEvent && event.key === 'Enter'
    const navigateRequested = (event.metaKey || modifierPressed) && (mouse || keyboard)
    modifierPressed = false
    if (!parsed.ok || !navigateRequested) return
    event.preventDefault()
    event.stopPropagation()
    Promise.resolve(navigate(parsed.value)).catch((cause) => {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      if (onNavigationError) onNavigationError(error)
      else window.dispatchEvent(new CustomEvent('arbol-entity-navigation-error', { detail: { error, entity: parsed.value } }))
    })
  }
</script>

<span
  class={`entity-chip entity-chip-${parsed.ok ? parsed.value.kind : 'invalid'}${parsed.ok ? '' : ' entity-chip-invalid'}`}
  style={`--entity-hue:${meta.hue}`}
  role="link"
  tabindex="0"
  aria-label={parsed.ok ? `${meta.label}: ${title}. Command-click to go to entity; Control-click to link another entity.` : title}
  title={parsed.ok ? `${meta.label} · ⌘-click to go to ${title} · ⌃-click to link` : parsed.error}
  use:entityLinkTarget={parsed.ok ? parsed.value.uri : null}
  onpointerdown={rememberModifier}
  onclick={activate}
  onkeydown={activate}
>
  <span class="entity-chip-glow" aria-hidden="true"></span>
  <span class="entity-chip-icon" aria-hidden="true"><EntityChipGlyph kind={parsed.ok ? parsed.value.kind : 'chat'} size={14} /></span>
  <span class="entity-chip-title">{title}</span>
</span>

<style>
  .entity-chip {
    --entity-color: oklch(0.76 0.19 var(--entity-hue));
    --entity-color-bright: oklch(0.84 0.16 var(--entity-hue));
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    vertical-align: -0.24em;
    min-width: 0;
    max-width: 100%;
    gap: 5px;
    padding: 3px 9px 3px 4px;
    border: 1px solid color-mix(in oklch, var(--entity-color) 62%, var(--arbol-color-border));
    border-radius: 999px;
    background:
      linear-gradient(115deg, color-mix(in oklch, var(--entity-color) 25%, var(--arbol-color-surface)) 0%, color-mix(in oklch, var(--entity-color) 9%, var(--arbol-color-surface-2)) 68%),
      var(--arbol-color-surface-2);
    color: color-mix(in oklch, var(--entity-color-bright) 78%, var(--arbol-color-text));
    box-shadow:
      inset 0 1px 0 color-mix(in oklch, white 18%, transparent),
      0 1px 2px color-mix(in oklch, var(--entity-color) 18%, transparent),
      0 0 0 0 color-mix(in oklch, var(--entity-color) 0%, transparent);
    font: 650 calc(11.5px * var(--arbol-font-scale))/1.25 var(--arbol-font-ui);
    letter-spacing: 0.005em;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    transition: transform 120ms ease, border-color 120ms ease, box-shadow 160ms ease, filter 120ms ease;
  }
  .entity-chip:hover {
    z-index: 1;
    border-color: var(--entity-color);
    box-shadow:
      inset 0 1px 0 color-mix(in oklch, white 24%, transparent),
      0 3px 9px color-mix(in oklch, var(--entity-color) 25%, transparent),
      0 0 0 2px color-mix(in oklch, var(--entity-color) 10%, transparent);
    filter: saturate(1.16) brightness(1.04);
    transform: translateY(-1px);
  }
  .entity-chip:active { transform: translateY(0) scale(0.985); }
  .entity-chip:focus-visible {
    outline: 2px solid var(--entity-color);
    outline-offset: 2px;
  }
  .entity-chip-glow {
    position: absolute;
    z-index: -1;
    inset: -40% 38% 42% -8%;
    border-radius: inherit;
    background: color-mix(in oklch, var(--entity-color) 23%, transparent);
    filter: blur(5px);
    pointer-events: none;
  }
  .entity-chip-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: color-mix(in oklch, var(--entity-color) 22%, var(--arbol-color-bg));
    color: var(--entity-color-bright);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--entity-color) 38%, transparent);
  }
  .entity-chip-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: color-mix(in oklch, var(--entity-color-bright) 38%, var(--arbol-color-text));
  }
  .entity-chip-invalid {
    --entity-hue: 50 !important;
    color: var(--arbol-color-text-muted);
    border-style: dashed;
    filter: saturate(.35);
  }
  @media (prefers-reduced-motion: reduce) {
    .entity-chip { transition: none; }
    .entity-chip:hover { transform: none; }
  }
</style>
