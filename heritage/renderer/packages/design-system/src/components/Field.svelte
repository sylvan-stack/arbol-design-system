<script lang="ts">
  import type { Snippet } from 'svelte'
  let { label, hint, children }: { label: string; hint?: string; children: Snippet } = $props()
</script>

<label style="display:block;margin-bottom:var(--arbol-space-4)">
  <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);
              margin-bottom:var(--arbol-space-2);text-transform:uppercase;letter-spacing:0.7px;font-weight:600">
    {label}
  </div>
  {@render children()}
  {#if hint}
    <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);
                margin-top:6px;text-transform:none;letter-spacing:0;font-weight:400">
      {hint}
    </div>
  {/if}
</label>
