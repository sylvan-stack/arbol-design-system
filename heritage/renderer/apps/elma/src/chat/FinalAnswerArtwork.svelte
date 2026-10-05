<script lang="ts">
  export type FinalAnswerArtwork =
    | 'first-light'
    | 'clearing'
    | 'confluence'
    | 'aperture'
    | 'constellation'
    | 'ribbon'
    | 'prism'
    | 'landfall'

  let { variant }: { variant: FinalAnswerArtwork } = $props()
</script>

<svg class="artwork" viewBox="0 0 720 180" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id={`fade-${variant}`} x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="currentColor" stop-opacity="0" />
      <stop offset=".5" stop-color="currentColor" stop-opacity=".9" />
      <stop offset="1" stop-color="currentColor" stop-opacity="0" />
    </linearGradient>
    <radialGradient id={`glow-${variant}`}>
      <stop stop-color="currentColor" stop-opacity=".32" />
      <stop offset="1" stop-color="currentColor" stop-opacity="0" />
    </radialGradient>
    <filter id={`blur-${variant}`}><feGaussianBlur stdDeviation="13" /></filter>
  </defs>

  {#if variant === 'first-light'}
    <path class="mist" d="M0 124C112 101 185 130 278 111c81-17 142-12 207 1 94 20 148-15 235-2v70H0Z" />
    <circle class="glow" cx="360" cy="112" r="72" />
    <path class="hair" d="M0 128c97-4 173 1 260-5 44-3 70-22 100-22s55 19 100 22c87 6 163 1 260 5" />
    <path class="strong" d="M309 122a51 51 0 0 1 102 0" />
    <path class="ray" d="M360 51V18M316 64l-21-29M404 64l21-29M282 92l-36-15M438 92l36-15" />
  {:else if variant === 'clearing'}
    <path class="wash" d="M0 0h720v180H0z" />
    <path class="surface" d="M0 0h301c-19 19-33 37-38 56-9 35 14 50 3 78-8 21-26 35-42 46H0Zm720 0H419c19 19 33 37 38 56 9 35-14 50-3 78 8 21 26 35 42 46h224Z" />
    <path class="strong" d="M301 0c-19 19-33 37-38 56-9 35 14 50 3 78-8 21-26 35-42 46M419 0c19 19 33 37 38 56 9 35-14 50-3 78 8 21 26 35 42 46" />
    <path class="ray" d="M360 21v138M325 39l16 121M395 39l-16 121" />
  {:else if variant === 'confluence'}
    <path class="hair" d="M0 25c132 0 126 48 244 48 57 0 72 17 116 17M0 90h360M0 155c132 0 126-48 244-48 57 0 72-17 116-17" />
    <path class="strong" d="M360 90h360" />
    <path class="river" d="M0 25c132 0 126 48 244 48 57 0 72 17 116 17-44 0-59 17-116 17-118 0-112 48-244 48Z" />
    <circle class="solid" cx="360" cy="90" r="6" />
    <circle class="node" cx="96" cy="43" r="3" /><circle class="node" cx="166" cy="132" r="3" /><circle class="node" cx="245" cy="73" r="3" />
  {:else if variant === 'aperture'}
    <ellipse class="glow" cx="360" cy="90" rx="132" ry="88" />
    <path class="hair" d="M0 90h246M474 90h246" />
    <path class="surface" d="m270 0 90 90L450 0Zm0 180 90-90 90 90ZM180 0l180 90L540 0ZM180 180l180-90 180 90Z" />
    <ellipse class="strong" cx="360" cy="90" rx="62" ry="45" />
    <ellipse class="hair" cx="360" cy="90" rx="92" ry="68" />
    <circle class="solid" cx="360" cy="90" r="7" />
  {:else if variant === 'constellation'}
    <path class="hair" d="m68 129 91-77 72 38 71-52 58 52 70-35 82 74 87-62" />
    <path class="hair faint" d="m68 129 163-39 129 0 152 39M159 52l143-14 128 17 169 12" />
    <circle class="node" cx="68" cy="129" r="3"/><circle class="node" cx="159" cy="52" r="4"/><circle class="node" cx="231" cy="90" r="3"/><circle class="node" cx="302" cy="38" r="4"/><circle class="solid" cx="360" cy="90" r="8"/><circle class="node" cx="430" cy="55" r="3"/><circle class="node" cx="512" cy="129" r="4"/><circle class="node" cx="599" cy="67" r="3"/>
    <circle class="pulse" cx="360" cy="90" r="28" />
  {:else if variant === 'ribbon'}
    <path class="ribbon-back" d="M0 61c102-55 176 89 282 42 39-18 52-45 78-45 27 0 40 27 79 45 105 47 179-97 281-42" />
    <path class="ribbon" d="M0 119c102 55 176-89 282-42 39 18 52 45 78 45 27 0 40-27 79-45 105-47 179 97 281 42" />
    <circle class="solid" cx="360" cy="90" r="6" />
  {:else if variant === 'prism'}
    <path class="hair" d="M0 90h285" />
    <path class="surface strong" d="m285 90 75-68 75 136Z" />
    <path class="spectrum s1" d="m375 90 345-62"/><path class="spectrum s2" d="m375 90 345-21"/><path class="spectrum s3" d="m375 90 345 22"/><path class="spectrum s4" d="m375 90 345 62"/>
    <circle class="solid" cx="285" cy="90" r="4" />
  {:else}
    <path class="contour" d="M0 21c128 55 181-32 293 20s196-19 427 3M0 57c122 48 192-18 292 16s224-11 428 5M0 94c135 31 200-5 306 11 126 19 210-5 414 6M0 132c120 17 216 5 315 4 131-2 219 12 405 7M0 164c124 3 213 0 327 0h393" />
    <path class="route" d="M42 32c94 23 100 80 202 65 69-10 62 57 163 34 79-18 105 28 175 3 45-16 64-9 96-2" />
    <circle class="node" cx="42" cy="32" r="4"/><circle class="solid" cx="678" cy="132" r="7" />
  {/if}
</svg>

<style>
  .artwork { display: block; width: 100%; height: 100%; color: var(--arbol-color-accent); overflow: hidden; }
  .hair,.strong,.ray,.route,.contour,.spectrum,.node,.pulse { fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; }
  .hair { stroke-width:1.3; opacity:.42; }.strong { stroke-width:2; }.ray { stroke-width:1.2; opacity:.58; }.faint { opacity:.18; }
  .wash { fill:color-mix(in srgb,var(--arbol-color-accent) 5%,transparent); }.surface { fill:color-mix(in srgb,var(--arbol-color-accent) 9%,transparent); }
  .mist { fill:color-mix(in srgb,var(--arbol-color-accent) 8%,transparent); }.glow { fill:url(#glow-first-light); }
  .river { fill:color-mix(in srgb,var(--arbol-color-accent) 12%,transparent); }.solid { fill:currentColor; }.node { fill:var(--arbol-color-surface);stroke-width:1.5; }
  .pulse { stroke-width:1; opacity:.25; }.ribbon,.ribbon-back { fill:none;stroke:currentColor;stroke-width:18;stroke-linecap:round;opacity:.18; }.ribbon { stroke-width:7;opacity:.72; }
  .spectrum { stroke-width:3;opacity:.62; }.s1{opacity:.2}.s2{opacity:.38}.s3{opacity:.56}.s4{opacity:.76}
  .contour { stroke-width:1;opacity:.2; }.route { stroke-width:2;stroke-dasharray:3 7; }
</style>
