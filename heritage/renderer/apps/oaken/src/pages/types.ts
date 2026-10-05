/* Imperative handle the Swimlanes board page exposes to the App header (reset/zoom/fit).
 * In a .ts file since types can't be exported from a .svelte instance script. */
export type BoardApi = {
  reset: () => void
  narrow: () => void
  widen: () => void
  fit: () => void
  isFit: () => boolean
}
