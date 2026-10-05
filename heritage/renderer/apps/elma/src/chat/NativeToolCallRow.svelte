<script lang="ts">
  /* One native CLI tool execution (IP_INVOKED/IP_SETTLED_NATIVE_TOOL). Native
   * calls are intentionally deemphasized vs other tool rows: collapsed they
   * are a compact muted link; clicking expands inline input/output. (Ported from
   * ResponseView's NativeToolCallRow.) */
  import type { NativeToolCallView } from '@arbol/events'
  import type { ToolOutputPreview } from './ResponseView.types'
  import NativeToolRuntimeTimer from './NativeToolRuntimeTimer.svelte'
  import { elmaBridge } from '../api'
  import { bridgeDiagnostic } from '@arbol/design-system'
  import {
    formatToolCallDuration,
    nativeCallElapsedMs,
    nativeToolSummary,
    nativeResultText,
    nativeResultTruncated,
    nativeCallState,
    prettyJsonText,
    deferredRenderEvidence,
    verifyDeferredToolContent,
  } from './responseView'

  let { call, chatSessionId, outputPreview, batchSize = 1, batchPosition = 1 }: {
    call: NativeToolCallView
    chatSessionId?: string | null
    outputPreview?: ToolOutputPreview
    batchSize?: number
    batchPosition?: number
  } = $props()

  let open = $state(false)
  let timelineNow = $state(Date.now())
  let deferredResult = $state<Record<string, unknown> | undefined>(undefined)
  let deferredError = $state('')
  let loadingDeferred = $state(false)

  async function toggleOpen() {
    open = !open
    if (!open || !call.result_deferred || deferredResult || loadingDeferred) return
    loadingDeferred = true
    deferredError = ''
    try {
      if (!chatSessionId || !call.result_sha256 || !call.result_byte_len) throw new Error('Output identity is unavailable')
      const pages = []
      let continuation: string | null | undefined = undefined
      do {
        const reply = await elmaBridge.call('chat_session.native_tool_result', {
          chat_session_id: chatSessionId,
          tool_use_id: call.tool_use_id,
          turn_id: call.turn_id,
          ...(continuation ? { continuation } : {}),
        })
        pages.push(reply)
        continuation = reply?.continuation
      } while (continuation)
      let allValidated = false
      const verified = await verifyDeferredToolContent(
        pages, call.result_sha256, call.result_byte_len, (evidence) => {
          if (evidence.stage === 'all_validations_completed') allValidated = true
          bridgeDiagnostic({
            ...evidence, stage: `native_tool_result_${evidence.stage}`,
            session_id: chatSessionId, tool_use_id: call.tool_use_id,
          })
        },
      )
      deferredRenderEvidence(allValidated, call.result_sha256, call.result_byte_len)
      deferredResult = verified.result as Record<string, unknown> | undefined
      if (!deferredResult && typeof verified.error === 'string') deferredError = verified.error
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      bridgeDiagnostic({
        stage: 'native_tool_result_rendered', session_id: chatSessionId,
        tool_use_id: call.tool_use_id, reference_sha256: call.result_sha256,
        reference_encoded_bytes: call.result_byte_len,
      })
    } catch (error) {
      deferredError = error instanceof Error ? error.message : String(error)
    } finally { loadingDeferred = false }
  }

  const state = $derived(nativeCallState(call))
  const summary = $derived(nativeToolSummary(call) || call.tool_name)
  const resultText = $derived(nativeResultText(deferredResult || call.result))
  const truncated = $derived(nativeResultTruncated(call))
  const inputJson = $derived(prettyJsonText(call.input || {}))
  const statusGlyph = $derived(state === 'running' ? '…' : state === 'checkpoint' ? 'i' : state === 'failed' ? '!' : '✓')
  const statusLabel = $derived(state === 'running' ? 'running' : state === 'checkpoint' ? 'feedback checkpoint' : state === 'failed' ? 'failed' : 'done')
  const validInvokedAt = $derived(Number.isFinite(call.invoked_ts) && call.invoked_ts > 0 ? call.invoked_ts : null)
  const validSettledAt = $derived(Number.isFinite(call.settled_ts) && (call.settled_ts as number) >= (validInvokedAt || 0) ? (call.settled_ts as number) : null)
  const startedTime = $derived(validInvokedAt ? formatToolCallTime(validInvokedAt) : 'Unknown')
  const completedTime = $derived(validSettledAt ? formatToolCallTime(validSettledAt) : '—')
  const durationLabel = $derived(validInvokedAt ? formatToolCallDuration(nativeCallElapsedMs(call, timelineNow)) : 'Unknown')
  const completionLabel = $derived(state === 'checkpoint' ? 'Checkpoint' : state === 'running' ? 'In progress' : 'Ended')
  const blockerLabel = $derived(
    state === 'running' && batchSize > 1
      ? `waiting on this call · ${batchPosition} of ${batchSize} running`
      : '',
  )

  const checkpointColor = 'var(--arbol-color-accent, #4f8fcf)'
  const statusColor = $derived(
    state === 'failed'
      ? 'var(--arbol-color-danger, #d05c5c)'
      : state === 'checkpoint' ? checkpointColor : 'var(--arbol-color-text-muted)',
  )
  const outColor = $derived(
    state === 'failed'
      ? 'color-mix(in srgb, var(--arbol-color-danger, #d05c5c) 78%, var(--arbol-color-text-muted))'
      : state === 'checkpoint'
        ? 'color-mix(in srgb, var(--arbol-color-accent, #4f8fcf) 76%, var(--arbol-color-text))'
        : 'var(--arbol-color-text-muted)',
  )
  const outBorder = $derived(
    state === 'failed'
      ? '1px solid color-mix(in srgb, var(--arbol-color-danger, #d05c5c) 42%, var(--arbol-color-border))'
      : state === 'checkpoint'
        ? '1px solid color-mix(in srgb, var(--arbol-color-accent, #4f8fcf) 44%, var(--arbol-color-border))'
        : '1px solid var(--arbol-color-border)',
  )
  const outBackground = $derived(
    state === 'checkpoint'
      ? 'color-mix(in srgb, var(--arbol-color-accent, #4f8fcf) 7%, transparent)'
      : 'transparent',
  )
  const outputLabel = $derived(state === 'failed' ? 'error' : state === 'checkpoint' ? 'feedback checkpoint' : 'output')
  const progressStdout = $derived(outputPreview?.stdout || '')
  const progressStderr = $derived(outputPreview?.stderr || '')
  const progressText = $derived.by(() => {
    if (progressStdout && progressStderr) {
      const separator = progressStdout.endsWith('\n') ? '' : '\n'
      return `${progressStdout}${separator}— stderr —\n${progressStderr}`
    }
    return progressStdout || progressStderr
  })
  const showProgressOutput = $derived(
    call.tool_name === 'Bash'
      && (state === 'running' || state === 'checkpoint')
      && progressText.length > 0,
  )
  const progressLabel = $derived(
    state === 'checkpoint' ? 'output before feedback checkpoint' : 'live output',
  )
  let progressOutputEl = $state<HTMLPreElement | null>(null)

  function formatToolCallTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  // Expanded running calls show a live duration. Avoid a permanent timer for
  // collapsed rows; NativeToolRuntimeTimer already owns their >1 minute cue.
  $effect(() => {
    if (!open || state !== 'running') return
    timelineNow = Date.now()
    const id = window.setInterval(() => (timelineNow = Date.now()), 100)
    return () => window.clearInterval(id)
  })

  // Follow newly appended output like a terminal. Without this, a long-running
  // command keeps updating but the user remains stuck at the oldest lines.
  $effect(() => {
    void progressText
    const el = progressOutputEl
    if (!el || !showProgressOutput) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  })
