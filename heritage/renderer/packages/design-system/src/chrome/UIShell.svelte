<script lang="ts">
  import type { Snippet } from 'svelte'
  import Header from './Header.svelte'
  import ThemeSwitcher from './ThemeSwitcher.svelte'
  import { callNative } from '../bridge/arbol'
  import { barStyle, installSharedCmdNumberHotkeys, installSharedWilloPageHotkeys } from './chrome'

  /* Every UI's root grid: three full-width rows — Header / Viewport / Status Bar
   * (ux-ui-guide.md §1.5). Shared so all UIs match. (Ported from React.) */
  let {
    title,
    headerGlyph,
    headerLead,
    headerExtras,
    headerActions,
    headerRunning = false,
    theme,
    onTheme,
    status,
    children,
    enableSharedCmdNumberHotkeys = true,
  }: {
    title: string | Snippet
    headerGlyph?: Snippet
    headerLead?: Snippet
    headerExtras?: Snippet
    headerActions?: Snippet
    headerRunning?: boolean
    theme?: string
    onTheme?: (id: string) => void
    status?: Snippet
    children: Snippet
    enableSharedCmdNumberHotkeys?: boolean
  } = $props()

  $effect(() => {
    if (!enableSharedCmdNumberHotkeys) return
    return installSharedCmdNumberHotkeys()
  })

  // Option+1…5 is intentionally renderer-local: UIShell only exists while an
  // Arbol UI is active, and the DOM listener receives no events from other apps.
  $effect(() => installSharedWilloPageHotkeys())

  function toggleWindowSize(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target?.closest('[data-arbol-window-header]')) return
    if (target.closest('button,input,textarea,select,a,[role=button],[data-arbol-sound-control]')) return
    callNative('app.toggleWindowSize', {}).catch(() => {})
  }
</script>

<div
  role="presentation"
  ondblclick={toggleWindowSize}
  style="display:grid;grid-template-columns:minmax(0, 1fr);
         grid-template-rows:var(--arbol-control-bar-height) 1fr var(--arbol-control-bar-height);
         height:100%;background:var(--arbol-color-bg);color:var(--arbol-color-text)"
>
  <Header {title} glyph={headerGlyph} {headerLead} running={headerRunning}>
    {#if headerExtras}{@render headerExtras()}{/if}
    {#if headerActions}{@render headerActions()}{/if}
    {#if theme && onTheme}<ThemeSwitcher {theme} {onTheme} />{/if}
  </Header>

  <div style="min-height:0;min-width:0;overflow:hidden">{@render children()}</div>

  <!-- Build info deliberately lives only in the tray menu; repeating it here
       cost status-bar space and showed a rebuild time that an archived-build
       restore made misleading. -->
  <div style="{barStyle}justify-content:space-between;border-top:1px solid var(--arbol-color-border)">
    {#if status}{@render status()}{/if}
  </div>
</div>
