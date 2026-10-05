<script lang="ts">
  /* Storybook preview of the actual Elma Chat header path: the shared Header
   * component, Elma's leaf glyph, title, and the same `running` prop UIShell uses. */
  import { Header } from '@arbol/design-system'
  import ElmaChatGlyph from './ElmaChatGlyph.svelte'

  let { running = true, chatTitle = 'Header animation preview' }: {
    running?: boolean
    chatTitle?: string
  } = $props()
</script>

{#snippet glyph()}<ElmaChatGlyph />{/snippet}

<div class="preview">
  <div class="window">
    <Header title={`Elma Chat - ${chatTitle}`} {glyph} {running} />
    <div class="chat-placeholder" aria-hidden="true">
      <div class="message"></div>
      <div class="message short"></div>
    </div>
  </div>
</div>

<style>
  .preview {
    box-sizing: border-box;
    min-height: 100vh;
    padding: 48px 24px;
    background: var(--arbol-color-bg);
    color: var(--arbol-color-text);
  }

  .window {
    width: min(100%, 1040px);
    height: 360px;
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-l, 16px);
    background: var(--arbol-color-surface);
    box-shadow: 0 18px 48px color-mix(in srgb, #000 20%, transparent);
    display: grid;
    grid-template-rows: var(--arbol-control-bar-height) 1fr;
  }

  .chat-placeholder {
    padding: 42px;
    background: var(--arbol-color-bg);
  }

  .message {
    width: min(72%, 560px);
    height: 54px;
    margin-bottom: 18px;
    border-radius: var(--arbol-radius-m, 12px);
    background: var(--arbol-color-surface-2);
  }

  .message.short { width: min(48%, 360px); }
</style>
