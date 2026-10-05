/* Quick Actions — shared types (extracted so .svelte components can import the
 * exported `QuickAction` type, which cannot live in a .svelte instance script). */
import type { Snippet } from 'svelte'

/* One registered action. `key` is the symbol shown as a keycap AND the trigger
 * character (matched case-insensitively). `icon` is a Snippet (the caller passes
 * `{#snippet icon()}<CheckCircleIcon size={16} />{/snippet}`); QuickActionRow
 * renders it with `{@render action.icon()}`. */
export type QuickAction = {
  key: string
  label: string
  desc?: string
  icon?: Snippet
  onRun: () => void
  disabled?: boolean
  danger?: boolean
}
