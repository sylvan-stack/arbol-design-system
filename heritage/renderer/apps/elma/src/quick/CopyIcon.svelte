<script lang="ts">
  /* Quick Actions iconography — simple SVG primitive, `currentColor`-tinted. */
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
  <rect x="9" y="9" width="11" height="11" rx="2.2" />
  <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
</svg>
