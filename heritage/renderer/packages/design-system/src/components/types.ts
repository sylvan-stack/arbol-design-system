/* Shared types for design-system components (types can't be exported from a
 * .svelte instance script in runes mode). */
export type MeterData = {
  label?: string
  resetInfo?: string
  percentUsed: number
  displayText: string
}
