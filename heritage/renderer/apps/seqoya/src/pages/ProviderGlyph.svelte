<script lang="ts">
  // Provider glyph: Claude = RingsMark; z.ai = its own mark (NOT the Claude
  // rings — the vendor family must be distinguishable at a glance).
  import { RingsMark } from '@arbol/design-system'
  let { provider, loggedIn }: { provider: string; loggedIn: boolean } = $props()

  const isZai = $derived(['zai', 'z.ai', 'glm'].includes((provider || '').toLowerCase()))
</script>

<div style="width:38px;height:38px;border-radius:var(--arbol-radius-m);flex-shrink:0;display:grid;place-items:center;
            background:{loggedIn ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};
            border:1px solid var(--arbol-color-border);
            color:{loggedIn ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'}">
  {#if isZai}
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-label="z.ai">
      <!-- Rounded square + Z: distinct from the Claude rings. -->
      <rect x="1.5" y="1.5" width="17" height="17" rx="4.5" stroke="currentColor" stroke-width="1.6" />
      <path d="M6 6.6h8L6.6 13.4h7.6" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </svg>
  {:else}
    <RingsMark size={20} color="currentColor" />
  {/if}
</div>
