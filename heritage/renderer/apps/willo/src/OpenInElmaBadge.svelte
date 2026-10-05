<script lang="ts">
  let { active = false }: { active?: boolean } = $props()
</script>

<!-- Reserve space so changing the open chat never moves the list. -->
<div class="marker" class:active aria-hidden="true">
        <span class="open-label">
          <svg class="window-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="2" y="2.5" width="12" height="11" rx="2" />
            <path d="M2 6h12M6 6v7.5" />
          </svg>
          Open in Elma
        </span>
</div>

<style>
  .marker { height:26px; display:flex; align-items:flex-start; visibility:hidden; pointer-events:none; }
  .marker.active { visibility:visible; }
  .open-label { display:inline-flex; gap:6px; align-items:center; white-space:nowrap; }
  .window-icon { flex-shrink:0; }
  .open-label {
    padding:4px 9px;
    border:1px solid color-mix(in oklch, var(--arbol-color-accent) 68%, var(--arbol-color-border));
    border-radius:var(--arbol-radius-s);
    background:linear-gradient(var(--arbol-color-accent-soft), var(--arbol-color-accent-soft)), var(--arbol-color-surface);
    color:color-mix(in oklch, var(--arbol-color-accent) 65%, var(--arbol-color-text));
    font:650 10px/1.2 var(--arbol-font-mono);
    letter-spacing:.45px;
    text-transform:uppercase;
  }
</style>
