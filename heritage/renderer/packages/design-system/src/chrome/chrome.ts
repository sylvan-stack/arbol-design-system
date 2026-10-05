/* Framework-agnostic chrome helpers shared by the Svelte UIShell.
 * (Ported from the React Chrome.tsx — the bridge/themes/tokens are reused as-is.) */
import { callNative } from '../bridge/arbol'

/** The shared header/status bar base style (string form for Svelte `style=`). */
export const barStyle =
  'display:flex;align-items:center;height:100%;' +
  'gap:var(--arbol-space-3);padding:0 var(--arbol-space-4);' +
  'background:var(--arbol-color-surface);border-color:var(--arbol-color-border);' +
  'font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);user-select:none;'

/** Arbol-wide Cmd+0…9 handoff: from any focused non-Elma UI, open Elma and ask
 * it to run the same repo-slot/new-chat command. Returns a cleanup fn. */
export function installSharedCmdNumberHotkeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const digit = /^Digit([0-9])$/.exec(e.code)?.[1] || (/^[0-9]$/.test(e.key) ? e.key : '')
    if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !digit) return
    e.preventDefault()
    e.stopPropagation()
    if (typeof window === 'undefined' || !window.webkit?.messageHandlers?.arbol) return
    callNative('app.open', { ui: 'elma', query: { cmd_number: digit } }).catch((err) =>
      console.error('Arbol Cmd+number handoff failed', err),
    )
  }
  // Capture phase so the shortcut works even when focus is inside an input.
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

export type WilloHotkeyPage = 'stations' | 'slack' | 'emails' | 'runs' | 'monitor'

const WILLO_PAGE_BY_DIGIT_CODE: Record<string, WilloHotkeyPage> = {
  Digit1: 'stations',
  Digit2: 'slack',
  Digit3: 'emails',
  Digit4: 'runs',
  Digit5: 'monitor',
}

/** Arbol-local Option+1…5 navigation: while an Arbol renderer has keyboard
 * focus, activate Willo Station and open the corresponding page. This is a DOM
 * listener rather than a native/global hotkey, so it cannot fire while another
 * application is active. `code` is used because macOS Option changes `key` to
 * symbols such as ¡ and ™. */
export function installSharedWilloPageHotkeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.repeat) return
    const page = WILLO_PAGE_BY_DIGIT_CODE[e.code]
    if (!page) return
    e.preventDefault()
    e.stopPropagation()
    if (typeof window === 'undefined' || !window.webkit?.messageHandlers?.arbol) return
    callNative('app.open', { ui: 'willo', query: { page } }).catch((err) =>
      console.error('Arbol Option+number Willo handoff failed', err),
    )
  }
  // Capture phase keeps the local shortcut available while editing a field.
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
