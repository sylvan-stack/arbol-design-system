<script lang="ts">
  /* ContextStrip — a slim muted mono line in the empty state so hotkey-driven
   * changes (repo / IP / model / thinking) stay visible even with no other chrome.
   * (Ported from React; RepoGlyph is inlined here since components.tsx is still
   * React — it's a tiny token-tinted emoji tile from framework-agnostic helpers.) */
  import { Dot } from '@arbol/design-system'
  import { repoEmoji, repoHue } from '../constants'

  let { repo, ipLabel, model, thinking }:
    { repo: string; ipLabel: string; model: string; thinking: string } = $props()

  const hue = $derived(repoHue(repo))
</script>

<div style="display:flex;align-items:center;gap:var(--arbol-space-2);flex-wrap:nowrap;white-space:nowrap;font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);color:var(--arbol-color-text-muted);margin-bottom:var(--arbol-space-3)">
  <span
    aria-hidden="true"
    style="width:16px;height:16px;border-radius:4px;flex-shrink:0;display:grid;place-items:center;background:oklch(0.34 0.04 {hue});box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);font-size:10px;line-height:1;user-select:none"
  >{repoEmoji(repo)}</span>
  <span style="color:var(--arbol-color-text)">{repo}</span>
  <Dot color="var(--arbol-color-text-muted)" />
  <span>{ipLabel}</span>
  <Dot color="var(--arbol-color-text-muted)" />
  <span>model: {model}</span>
  <Dot color="var(--arbol-color-text-muted)" />
  <span>thinking: {thinking}</span>
</div>
