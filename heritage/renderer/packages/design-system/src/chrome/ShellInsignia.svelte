<script lang="ts">
  import type { Snippet } from 'svelte'

  /** A UI Shell's composed identity card, with a compact chat presentation. */
  let { ui, label, sub, glyph, detail, hue = 0, showUiName = true, variant = 'shell' }:
    { ui: string; label: string; sub?: string; glyph: Snippet; detail?: string; hue?: number; showUiName?: boolean; variant?: 'shell' | 'chat' } = $props()
</script>

<section
  class="arbol-shell-insignia"
  class:chat={variant === 'chat'}
  aria-label={`${ui} ${label}`}
  style="--arbol-shell-insignia-hue:{hue}deg"
>
  <div class="arbol-shell-insignia-field"></div>
  <div class="arbol-shell-insignia-watermark" aria-hidden="true">
    {@render glyph()}
  </div>
  {#if variant === 'chat'}
    <span class="chat-mark" aria-hidden="true"><span>{@render glyph()}</span></span>
    <div class="chat-content">
      <div class="arbol-shell-insignia-label">{label}</div>
      {#if detail}<div class="chat-detail">{detail}</div>{/if}
    </div>
  {:else}
  <div class="arbol-shell-insignia-name">
    <span class="arbol-shell-insignia-glyph" aria-hidden="true">{@render glyph()}</span>
    {#if showUiName}<span>{ui}</span>{/if}
    {#if detail}<span class="arbol-shell-insignia-detail">{detail}</span>{/if}
  </div>
  <div class="arbol-shell-insignia-label">{label}</div>
  {#if sub != null}<div class="arbol-shell-insignia-sub">{sub}</div>{/if}
  {/if}
</section>

<style>
  .arbol-shell-insignia {
    margin: var(--arbol-space-3);
    padding: var(--arbol-space-4);
    min-height: 104px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 2px;
    border-radius: var(--arbol-radius-l);
    color: var(--arbol-brief-pane-fg);
    box-shadow: var(--arbol-shadow-1);
  }
  .arbol-shell-insignia-field {
    position: absolute;
    inset: 0;
    background: var(--arbol-brief-pane-bg-silver);
    filter: hue-rotate(var(--arbol-shell-insignia-hue));
  }
  .arbol-shell-insignia-watermark {
    position: absolute;
    pointer-events: none;
    top: -22px;
    right: -20px;
    width: 132px;
    height: 132px;
    opacity: 0.46;
    color: var(--arbol-brief-ring);
  }
  .arbol-shell-insignia-name {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 600 var(--arbol-type-label)/1 var(--arbol-font-mono);
    letter-spacing: 1.4px;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .arbol-shell-insignia-detail {
    margin-left: auto;
    white-space: nowrap;
    letter-spacing: normal;
    text-transform: none;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .arbol-shell-insignia-glyph {
    width: 15px;
    height: 15px;
    display: inline-flex;
    flex-shrink: 0;
  }
  .arbol-shell-insignia-label {
    position: relative;
    font-weight: 700;
    font-size: var(--arbol-type-title);
    line-height: 1.15;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .arbol-shell-insignia-sub {
    position: relative;
    font-size: var(--arbol-type-label);
    opacity: 0.82;
  }
  .arbol-shell-insignia.chat {
    min-height: 88px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: start;
    align-content: center;
    gap: 12px;
    border: 1px solid var(--arbol-color-border);
    border-radius: 12px;
    box-shadow: 0 2px 6px -4px var(--arbol-color-shadow);
  }
  .chat .arbol-shell-insignia-field {
    pointer-events: none;
  }
  .chat .arbol-shell-insignia-watermark {
    top: 50%;
    right: -28px;
    width: 156px;
    height: 156px;
    transform: translateY(-50%);
    opacity: 0.3;
    mask-image: linear-gradient(to right, transparent, #000 55%);
  }
  .chat-mark {
    position: relative;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--arbol-brief-pane-fg) 10%, transparent);
  }
  .chat-mark > span {
    display: flex;
    width: 20px;
    height: 20px;
  }
  .chat-content {
    position: relative;
    min-width: 0;
    padding-top: 2px;
  }
  .chat .arbol-shell-insignia-label {
    font-size: var(--arbol-type-body);
    font-weight: 600;
    line-height: 1.4;
    white-space: normal;
    text-wrap: pretty;
  }
  .chat-detail {
    margin-top: 6px;
    opacity: 0.82;
    font: 400 var(--arbol-type-label)/1.4 var(--arbol-font-ui);
    font-variant-numeric: tabular-nums;
  }
</style>
