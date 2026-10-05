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
  <path d="M9.7 9.4a2.45 2.45 0 0 1 4.65 1.1c0 1.75-2.35 2.05-2.35 3.65" />
  <path d="M12 17.2h.01" />
</svg>
