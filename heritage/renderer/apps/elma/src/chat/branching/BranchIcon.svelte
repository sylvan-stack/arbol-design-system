<script lang="ts">
  /* Branching iconography — simple SVG primitive, `currentColor`-tinted. */
  let { size = 16, strokeWidth = 1.7 }: { size?: number; strokeWidth?: number } = $props()
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
  <line x1="6" y1="4" x2="6" y2="14.5" />
  <circle cx="6" cy="18" r="2.6" />
  <circle cx="18" cy="6.5" r="2.6" />
  <path d="M18 9.1a8.4 8.4 0 0 1-8.4 8.4" />
</svg>
