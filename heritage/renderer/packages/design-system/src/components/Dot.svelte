<script lang="ts">
  // Status dot — optional pulse. (Ported from React.)
  let { color = 'var(--arbol-color-ok)', pulse = false }:
    { color?: string; pulse?: boolean } = $props()
</script>

<span
  style="width:7px;height:7px;border-radius:99px;background:{color};flex-shrink:0;
         box-shadow:{pulse ? `0 0 0 0 ${color}` : 'none'};
         animation:{pulse ? 'arbolpulse 2s infinite' : 'none'}"
></span>
