<script lang="ts">
  /* Branching iconography — simple SVG primitive, `currentColor`-tinted. */
  let { size = 14, strokeWidth = 1.7 }: { size?: number; strokeWidth?: number } = $props()
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
  <path d="M14.5 5.5l4 4" />
  <path d="M4.5 19.5l3.2-.6L18 8.6a1.6 1.6 0 0 0 0-2.2l-1.4-1.4a1.6 1.6 0 0 0-2.2 0L4.1 15.3l-.6 3.2z" />
</svg>
