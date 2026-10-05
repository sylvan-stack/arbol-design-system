<script lang="ts">
  /* ToolApprovalCard — surfaces ONE click_required tool request and the three
   * decisions Core exposes for it (session.click_run / _run_always / _reject).
   * The effector is blocked awaiting this decision; without the card the request
   * sits until its 10-minute timeout, which is the silent-stall bug this closes.
   *
   * The card shows exactly what would run (the command / path / url) and WHY a
   * decision is needed (the classifier reason), so the choice is informed. */
  import type { PendingApproval } from './usePendingApprovals'
  import { approvalIncidentReport, kindGlyph, paramsSummary, isNativeApproval, isProtectedLifecycleApproval, NATIVE_ACCENT, NATIVE_ACCENT_SOFT } from './ToolApprovalCard.helpers'
  import { PermissionDecisionActions } from '@arbol/design-system'
  import AskUserQuestionCard from './AskUserQuestionCard.svelte'
  import CopyButton from './CopyButton.svelte'

  let {
    approval,
    busy = false,
    onRun,
    onRunAlways,
    onReject,
    onSubmitAnswers,
    onCancel,
  }: {
    approval: PendingApproval
    busy?: boolean
    onRun: (details?: string) => void
    onRunAlways: (details?: string) => void
    onReject: (details?: string) => void
    // AskUserQuestion only: submit the chosen answers / cancel (stop) the turn.
    // Default to the run/reject paths so other cards and stories keep working.
    onSubmitAnswers?: (answers: Record<string, string>) => void
    onCancel?: () => void
  } = $props()

  const detail = $derived(paramsSummary(approval.kind, approval.params))
  const native = $derived(isNativeApproval(approval))
  const incidentReport = $derived(approvalIncidentReport(approval))
  // For an unrecognized native tool the kind is the opaque `native_confirm` —
  // surface the CLI's own tool name in the header instead.
  const unknownNativeTool = $derived(approval.kind === 'native_confirm')
  const nativeToolName = $derived(typeof approval.params.tool_name === 'string' ? approval.params.tool_name : '')
  // A Worktree switch changes durable Chat Session context and must be approved
  // for each occurrence; offering “Always allow” would promise a policy the
  // classifier intentionally never applies.
  const protectedLifecycle = $derived(isProtectedLifecycleApproval(approval))
  const oneOffOnly = $derived(
    protectedLifecycle || (approval.reason?.startsWith('Changing the Working Directory to another Worktree') ?? false),
  )
</script>

{#if approval.kind === 'native_ask_user_question'}
  <AskUserQuestionCard
    {approval}
    {busy}
    onSubmit={onSubmitAnswers ?? (() => onRun())}
    onCancel={onCancel ?? onReject}
  />
{:else}
  <div
    style="border:{native
      ? `1px solid color-mix(in srgb, ${NATIVE_ACCENT} 52%, var(--arbol-color-border))`
      : '1px solid var(--arbol-color-accent)'};{native
      ? `border-left:3px solid ${NATIVE_ACCENT};`
      : ''}border-radius:var(--arbol-radius-m);background:{native
      ? NATIVE_ACCENT_SOFT
      : 'var(--arbol-color-accent-soft)'};overflow:hidden"
  >
    <div
      style="display:flex;align-items:center;gap:var(--arbol-space-2);padding:var(--arbol-space-2) var(--arbol-space-3);font:600 0.84em/1.5 var(--arbol-font-mono);color:var(--arbol-color-text)"
    >
      <span aria-hidden="true" style="opacity:0.8;flex-shrink:0">
        {kindGlyph(approval.kind)}
      </span>
      <span style="color:{native ? NATIVE_ACCENT : 'var(--arbol-color-accent)'};flex-shrink:0">
        {unknownNativeTool ? nativeToolName || 'native tool' : approval.kind || 'tool'}
      </span>
      <span style="color:var(--arbol-color-text-muted);font-weight:500;flex-shrink:0">needs your approval</span>
      <span style="flex:1"></span>
      <span title={`Copy permission incident ${approval.request_id}`} style="flex-shrink:0">
        <CopyButton text={incidentReport} label="Copy incident" />
      </span>
      {#if native}
        <span
          title="Asked by the CLI's native permission bridge"
          style="color:{NATIVE_ACCENT};font-weight:600;flex-shrink:0;font-size:0.82em;letter-spacing:0.02em;border:1px solid color-mix(in srgb, {NATIVE_ACCENT} 45%, var(--arbol-color-border));background:{NATIVE_ACCENT_SOFT};border-radius:999px;padding:1px 7px"
        >
          native
        </span>
      {/if}
    </div>

    {#if approval.reason}
      <div
        style="padding:0 var(--arbol-space-3) var(--arbol-space-2);font:500 calc(var(--arbol-type-label) * 0.92)/1.45 var(--arbol-font-ui);color:var(--arbol-color-text-muted)"
      >
        ⚠ {approval.reason}
      </div>
    {/if}

    {#if detail}
      <pre
        style="margin:0;max-height:160px;padding:var(--arbol-space-3);overflow:auto;border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);font:400 0.82em/1.55 var(--arbol-font-mono);color:var(--arbol-color-text);white-space:pre-wrap;word-break:break-word">{detail}</pre>
    {/if}

    <div style="padding:var(--arbol-space-3);border-top:1px solid var(--arbol-color-border)">
      <PermissionDecisionActions
        {busy}
        primaryLabel={protectedLifecycle ? 'Approve' : 'Run'}
        allowAlways={!oneOffOnly}
        allowStop={protectedLifecycle}
        onApprove={onRun}
        onApproveAlways={onRunAlways}
        onReject={onReject}
        onStop={onCancel}
      />
    </div>
  </div>
{/if}
