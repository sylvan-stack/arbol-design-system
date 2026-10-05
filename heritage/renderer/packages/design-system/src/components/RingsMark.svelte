<script lang="ts">
  // The Arbol identity mark: nested offset rings + a dot. (Ported from React.)
  let { size = 26, color = 'currentColor', strokeOpacities = undefined }:
    { size?: number; color?: string; strokeOpacities?: number[] } = $props()

  const ops = $derived(strokeOpacities || [1, 0.62, 0.4, 0.26])
  const cx = $derived(size / 2)
  const cy = $derived(size / 2)
  const radii = $derived([0.46, 0.345, 0.235, 0.12].map((r) => r * size))
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  aria-hidden="true"
  style="display:block;overflow:visible"
>
  {#each radii as r, i}
    <circle
      cx={cx + (i === 0 ? 0 : i * 0.45)}
      cy={cy - (i === 0 ? 0 : i * 0.35)}
      {r}
      fill="none"
      stroke={color}
      stroke-opacity={ops[i]}
      stroke-width={i === radii.length - 1 ? 1.4 : 1.2}
    />
  {/each}
  <circle cx={cx + 1.5} cy={cy - 1.2} r={1.1} fill={color} />
</svg>
