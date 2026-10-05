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
  <circle cx="12" cy="12" r="8.5" />
  <path d="M8.5 12.2l2.4 2.4 4.6-5.2" />
</svg>
