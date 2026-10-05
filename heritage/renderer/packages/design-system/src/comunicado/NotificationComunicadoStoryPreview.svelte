<script lang="ts">
  import Button from '../components/Button.svelte'
  import Card from '../components/Card.svelte'
  import { deliverNotificationComunicado } from '../comunicado'

  let {
    title = 'Notification Comunicado test',
    content = 'This notification was triggered manually from the Arbol Storybook.',
  }: {
    title?: string
    content?: string
  } = $props()

  type DeliveryState =
    | { kind: 'idle'; message: string }
    | { kind: 'delivering'; message: string }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }

  let delivery = $state<DeliveryState>({
    kind: 'idle',
    message: 'Press the button to deliver a real Notification Comunicado.',
  })

  const hasNativeBridge = () => Boolean(window.webkit?.messageHandlers?.arbol)

  async function triggerNotification() {
    if (!hasNativeBridge()) {
      delivery = {
        kind: 'error',
        message:
          'The native Arbol bridge is not available in this Storybook window. Open this story in the Willo native WKWebView to exercise Comunicado Feed delivery; a normal browser cannot call the Comunicado Species.',
      }
      return
    }

    delivery = { kind: 'delivering', message: 'Requesting native delivery…' }
    try {
      // A fresh identity on every click makes repeated tests separate Feed instances.
      const id = `storybook-notification-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
      const result = await deliverNotificationComunicado({
        id,
        title,
        content,
        descriptor: {
          type: 'app',
          ui: 'elma',
          query: { source: 'storybook-notification-comunicado' },
        },
      })
      delivery = {
        kind: 'success',
        message: `Feed delivery accepted (${result.id ?? id}). Click the Comunicado card to dismiss it and open Elma Chat.`,
      }
    } catch (error) {
      delivery = {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
</script>

<div class="page">
  <Card>
    <div class="stack">
      <div>
        <p class="eyebrow">Comunicado Species</p>
        <h1>Notification Comunicado</h1>
        <p class="intro">
          Calls the shipping <code>deliverNotificationComunicado</code> contract. Clicking the resulting
          Comunicado dismisses it from Willo's floating feed and opens Elma Chat.
        </p>
      </div>

      <div class="notification-preview" aria-label="Notification payload">
        <strong>{title}</strong>
        <span>{content}</span>
      </div>

      <div class="actions">
        <Button kind="primary" onclick={triggerNotification} disabled={delivery.kind === 'delivering'}>
          {#if delivery.kind === 'delivering'}Delivering…{:else}Trigger Comunicado Feed{/if}
        </Button>
        <span class:native={hasNativeBridge()} class="bridge-state">
          {hasNativeBridge() ? 'Native bridge connected' : 'Native bridge unavailable'}
        </span>
      </div>

      <p class:success={delivery.kind === 'success'} class:error={delivery.kind === 'error'} class="result" aria-live="polite">
        {delivery.message}
      </p>
    </div>
  </Card>
</div>

<style>
  .page {
    box-sizing: border-box;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(24px, 6vw, 72px);
  }
  .stack { display: grid; gap: var(--arbol-space-5); }
  .eyebrow {
    margin: 0 0 var(--arbol-space-2);
    color: var(--arbol-color-accent);
    font: 650 12px/1 var(--arbol-font-ui);
    letter-spacing: .1em;
    text-transform: uppercase;
  }
  h1 { margin: 0; font: 650 28px/1.2 var(--arbol-font-ui); }
  .intro {
    max-width: 58ch;
    margin: var(--arbol-space-2) 0 0;
    color: var(--arbol-color-text-muted);
    line-height: 1.55;
  }
  code {
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
    font-size: .9em;
  }
  .notification-preview {
    display: grid;
    gap: 6px;
    padding: var(--arbol-space-4);
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-l);
    background: var(--arbol-color-surface-2);
    box-shadow: var(--arbol-shadow-1);
  }
  .notification-preview strong { font: 620 14px/1.3 var(--arbol-font-ui); }
  .notification-preview span { color: var(--arbol-color-text-muted); font-size: 13px; line-height: 1.45; }
  .actions { display: flex; align-items: center; gap: var(--arbol-space-3); flex-wrap: wrap; }
  .bridge-state { color: var(--arbol-color-err); font-size: 12px; }
  .bridge-state.native { color: var(--arbol-color-ok); }
  .result {
    min-height: 20px;
    margin: 0;
    color: var(--arbol-color-text-muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .result.success { color: var(--arbol-color-ok); }
  .result.error { color: var(--arbol-color-err); }
</style>
