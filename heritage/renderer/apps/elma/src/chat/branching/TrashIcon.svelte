<script lang="ts">
  /* Branching iconography — simple SVG primitive, `currentColor`-tinted. */
  let { size = 15, strokeWidth = 1.7 }: { size?: number; strokeWidth?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  style="display:block"
  aria-hidden="true"
>
  <path d="M4 7h16" />
  <path d="M9 7V4.5h6V7" />
  <path d="M6.5 7l.8 12.2a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95L17.5 7" />
  <path d="M10 11v5M14 11v5" />
</svg>
