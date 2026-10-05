<script lang="ts">
  /* The live agent-state cue shown above the composer: a compact mono label with
   * an animated trailing-dots ellipsis while active. Failed turns also expose
   * the technical root cause and recovery actions. */
  import type { AgentStatusKind, AgentStatusState } from './AgentStatusBar.types'
  import { formatFailureTime } from './responseView'

  let { status, running = false, align = 'left', onRetry, onContinue }:
    {
      status: AgentStatusState
      /** The authoritative folded lifecycle, supplied by the session projection. */
      running?: boolean
      align?: 'left' | 'center' | 'right'
      onRetry?: () => void
      onContinue?: () => void
    } = $props()

  const liveStatuses = new Set<AgentStatusKind>([
    'starting',
    'routing',
    'running',
    'thinking',
    'streaming',
    'tool_running',
    'waiting_for_approval',
  ])

  function color(kind: AgentStatusKind): string {
    if (kind === 'failed') return 'var(--arbol-color-warn)'
    if (kind === 'completed') return 'var(--arbol-color-ok)'
    if (kind === 'waiting_for_approval') return 'var(--arbol-color-warn)'
    return 'var(--arbol-color-text-muted)'
  }

  function compactLabel(label: string): string {
    return label.replace(/[.…]+$/u, '')
  }

  // A local status label can lag a durable terminal projection. Only the
  // projection's Running state may retain the active label or dot animation.
  const active = $derived(running && liveStatuses.has(status.kind))
  let dotCount = $state(0)

  // Animate the trailing dots while active; reset to 0 and stop otherwise. Svelte
  // re-runs this effect when `active`/`status.kind` change (matching the React deps).
  $effect(() => {
    status.kind // track so a kind change restarts the cadence
    if (!active) {
      dotCount = 0
      return
    }
    const timer = window.setInterval(() => (dotCount = dotCount >= 3 ? 0 : dotCount + 1), 420)
    return () => window.clearInterval(timer)
  })

  // Never leave a stale live label visible after Core has folded terminal.
  // Terminal labels (Completed/Failed/Canceled/Ready) remain visible.
  const showLabel = $derived(!liveStatuses.has(status.kind) || running)
  const label = $derived(active ? compactLabel(status.label) : status.label)
  const title = $derived(status.detail ? `${label} · ${status.detail}` : label)
  const failed = $derived(status.kind === 'failed')
  const failedAt = $derived(failed && status.failedAt ? formatFailureTime(status.failedAt) : '')
  const justify = $derived(align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start')
  const alignItems = $derived(align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start')
  const actionStyle =
    'all:unset;box-sizing:border-box;padding:4px 9px;border-radius:var(--arbol-radius-s);' +
    'border:1px solid color-mix(in srgb, var(--arbol-color-warn) 52%, var(--arbol-color-border));' +
    'background:color-mix(in srgb, var(--arbol-color-warn) 10%, var(--arbol-color-surface));' +
    'color:var(--arbol-color-warn);cursor:pointer;font:700 10px/1 var(--arbol-font-mono);letter-spacing:0.01em'
</script>

<div
  aria-live="polite"
  style="background:transparent;display:flex;flex-direction:column;align-items:{alignItems};max-width:100%"
>
  {#if showLabel}
  <span
    {title}
    style="display:inline-flex;align-items:baseline;max-width:min(180px, 100%);overflow:hidden;color:{color(status.kind)};font:600 10px/1.1 var(--arbol-font-mono);letter-spacing:0.01em;white-space:nowrap;opacity:{active ? 0.82 : 0.68}"
  >
    <span style="overflow:hidden;text-overflow:ellipsis">{label}</span>
    {#if active}
      <span aria-hidden="true" style="display:inline-block;width:1.35em;margin-left:1px;text-align:left">{'.'.repeat(dotCount)}</span>
    {/if}
  </span>
  {/if}

  {#if failed && (failedAt || status.detail)}
    <div
      data-agent-failure-detail
      style="width:min(720px, 100%);box-sizing:border-box;margin-top:7px;padding:8px 10px;border-left:2px solid color-mix(in srgb, var(--arbol-color-warn) 62%, transparent);border-radius:0 var(--arbol-radius-s) var(--arbol-radius-s) 0;background:color-mix(in srgb, var(--arbol-color-warn) 7%, var(--arbol-color-surface));color:var(--arbol-color-text-muted);font:500 11px/1.45 var(--arbol-font-mono);white-space:pre-wrap;overflow-wrap:anywhere"
    >
      {#if failedAt}<div><strong style="color:var(--arbol-color-warn)">Failed at:</strong> {failedAt}</div>{/if}
      {#if status.detail}<div style:margin-top={failedAt ? '4px' : undefined}><strong style="color:var(--arbol-color-warn)">Error:</strong> {status.detail}</div>{/if}
    </div>
  {/if}

  {#if failed && (onRetry || onContinue)}
    <div style="display:flex;justify-content:{justify};flex-wrap:wrap;gap:7px;margin-top:8px">
      {#if onRetry}
        <button type="button" onclick={onRetry} style={actionStyle}>Retry</button>
      {/if}
      {#if onContinue}
        <button type="button" onclick={onContinue} style={actionStyle}>Continue from failure point</button>
      {/if}
    </div>
  {/if}
</div>
