<script lang="ts">
  import type { Snippet } from 'svelte'
  import CompletionSoundToggle from './CompletionSoundToggle.svelte'
  import RingsMark from '../components/RingsMark.svelte'
  import RebuildTrafficLight from './RebuildTrafficLight.svelte'
  import RebuildProgress from './RebuildProgress.svelte'
  import { callNative } from '../bridge/arbol'
  import { barStyle } from './chrome'

  let { title, glyph, headerLead, running = false, children }:
    {
      title: string | Snippet
      glyph?: Snippet
      headerLead?: Snippet
      running?: boolean
      children?: Snippet
    } = $props()


  // The OS window drags from any non-interactive part of the header. WKWebView
  // ignores -webkit-app-region, so call the native drag bridge directly.
  function beginHeaderDrag(e: MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button,input,textarea,select,a,[role=button],[data-arbol-sound-control]')) return
    callNative('app.beginWindowDrag', {}).catch(() => {})
  }
</script>

<div
  class:arbol-header-running-bar={running}
  data-arbol-header-running={running ? '1' : undefined}
  data-arbol-window-header
  onmousedown={beginHeaderDrag}
  role="presentation"
  style="{barStyle}padding-left:calc(var(--arbol-traffic-light-gutter) + 24px);
         border-bottom:1px solid var(--arbol-color-border);min-width:0;position:relative;
         {running ? 'background:linear-gradient(180deg, var(--arbol-color-accent-soft), var(--arbol-color-surface));' : ''}"
>
  <RebuildTrafficLight />
  <RebuildProgress />
  <span class="arbol-header-brand" style="display:inline-flex;align-items:center;gap:8px;color:var(--arbol-color-accent);
               flex-shrink:0;position:relative;isolation:isolate">
    <span class="arbol-header-glyph" style="width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;
                 flex-shrink:0;transform-origin:50% 50%">
      {#if glyph}{@render glyph()}{:else}<RingsMark size={20} color="var(--arbol-color-accent)" />{/if}
    </span>
    <span style="color:var(--arbol-color-text);font-weight:700;font-size:var(--arbol-type-body);
                 line-height:1;letter-spacing:0.2px;white-space:nowrap;transition:color 180ms ease">
      {#if typeof title === 'function'}{@render title()}{:else}{title}{/if}
    </span>
  </span>
  {#if headerLead}
    <span style="display:inline-flex;align-items:center">{@render headerLead()}</span>
  {/if}
  <span style="flex:1;align-self:stretch;-webkit-app-region:drag"></span>
  <CompletionSoundToggle />
  {#if children}
    <span style="display:inline-flex;align-items:center;gap:var(--arbol-space-3)">{@render children()}</span>
  {/if}
</div>

<style>
  /* Running uses a single, full-header “breath”: no stripes, scanner, progress
   * rail, or moving decoration. The contrast changes enough during each 640ms
   * half-cycle to make activity apparent within 500ms without looking busy. */
  .arbol-header-running-bar {
    isolation: isolate;
    overflow: hidden;
    animation: arbol-header-running-breath 640ms ease-in-out infinite alternate !important;
  }

  .arbol-header-running-bar .arbol-header-glyph {
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--arbol-color-accent) 70%, transparent));
  }

  @keyframes arbol-header-running-breath {
    from {
      background: color-mix(in srgb, var(--arbol-color-accent) 9%, var(--arbol-color-surface));
      border-bottom-color: color-mix(in srgb, var(--arbol-color-accent) 55%, var(--arbol-color-border));
      box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--arbol-color-accent) 45%, transparent);
    }
    to {
      background: color-mix(in srgb, var(--arbol-color-accent) 27%, var(--arbol-color-surface));
      border-bottom-color: var(--arbol-color-accent);
      box-shadow:
        inset 0 -3px 0 var(--arbol-color-accent),
        inset 0 -16px 24px -20px color-mix(in srgb, var(--arbol-color-accent) 90%, transparent);
    }
  }
</style>
