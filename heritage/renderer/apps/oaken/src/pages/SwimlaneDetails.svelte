<script lang="ts">
  /* Oaken[Swimlane Details] — the drill-down (Svelte first-cut). Lists the
   * swimlane's swimmers (tasks) with their child entities as EntityChips. The
   * Feed/Split timeline layouts + the swimmer-header context menu are the next
   * increment; this renders the data faithfully as a feed. */
  import { EntityChip, formatEntityUri } from '@arbol/design-system'
  import type { Swimlane } from '../data'

  let { swimlane, layout, onToast }:
    { swimlane: Swimlane; layout: 'feed' | 'split'; onToast: (msg: string) => void } = $props()

</script>

<div style="height:100%;overflow:auto;padding:var(--arbol-space-4);display:flex;flex-direction:column;gap:var(--arbol-space-3)">
  {#if !swimlane.swimmers || swimlane.swimmers.length === 0}
    <div style="color:var(--arbol-color-text-muted);padding:var(--arbol-space-5);text-align:center">
      No swimmers in this swimlane yet.
    </div>
  {/if}
  {#each swimlane.swimmers ?? [] as sw (sw.id)}
    <div style="background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
                border-left:3px solid {sw.blocked ? 'var(--arbol-color-err)' : 'var(--arbol-color-accent)'};
                border-radius:var(--arbol-radius-m);padding:var(--arbol-space-3) var(--arbol-space-4)">
      <div style="display:flex;align-items:center;gap:var(--arbol-space-2)">
        <span style="font:600 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono);letter-spacing:0.5px;
                     padding:2px 6px;border-radius:5px;color:var(--arbol-color-text-muted);
                     background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-hairline)">{sw.src}</span>
        <span style="font-weight:600;color:var(--arbol-color-text)">{sw.nm}</span>
        {#if sw.blocked}<span style="color:var(--arbol-color-err);font-size:var(--arbol-type-label)">blocked</span>{/if}
      </div>
      {#if sw.items && sw.items.length}
        <div style="margin-top:var(--arbol-space-3);display:flex;flex-direction:column;gap:6px">
          {#each sw.items as it, i (i)}
            <EntityChip
              uri={it.uri ?? formatEntityUri({ repo: 'Arbol', kind: it.kind, entityId: `preview-${i}`, title: it.title })}
              onNavigationError={(error) => onToast(error.message)}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
