<script lang="ts">
  /* The floating light stripe. `neutral` = freshly-created request; `amber` =
   * output is streaming. Sits behind the content so it sweeps over the card.
   * (Ported from ResponseView's ArbolSheen.) */
  let { tone }: { tone: 'neutral' | 'amber' } = $props()

  const core = $derived(tone === 'amber' ? 'rgba(245,158,11,.52)' : 'rgba(255,255,255,.46)')
  const glow = $derived(tone === 'amber' ? 'rgba(245,158,11,.22)' : 'rgba(255,255,255,.18)')
</script>

<span
  aria-hidden="true"
  style="position:absolute;z-index:1;top:-55%;bottom:-55%;left:0;width:42%;background:linear-gradient(90deg, transparent 0%, {glow} 30%, {core} 50%, {glow} 70%, transparent 100%);box-shadow:0 0 22px {glow};opacity:0.95;transform:translateX(-150%) skewX(-16deg);animation:elma-arbol-sheen 2.15s ease-in-out infinite;pointer-events:none"
></span>
