<script lang="ts">
  import type { Snippet } from 'svelte'
  let { variant = 'aurora', paused = false, compact = false, enabled = true, children }: {
    variant?: 'aurora' | 'tide' | 'ember'; paused?: boolean; compact?: boolean; enabled?: boolean; children: Snippet
  } = $props()
</script>

<div class="running-background" data-variant={variant} data-paused={paused} data-compact={compact} data-enabled={enabled}>
  {#if enabled}<div class="atmosphere" aria-hidden="true"><i></i><i></i></div>{/if}
  <div class="content">{@render children()}</div>
</div>

<style>
  .running-background { position:relative; isolation:isolate; border-radius:18px; border:1px solid color-mix(in srgb, #8798ee 28%, var(--arbol-color-border)); background:var(--arbol-color-bg); padding:22px; }
  .atmosphere { position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; z-index:-1; }
  .atmosphere i { position:absolute; inset:-45%; display:block; pointer-events:none; }
  .content { min-width:0; }
  /* Broad, soft pools crossing behind the cards. Only transforms animate. */
  [data-variant=aurora] .atmosphere { background:linear-gradient(115deg, #458dff18, #8c6aef10 50%, #fc647518); }
  [data-variant=aurora] i:first-child { background:radial-gradient(ellipse at 25% 45%, #398bff70, transparent 45%), radial-gradient(ellipse at 75% 55%, #f85b7160, transparent 44%); animation:aurora-drift 3s ease-in-out infinite alternate; }
  [data-variant=aurora] i:last-child { background:radial-gradient(ellipse at 50% 80%, #a269e744, transparent 48%); animation:aurora-drift 4s ease-in-out -1.5s infinite alternate-reverse; }
  @keyframes aurora-drift { from { transform:translate(-17%, -12%) rotate(-16deg) scale(1.05); } to { transform:translate(18%, 14%) rotate(18deg) scale(1.22); } }
  .running-background[data-compact=true] { padding:6px; border-radius:10px; }
  .running-background[data-enabled=false], [data-enabled=false] > .content { display:contents; }
  [data-variant=aurora][data-compact=true] .atmosphere { background:linear-gradient(180deg, #458dff28, #8c6aef10 50%, #fc647528); }
  [data-variant=aurora][data-compact=true] i:first-child { background:radial-gradient(ellipse at 50% 25%, #398bff70, transparent 45%), radial-gradient(ellipse at 50% 75%, #f85b7160, transparent 44%); animation-name:aurora-rise; }
  [data-variant=aurora][data-compact=true] i:last-child { background:radial-gradient(ellipse at 50% 55%, #a269e744, transparent 48%); animation-name:aurora-rise; }
  @keyframes aurora-rise { from { transform:translateY(-20%) scale(1.05); } to { transform:translateY(20%) scale(1.22); } }
  /* A cooler wash, with a warm ribbon moving across the section. */
  [data-variant=tide] .atmosphere { background:linear-gradient(120deg, #348afc28, #7963c914 55%, #f269761c); }
  [data-variant=tide] i:first-child { background:linear-gradient(110deg, transparent 26%, #459dff50 39%, #9177df30 49%, #ff74764d 59%, transparent 72%); animation:tide-sweep 14s ease-in-out infinite alternate; }
  [data-variant=tide] i:last-child { inset:auto 0 0; height:2px; background:linear-gradient(90deg, #4eacff, #9f85ed, #fa7885); opacity:.7; }
  @keyframes tide-sweep { from { transform:translateX(-23%) skewX(-12deg); } to { transform:translateX(23%) skewX(12deg); } }
  /* Color hugs the perimeter, leaving the middle especially calm. */
  [data-variant=ember] .atmosphere { background:linear-gradient(120deg, #438cff12, transparent 55%, #fd657618); }
  [data-variant=ember] i:first-child { inset:-25%; background:radial-gradient(ellipse at 10% 65%, #468fff85, transparent 38%), radial-gradient(ellipse at 90% 35%, #ff596d80, transparent 38%); animation:ember-breathe 8s ease-in-out infinite alternate; }
  [data-variant=ember] i:last-child { inset:0; border-radius:inherit; border:1px solid #9a88dc55; box-shadow:inset 0 0 32px #896adc12; }
  @keyframes ember-breathe { from { transform:scale(.95) rotate(-5deg); opacity:.55; } to { transform:scale(1.15) rotate(5deg); opacity:1; } }
  .running-background[data-paused=true] .atmosphere i { animation-play-state:paused; }
  @media (prefers-reduced-motion:reduce) { .running-background[data-variant][data-compact] .atmosphere i { animation:none; } }
  @media (max-width:600px) { .running-background { padding:16px; } }
</style>
