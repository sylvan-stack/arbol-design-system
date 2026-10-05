<script lang="ts">
  /* An error boundary for the chat render path.
   *
   * Elma renders purely by folding the durable event log (useSessionView →
   * projectSession → buildTreeFromView → ResponseView/MarkdownView). That pipeline
   * is pure and total today, but a future malformed event or component bug would
   * otherwise white-screen the whole window with NO signal. Wrapping the chat in
   * this boundary converts a blank screen into a readable card (error + session
   * context) while keeping the surrounding shell (nav, repo switching, theme)
   * alive, so the user can navigate to another turn/repo to recover. `resetKey`
   * clears a caught error when it changes, so that navigation retries the render
   * automatically.
   *
   * Ported from React's class-based ErrorBoundary to Svelte 5's <svelte:boundary>.
   * `fallback` is a Snippet `(error, reset)`; the boundary's `reset` is captured so
   * a `resetKey` change can clear the caught error from the outside. */
  import { reportRendererError } from '@arbol/design-system'
  import type { ErrorBoundaryProps } from './ErrorBoundary.types'

  let { children, fallback, resetKey, onError }: ErrorBoundaryProps = $props()

  // The boundary's recovery fn, captured while a failure is being rendered. Used
  // to clear the caught error when `resetKey` changes (navigation retries render).
  let boundaryReset: (() => void) | null = $state(null)

  function handleError(error: unknown, reset: () => void) {
    // Surface to the WebView console (and any host capture).
    console.error('[Elma] render error caught by ErrorBoundary:', error)
    // Structured twin in chat-render.log: a component render crash is exactly
    // the "session won't open, nothing in any log" failure mode.
    reportRendererError('error_boundary', error, { app: 'elma' })
    // Capture the boundary's recovery fn so a later `resetKey` change can clear
    // the caught error from outside the `failed` snippet.
    boundaryReset = reset
    onError?.(error)
  }

  // When resetKey changes while an error is shown, clear it so children re-render.
  let lastResetKey = $state(resetKey)
  $effect(() => {
    if (resetKey !== lastResetKey) {
      lastResetKey = resetKey
      if (boundaryReset) {
        const r = boundaryReset
        boundaryReset = null
        r()
      }
    }
  })
</script>

<svelte:boundary onerror={handleError}>
  {@render children()}

  {#snippet failed(error, reset)}
    {@render fallback(error as Error, reset)}
  {/snippet}
</svelte:boundary>
