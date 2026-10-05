<script lang="ts">
  import { Button, Card, callNative, deliverNotificationComunicado, deliverPriorityNotificationComunicado } from '@arbol/design-system'
  import { onMount } from 'svelte'

  type DeliveryState =
    | { kind: 'idle'; message: string }
    | { kind: 'delivering'; message: string }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }

  let delivery = $state<DeliveryState>({
    kind: 'idle',
    message: 'Use this native test to add a Comunicado to the floating feed.',
  })
  let speciesEnabled = $state<Record<string, boolean>>({
    notification: true,
    'priority-notification': true,
    debug: true,
    'build-success': true,
    'build-failure': true,
  })
  let togglingSpecies = $state<string | null>(null)
  let speciesError = $state<string | null>(null)

  const speciesName = (species: string) => {
    if (species === 'notification') return 'Notification Comunicado'
    if (species === 'priority-notification') return 'Priority Notification Comunicado'
    if (species === 'build-success') return 'Build Success Comunicado'
    if (species === 'build-failure') return 'Build Failure Comunicado'
    return 'Debug Comunicado'
  }

  async function loadSpeciesStates() {
    try {
      const result = await callNative('comunicado.species.states')
      if (result?.ok && result.species && typeof result.species === 'object') {
        speciesEnabled = { ...speciesEnabled, ...result.species }
      } else if (result?.error) {
        speciesError = result.error
      }
    } catch (error) {
      speciesError = error instanceof Error ? error.message : String(error)
    }
  }

  async function toggleSpecies(species: string) {
    togglingSpecies = species
    speciesError = null
    try {
      const result = await callNative('comunicado.species.setEnabled', {
        species,
        enabled: !speciesEnabled[species],
      })
      if (!result?.ok) throw new Error(result?.error || `Could not update ${speciesName(species)}`)
      speciesEnabled = { ...speciesEnabled, [species]: Boolean(result.enabled) }
    } catch (error) {
      speciesError = error instanceof Error ? error.message : String(error)
    } finally {
      togglingSpecies = null
    }
  }

  onMount(() => { void loadSpeciesStates() })

  const hasNativeBridge = () => Boolean(window.webkit?.messageHandlers?.arbol)

  async function testComunicado(priority = false) {
    if (!hasNativeBridge()) {
      delivery = {
        kind: 'error',
        message: 'The native Arbol bridge is unavailable. Open Comunicados in the Willo Station macOS app.',
      }
      return
    }

    delivery = { kind: 'delivering', message: 'Requesting native delivery…' }
    const species = priority ? 'priority-notification' : 'notification'
    const label = priority ? 'Priority Notification Comunicado' : 'Notification Comunicado'
    const id = `willo-${species}-test-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`

    try {
      const result = await (priority ? deliverPriorityNotificationComunicado : deliverNotificationComunicado)({
        id,
        title: `${label} test`,
        content: 'This Comunicado was triggered from Willo Station.',
        descriptor: {
          type: 'app',
          ui: 'elma',
          query: { source: `willo-${species}-comunicado-test` },
        },
      })
      delivery = {
        kind: 'success',
        message: `${label} Feed delivery accepted (${result.id ?? id}). Click the Comunicado card to dismiss it and open Elma Chat.`,
      }
    } catch (error) {
      delivery = {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
</script>

<section class="comunicados-page" aria-labelledby="comunicados-heading">
  <header>
    <p class="eyebrow">Willo Station</p>
    <h1 id="comunicados-heading">Comunicados</h1>
    <p>Comunicado Species and their user-facing deliveries.</p>
  </header>

  {#each ['build-success', 'build-failure'] as species}
    <Card>
      <div class="species-card">
        <div class="species-heading">
          <div>
            <p class="species-label">Comunicado Species</p>
            <h2>{speciesName(species)}</h2>
          </div>
          <div class="species-controls">
            <span class:enabled={speciesEnabled[species]} class="species-state">{speciesEnabled[species] ? 'Enabled' : 'Disabled'}</span>
            <Button onclick={() => toggleSpecies(species)} disabled={!hasNativeBridge() || togglingSpecies === species} aria-pressed={speciesEnabled[species]}>
              {togglingSpecies === species ? 'Saving…' : speciesEnabled[species] ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
        <p>Shows a build {species === 'build-success' ? 'success' : 'failure'} in the Comunicado Feed and plays a {species === 'build-success' ? 'Glass' : 'Basso'} sound. Click the Comunicado to open the build log.</p>
      </div>
    </Card>
  {/each}

  {#if speciesError}
    <p class="result error" role="alert">{speciesError}</p>
  {/if}

  <Card>
    <div class="species-card">
      <div class="species-heading">
        <div>
          <p class="species-label">Comunicado Species</p>
          <h2>Notification Comunicado</h2>
        </div>
        <div class="species-controls">
          <span class:enabled={speciesEnabled.notification} class="species-state">
            {speciesEnabled.notification ? 'Enabled' : 'Disabled'}
          </span>
          <Button
            kind="secondary"
            onclick={() => toggleSpecies('notification')}
            disabled={!hasNativeBridge() || togglingSpecies === 'notification'}
            aria-pressed={speciesEnabled.notification}
          >
            {togglingSpecies === 'notification' ? 'Saving…' : speciesEnabled.notification ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      <p class="description">
        Delivers a title and content to Willo's floating Comunicado Feed. No macOS native
        notification is created. Clicking the Comunicado card changes its state to dismissed.
      </p>

      <div class="notification-preview" aria-label="Test notification payload">
        <strong>Notification Comunicado test</strong>
        <span>This Comunicado was triggered from Willo Station.</span>
      </div>

      <div class="actions">
        <Button kind="primary" onclick={testComunicado} disabled={!speciesEnabled.notification || delivery.kind === 'delivering'}>
          {delivery.kind === 'delivering' ? 'Delivering…' : 'Test Comunicado Feed'}
        </Button>
      </div>

      <p class:success={delivery.kind === 'success'} class:error={delivery.kind === 'error'} class="result" aria-live="polite">
        {delivery.message}
      </p>
    </div>
  </Card>

  <Card>
    <div class="species-card">
      <div class="species-heading">
        <div>
          <p class="species-label">Comunicado Species</p>
          <h2>Priority Notification Comunicado</h2>
        </div>
        <div class="species-controls">
          <span class:enabled={speciesEnabled['priority-notification']} class="species-state">
            {speciesEnabled['priority-notification'] ? 'Enabled' : 'Disabled'}
          </span>
          <Button
            kind="secondary"
            onclick={() => toggleSpecies('priority-notification')}
            disabled={!hasNativeBridge() || togglingSpecies === 'priority-notification'}
            aria-pressed={speciesEnabled['priority-notification']}
          >
            {togglingSpecies === 'priority-notification' ? 'Saving…' : speciesEnabled['priority-notification'] ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      <p class="description">
        Delivers a title and content to Willo's floating Comunicado Feed with the same behavior
        as Notification Comunicado. Its setting is independent, so it remains visible when
        Notification Comunicado is disabled.
      </p>

      <div class="notification-preview" aria-label="Test priority notification payload">
        <strong>Priority Notification Comunicado test</strong>
        <span>This important Comunicado was triggered from Willo Station.</span>
      </div>

      <div class="actions">
        <Button kind="primary" onclick={() => testComunicado(true)} disabled={!speciesEnabled['priority-notification'] || delivery.kind === 'delivering'}>
          {delivery.kind === 'delivering' ? 'Delivering…' : 'Test Priority Comunicado Feed'}
        </Button>
      </div>
    </div>
  </Card>

  <Card>
    <div class="species-card">
      <div class="species-heading">
        <div>
          <p class="species-label">Comunicado Species</p>
          <h2>Debug Comunicado</h2>
        </div>
        <div class="species-controls">
          <span class:enabled={speciesEnabled.debug} class="species-state">
            {speciesEnabled.debug ? 'Enabled' : 'Disabled'}
          </span>
          <Button
            kind="secondary"
            onclick={() => toggleSpecies('debug')}
            disabled={!hasNativeBridge() || togglingSpecies === 'debug'}
            aria-pressed={speciesEnabled.debug}
          >
            {togglingSpecies === 'debug' ? 'Saving…' : speciesEnabled.debug ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      <p class="description">
        Displays any complete durable Signal as formatted JSON in a non-activating, always-on-top
        macOS panel. Email Parser output Signals request this Species automatically through the
        <code>email-parser.output.debug-comunicado</code> Reaction.
      </p>

      <div class="notification-preview" aria-label="Debug Comunicado behavior">
        <strong>Actions</strong>
        <span><b>Dismiss</b> closes the panel. <b>Chat</b> closes it, attaches Signal metadata, parser output, and the raw email body as a Chat Note, then opens the Elma Composer.</span>
      </div>

      <p class="result">
        Panels wait while an Arbol UI is foreground and appear when another application becomes active.
        Multiple Signals are queued and shown one at a time.
      </p>
    </div>
  </Card>
</section>

<style>
  .comunicados-page {
    width: min(760px, 100%);
    display: grid;
    gap: var(--arbol-space-5);
  }
  header { display: grid; gap: var(--arbol-space-2); }
  header h1 { margin: 0; font: 650 28px/1.2 var(--arbol-font-ui); }
  header > p:last-child,
  .description {
    margin: 0;
    color: var(--arbol-color-text-muted);
    line-height: 1.5;
  }
  .eyebrow,
  .species-label {
    margin: 0;
    color: var(--arbol-color-accent);
    font: 650 11px/1 var(--arbol-font-mono);
    letter-spacing: .09em;
    text-transform: uppercase;
  }
  .species-card { display: grid; gap: var(--arbol-space-4); }
  .species-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--arbol-space-4);
  }
  .species-heading > div { display: grid; gap: var(--arbol-space-2); }
  .species-heading h2 { margin: 0; font: 620 19px/1.25 var(--arbol-font-ui); }
  .species-controls { display: flex; align-items: center; gap: var(--arbol-space-3); }
  .species-state {
    flex: none;
    color: var(--arbol-color-text-muted);
    font: 600 11px/1 var(--arbol-font-mono);
    text-transform: uppercase;
  }
  .species-state.enabled { color: var(--arbol-color-ok); }
  .notification-preview {
    display: grid;
    gap: 8px;
    padding: var(--arbol-space-4);
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-l);
    background: var(--arbol-color-surface-2);
  }
  .notification-preview strong { font: 620 14px/1.3 var(--arbol-font-ui); }
  .notification-preview span {
    margin: 0;
    color: var(--arbol-color-text-muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .description code {
    font: 500 12px/1.4 var(--arbol-font-mono);
    color: var(--arbol-color-accent);
  }
  .actions { display: flex; align-items: center; gap: var(--arbol-space-3); }
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
