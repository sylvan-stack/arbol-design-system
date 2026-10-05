<script lang="ts">
  import type { Snippet } from 'svelte'
  let { children, kind = 'mute' }:
    { children: Snippet; kind?: 'accent' | 'ok' | 'err' | 'mute' } = $props()

  const map: Record<string, [string, string]> = {
    accent: ['var(--arbol-color-accent-soft)', 'var(--arbol-color-accent)'],
    ok: ['color-mix(in oklch, var(--arbol-color-ok) 16%, transparent)', 'var(--arbol-color-ok)'],
    err: ['color-mix(in oklch, var(--arbol-color-err) 16%, transparent)', 'var(--arbol-color-err)'],
    mute: ['var(--arbol-color-surface-2)', 'var(--arbol-color-text-muted)'],
  }
  const pair = $derived(map[kind] || map.mute)
</script>

<span
  style="background:{pair[0]};color:{pair[1]};border-radius:99px;padding:2px 9px;
         font:600 var(--arbol-type-label)/1.3 var(--arbol-font-ui);white-space:nowrap"
>
  {@render children()}
</span>