</script>

<div style="margin:0.15em 0;font:400 0.78em/1.45 var(--arbol-font-mono);color:var(--arbol-color-text-muted);opacity:{open ? 0.9 : 0.66}">
  <button
    type="button"
    onclick={toggleOpen}
    aria-expanded={open}
    title={open ? 'Hide native tool details' : 'Show native tool details'}
    style="all:unset;box-sizing:border-box;display:inline-flex;align-items:baseline;gap:0.45em;max-width:100%;cursor:pointer;color:inherit"
  >
    <span aria-hidden="true" style="display:inline-block;width:0.8em;transform:{open ? 'rotate(90deg)' : 'none'};transition:transform 120ms ease;opacity:0.55;flex-shrink:0">▸</span>
    <span style="text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;color:var(--arbol-color-text-muted);font-weight:500;flex-shrink:0">{call.tool_name}</span>
    <span title={statusLabel} style="color:{statusColor};opacity:{state === 'running' ? 0.75 : state === 'checkpoint' ? 0.9 : 0.6};flex-shrink:0">{statusGlyph}</span>
    <NativeToolRuntimeTimer {call} />
    {#if blockerLabel}
      <span data-native-tool-blocker title="This call is keeping its parallel batch open" style="color:var(--arbol-color-accent);flex-shrink:0;font-weight:600;opacity:0.9">{blockerLabel}</span>
    {/if}
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;opacity:0.78">{summary}</span>
  </button>
  {#if showProgressOutput}
    <div data-native-tool-live-output style="margin:0.35em 0 0.6em 1.25em;padding-left:var(--arbol-space-3);border-left:2px solid color-mix(in srgb, var(--arbol-color-accent) 55%, var(--arbol-color-border));opacity:0.96">
      <div style="display:flex;align-items:center;gap:0.5em;margin-bottom:var(--arbol-space-1);font:600 0.70em/1.2 var(--arbol-font-mono);letter-spacing:0.02em;text-transform:uppercase;color:var(--arbol-color-accent)">
        {#if state === 'running'}<span aria-hidden="true" style="display:inline-block;width:0.5em;height:0.5em;border-radius:50%;background:currentColor;box-shadow:0 0 0 0 color-mix(in srgb, currentColor 45%, transparent);animation:native-output-pulse 1.8s ease-out infinite"></span>{/if}
        <span>{progressLabel}</span>
      </div>
      <pre bind:this={progressOutputEl} aria-live="polite" style="margin:0;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--arbol-color-text);background:color-mix(in srgb, var(--arbol-color-bg) 88%, var(--arbol-color-accent));border:1px solid color-mix(in srgb, var(--arbol-color-accent) 28%, var(--arbol-color-border));border-radius:var(--arbol-radius-s);padding:var(--arbol-space-2);font:400 0.76em/1.4 var(--arbol-font-mono)">{progressText}</pre>
    </div>
  {/if}
  {#if open}
    <div data-native-tool-details style="margin:0.45em 0 0.7em 1.25em;padding:var(--arbol-space-3);border:1px solid var(--arbol-color-border);border-left:2px solid color-mix(in srgb, {statusColor} 62%, var(--arbol-color-border));border-radius:0 var(--arbol-radius-s) var(--arbol-radius-s) 0;display:flex;flex-direction:column;gap:var(--arbol-space-3);background:color-mix(in srgb, var(--arbol-color-bg) 94%, var(--arbol-color-text));opacity:0.98">
      <div data-native-tool-timeline style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--arbol-space-2);padding-bottom:var(--arbol-space-2);border-bottom:1px solid var(--arbol-color-border)">
        <div>
          <div class="detail-label">Started</div>
          <time data-native-tool-start datetime={validInvokedAt ? new Date(validInvokedAt).toISOString() : undefined} title={validInvokedAt ? new Date(validInvokedAt).toLocaleString() : 'Start time unavailable'}>{startedTime}</time>
        </div>
        <div>
          <div class="detail-label">{completionLabel}</div>
          {#if validSettledAt}
            <time data-native-tool-end datetime={new Date(validSettledAt).toISOString()} title={new Date(validSettledAt).toLocaleString()}>{completedTime}</time>
          {:else}
            <span data-native-tool-end class:running-value={state === 'running'}>{completedTime}</span>
          {/if}
        </div>
        <div>
          <div class="detail-label">Duration</div>
          <span data-native-tool-duration class:running-value={state === 'running'}>{durationLabel}</span>
        </div>
      </div>
      <div>
        <div class="detail-label">Input</div>
        <pre class="detail-output" style="max-height:220px;color:var(--arbol-color-text)">{inputJson}</pre>
      </div>
      {#if state !== 'running'}
        <div>
          <div data-native-tool-output-label class="detail-label" style="color:{statusColor}">{outputLabel}</div>
          <pre class="detail-output" data-native-tool-output-state={state} style="max-height:320px;color:{outColor};background:{outBackground};border:{outBorder}">{loadingDeferred ? 'Loading full output…' : deferredError ? `Unable to load output: ${deferredError}` : state === 'failed' ? call.error || resultText || 'Failed (no error detail)' : state === 'checkpoint' ? call.error || resultText || 'Feedback checkpoint reached; command is still running' : resultText || (call.result_deferred ? `Output omitted from transcript · ${call.result_byte_len?.toLocaleString() || 'large'} bytes · expand to load and verify` : 'No output')}</pre>
          {#if truncated}
            <div style="margin-top:var(--arbol-space-1);color:var(--arbol-color-text-muted);font:400 0.72em/1.3 var(--arbol-font-mono);opacity:0.72">⋯ output truncated at 200 KB</div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .detail-label {
    margin-bottom: var(--arbol-space-1);
    font: 600 0.70em/1.2 var(--arbol-font-mono);
    letter-spacing: 0.045em;
    text-transform: uppercase;
    color: var(--arbol-color-text-muted);
    opacity: 0.78;
  }
  [data-native-tool-timeline] time,
  [data-native-tool-timeline] span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--arbol-color-text);
    font: 600 0.92em/1.35 var(--arbol-font-mono);
    font-variant-numeric: tabular-nums;
  }
  [data-native-tool-timeline] .running-value { color: var(--arbol-color-accent); }
  .detail-output {
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    background: color-mix(in srgb, var(--arbol-color-bg) 98%, var(--arbol-color-text));
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-s);
    padding: var(--arbol-space-3);
    font: 400 0.79em/1.48 var(--arbol-font-mono);
  }
  @media (max-width: 560px) {
    [data-native-tool-timeline] { grid-template-columns: 1fr !important; }
  }
  @keyframes native-output-pulse {
    70%, 100% { box-shadow: 0 0 0 0.4em transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-native-tool-live-output] span[aria-hidden='true'] { animation: none !important; }
  }
</style>
