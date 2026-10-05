<script lang="ts">
  import type { Snippet } from 'svelte'
  import ShellInsignia from './ShellInsignia.svelte'

  /** @deprecated Use ShellInsignia. Kept as a compatibility alias while callers
   * migrate to the stable UI Shell identity terminology. */
  let { ui, label, sub, glyph, hue = 0 }:
    { ui: string; label: string; sub?: string; glyph: Snippet; hue?: number } = $props()
</script>

<ShellInsignia {ui} {label} {sub} {glyph} {hue} />
