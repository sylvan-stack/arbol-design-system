<script lang="ts">
  /* A horizontal pause in a document, but drawn as a living Arbol mark rather
   * than a rule: growth rings at the centre send branch/root curves out into
   * the text column. Theme tokens keep it at home in every wood palette. */
  import RingsMark from '../components/RingsMark.svelte'

  let { compact = false }: { compact?: boolean } = $props()
</script>

<div
  class:compact
  class="arbol-separator"
  role="separator"
  aria-label="Section break"
>
  <svg class="branches" viewBox="0 0 720 58" preserveAspectRatio="none" aria-hidden="true">
    <!-- The quiet long limbs establish the horizontal rhythm without becoming
         a conventional straight HR. The shorter forks make the seam feel grown. -->
    <path class="limb limb-accent" d="M8 30 C72 30 111 22 160 25 S253 39 329 29" />
    <path class="limb limb-green" d="M391 29 C462 20 504 35 558 31 S647 24 712 29" />
    <path class="twig twig-left" d="M92 28 C122 26 132 12 164 14 C183 15 188 22 207 25" />
    <path class="twig twig-left-low" d="M180 29 C211 33 219 46 249 43 C269 41 281 33 303 31" />
    <path class="twig twig-right" d="M418 28 C446 26 458 14 487 15 C505 16 516 24 535 27" />
    <path class="twig twig-right-low" d="M510 32 C536 36 548 46 576 43 C596 41 606 33 628 30" />
    <ellipse class="leaf leaf-green" cx="161" cy="13" rx="4.8" ry="2.7" transform="rotate(-16 161 13)" />
    <ellipse class="leaf leaf-accent" cx="249" cy="43" rx="4.5" ry="2.5" transform="rotate(14 249 43)" />
    <ellipse class="leaf leaf-accent" cx="488" cy="14" rx="4.8" ry="2.7" transform="rotate(16 488 14)" />
    <ellipse class="leaf leaf-green" cx="576" cy="43" rx="4.5" ry="2.5" transform="rotate(-14 576 43)" />
    <circle class="seed seed-left" cx="69" cy="30" r="2.2" />
    <circle class="seed seed-right" cx="652" cy="27" r="2.2" />
  </svg>

  <span class="ring-glow" aria-hidden="true"></span>
  <span class="rings" aria-hidden="true">
    <RingsMark
      size={compact ? 29 : 35}
      color="var(--arbol-color-accent)"
      strokeOpacities={[1, 0.72, 0.48, 0.32]}
    />
  </span>
</div>

<style>
  .arbol-separator {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 58px;
    margin: 1.05em 0 1.15em;
    overflow: hidden;
  }

  .arbol-separator.compact {
    height: 44px;
    margin: 0.55em 0 0.65em;
  }

  .branches {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .limb,
  .twig {
    fill: none;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .limb {
    stroke-width: 1.35;
  }

  .twig {
    stroke-width: 1.05;
  }

  .limb-accent,
  .twig-left,
  .twig-right-low {
    stroke: color-mix(in oklch, var(--arbol-color-accent) 68%, var(--arbol-color-border));
  }

  .limb-green,
  .twig-right,
  .twig-left-low {
    stroke: color-mix(in oklch, var(--arbol-color-ok) 58%, var(--arbol-color-border));
  }

  .twig {
    opacity: 0.72;
  }

  .leaf {
    opacity: 0.82;
    vector-effect: non-scaling-stroke;
  }

  .leaf-accent,
  .seed-left {
    fill: var(--arbol-color-accent);
  }

  .leaf-green,
  .seed-right {
    fill: var(--arbol-color-ok);
  }

  .seed {
    opacity: 0.68;
    vector-effect: non-scaling-stroke;
  }

  .ring-glow {
    position: absolute;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in oklch, var(--arbol-color-accent) 20%, transparent) 0%,
      color-mix(in oklch, var(--arbol-color-ok) 8%, transparent) 44%,
      transparent 72%
    );
  }

  .compact .ring-glow {
    width: 46px;
    height: 46px;
  }

  .rings {
    position: relative;
    display: grid;
    place-items: center;
    padding: 5px;
    border-radius: 50%;
    color: var(--arbol-color-accent);
    background: color-mix(in oklch, var(--arbol-color-bg) 84%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--arbol-color-accent) 15%, transparent),
      0 0 18px color-mix(in oklch, var(--arbol-color-accent) 12%, transparent);
  }

  @media (prefers-reduced-motion: no-preference) {
    .rings {
      transition: transform 180ms ease, box-shadow 180ms ease;
    }

    .arbol-separator:hover .rings {
      transform: rotate(3deg) scale(1.04);
      box-shadow:
        0 0 0 1px color-mix(in oklch, var(--arbol-color-accent) 26%, transparent),
        0 0 24px color-mix(in oklch, var(--arbol-color-ok) 16%, transparent);
    }
  }
</style>
