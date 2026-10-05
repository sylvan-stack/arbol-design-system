<script lang="ts">
  /* Toast — a transient confirmation pill, bottom-center of the Viewport. The
   * caller owns auto-dismiss (clears the message after ~2.2s). */
  import CheckCircleIcon from './CheckCircleIcon.svelte'

  let { message }: { message: string | null } = $props()
</script>

{#if message}
  <div
    aria-live="polite"
    style="position:absolute;left:0;right:0;bottom:calc(var(--arbol-space-6) * 3);display:flex;justify-content:center;
           pointer-events:none;z-index:80"
  >
    <div
      style="display:inline-flex;align-items:center;gap:8px;padding:var(--arbol-space-2) var(--arbol-space-4);border-radius:99px;
             background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-border);box-shadow:var(--arbol-shadow-pop);
             animation:arbolpop .16s cubic-bezier(.2,.7,.2,1);font:500 var(--arbol-type-label)/1 var(--arbol-font-mono);
             color:var(--arbol-color-text)"
    >
      <CheckCircleIcon size={14} />
      {message}
    </div>
  </div>
{/if}
