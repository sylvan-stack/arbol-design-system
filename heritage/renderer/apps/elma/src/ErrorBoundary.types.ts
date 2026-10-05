/* ErrorBoundary — shared types (extracted so the .svelte component can import
 * the exported props type, which cannot live in a .svelte instance script).
 *
 * Note: ported from React. The React version's `fallback` render-prop and
 * `onError(error, info)` callback are adapted to Svelte 5's <svelte:boundary>:
 *   · `fallback` becomes a Snippet `(error, reset)` rendered in the `failed` slot.
 *   · `onError` loses React's `ErrorInfo` (componentStack) arg — Svelte's
 *     boundary `onerror` only supplies the error + reset; the signature is
 *     narrowed to `(error: unknown) => void`. */
import type { Snippet } from 'svelte'

export interface ErrorBoundaryProps {
  children: Snippet
  /** Render the fallback UI from the caught error + a manual retry callback. */
  fallback: Snippet<[error: Error, reset: () => void]>
  /** When this value changes, a previously-caught error is cleared so the
   *  children re-render — e.g. navigating to another repo/session/turn retries. */
  resetKey?: unknown
  /** Side-channel for logging/telemetry; called once per catch. */
  onError?: (error: unknown) => void
}
