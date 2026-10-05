<script lang="ts">
  /* A recognizable icon per repo, derived from its name (Arbol → 🌳,
   * …; unknown names get a stable object glyph). Centered on a soft hue-tinted
   * tile so the row still reads as a labeled avatar. */
  import { repoEmoji, repoHue } from './constants'

  let { name, size = 18 }: { name: string; size?: number } = $props()

  const hue = $derived(repoHue(name))
</script>

<span
  style="width:{size}px;height:{size}px;border-radius:{Math.max(4, Math.round(size * 0.24))}px;flex-shrink:0;
         display:grid;place-items:center;background:oklch(0.34 0.04 {hue});
         box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);font-size:{Math.round(size * 0.62)}px;line-height:1;user-select:none"
  aria-hidden="true"
>
  {repoEmoji(name)}
</span>
