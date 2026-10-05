<script lang="ts">
  /* The stack of approval cards Elma docks above the composer. Renders nothing
   * when the queue is empty so it costs no layout. `busyIds` greys a card whose
   * decision RPC is in flight (prevents a double-click racing the effector). */
  import type { PendingApproval } from './usePendingApprovals'
  import ToolApprovalCard from './ToolApprovalCard.svelte'

  let {
    approvals,
    busyIds,
    onRun,
    onRunAlways,
    onReject,
    onSubmitAnswers,
    onCancel,
  }: {
    approvals: PendingApproval[]
    busyIds?: Set<string>
    onRun: (requestId: string, details?: string) => void
    onRunAlways: (requestId: string, details?: string) => void
    onReject: (requestId: string, details?: string) => void
    onSubmitAnswers?: (requestId: string, answers: Record<string, string>) => void
    onCancel?: (requestId: string) => void
  } = $props()
</script>

{#if approvals.length}
  <!-- max-height + scroll: several stacked cards must never push the dock (and
       the cards' own action buttons) past the viewport. -->
  <div
    style="border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-bg);padding:var(--arbol-space-4) var(--arbol-space-6);max-height:80vh;overflow-y:auto;overscroll-behavior:contain"
  >
    <div style="max-width:var(--arbol-text-area-max-width);margin:0 auto;display:flex;flex-direction:column;gap:var(--arbol-space-3)">
      {#each approvals as a (a.request_id)}
        <ToolApprovalCard
          approval={a}
          busy={busyIds?.has(a.request_id)}
          onRun={(details) => onRun(a.request_id, details)}
          onRunAlways={(details) => onRunAlways(a.request_id, details)}
          onReject={(details) => onReject(a.request_id, details)}
          onSubmitAnswers={onSubmitAnswers ? (answers) => onSubmitAnswers(a.request_id, answers) : undefined}
          onCancel={onCancel ? () => onCancel(a.request_id) : undefined}
        />
      {/each}
    </div>
  </div>
{/if}
