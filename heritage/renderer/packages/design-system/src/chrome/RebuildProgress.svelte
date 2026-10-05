<script lang="ts">
  import { onMount } from 'svelte'
  import { callNative } from '../bridge/arbol'
  import { elapsedAt, formatDuration, targetProgress, timeLeftAt, type RebuildProgress } from './rebuildTiming'

  let state = $state<RebuildProgress>({ active: false })
  let visible = $state(false)
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let now = $state(Date.now() / 1000)
  const hasBridge = typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.arbol
  // Keep the fill and countdown on one reactive clock. Deriving this value
  // avoids a stale imperative percentage while the ETA continues ticking.
  const percent = $derived(targetProgress(state, now))
  const rounded = $derived(Math.floor(percent))
  const elapsedSeconds = $derived(Math.floor(elapsedAt(state, now)))
  const timeElapsed = $derived(`${formatDuration(elapsedSeconds)} elapsed`)
  const rebuildLabel = $derived(`Rebuilding ${state.worktreeName || 'Arbol'}`)
  const timeLeft = $derived(timeLeftAt(state, now))

  function close() {
    visible = false
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
  }

  async function poll() {
    if (!hasBridge) return
    try {
      const next = (await callNative('app.rebuildProgress')) as RebuildProgress
      const failureJustReported = !!next.failed && !state.failed
      state = next
      if (next.awaitingRestart) {
        visible = true
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = undefined
        }
      } else if (next.failed) {
        if (failureJustReported) {
          visible = true
          if (hideTimer) clearTimeout(hideTimer)
          hideTimer = setTimeout(() => {
            visible = false
            hideTimer = undefined
          }, 60_000)
        }
      } else if (next.active) {
        visible = true
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = undefined
        }
      } else if (visible && (next.progress ?? 0) >= 100 && !hideTimer) {
        hideTimer = setTimeout(() => {
          visible = false
          hideTimer = undefined
        }, 4500)
      }
    } catch {
      // The native host is replaced near the end of a rebuild. Keep the last
      // known progress on screen until this renderer exits or polling reconnects.
    }
  }

  onMount(() => {
    void poll()
    const pollTimer = window.setInterval(poll, 500)
    const clockTimer = window.setInterval(() => { now = Date.now() / 1000 }, 1000)
    return () => {
      window.clearInterval(pollTimer)
      window.clearInterval(clockTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  })
</script>

{#if visible}
  <div
    class:failed={state.failed}
    class:complete={!state.active && !state.failed && !state.awaitingRestart && percent >= 100}
    title={state.awaitingRestart ? state.message ?? state.phase : `${rebuildLabel} · ${state.phase ?? 'Rebuild started'} · ${timeElapsed} · ${state.active ? timeLeft : state.failed ? 'failed' : 'complete'}${state.historySamples ? ` · predicted from ${state.historySamples} prior rebuild${state.historySamples === 1 ? '' : 's'}` : ' · first-run estimate'}`}
  >
    <span
      class="track"
      role="progressbar"
      aria-label={`${rebuildLabel} progress`}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={rounded}
      aria-valuetext={state.awaitingRestart ? state.phase : state.active ? `${timeElapsed}, ${timeLeft}` : state.failed ? `Rebuild failed after ${formatDuration(elapsedSeconds)}` : `Rebuild complete in ${formatDuration(elapsedSeconds)}`}
    ><span class="fill" style={`width:${percent}%`}></span></span>
    <span class="label">{state.awaitingRestart ? state.phase : state.failed ? `${rebuildLabel} failed` : state.active ? rebuildLabel : `${rebuildLabel} complete`}</span>
    {#if state.active && state.phase}<span class="phase">{state.phase}</span>{/if}
    <span class="value percent">{rounded}%</span>
    <span class="value elapsed">{timeElapsed}</span>
    <span class="value remaining">{state.awaitingRestart ? 'Paused' : state.failed ? 'Stopped' : state.active ? timeLeft : 'Done'}</span>
    {#if state.failed}
      <button type="button" onclick={close} aria-label="Close rebuild failure">Close</button>
    {/if}
  </div>
{/if}

<style>
  div {
    position: absolute;
    inset: auto 0 0 0;
    height: 16px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 calc(var(--arbol-space-3) + 4px);
    overflow: hidden;
    pointer-events: none;
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .track {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--arbol-color-accent) 8%, var(--arbol-color-surface));
    border-top: 1px solid color-mix(in srgb, var(--arbol-color-accent) 32%, transparent);
  }

  .fill {
    display: block;
    height: 100%;
    min-width: 1px;
    background: color-mix(in srgb, var(--arbol-color-accent) 30%, transparent);
    border-right: 1px solid var(--arbol-color-accent);
    box-shadow: 0 0 9px color-mix(in srgb, var(--arbol-color-accent) 50%, transparent);
    transition: width 480ms linear;
  }

  .label, .phase, .value {
    position: relative;
    z-index: 1;
    text-shadow: 0 1px 2px var(--arbol-color-surface);
  }

  .label {
    max-width: min(55vw, 520px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .phase {
    max-width: min(35vw, 360px);
    overflow: hidden;
    color: var(--arbol-color-text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .value { color: var(--arbol-color-accent); }
  div.failed .track { background: color-mix(in srgb, #ff5f57 15%, var(--arbol-color-surface)); }
  div.failed .fill { background: color-mix(in srgb, #ff5f57 30%, transparent); border-color: #ff5f57; }
  div.failed .value { color: #ff756e; }
  button {
    position: relative;
    z-index: 1;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, #ff5f57 55%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, #ff5f57 12%, var(--arbol-color-surface));
    color: #ff756e;
    font: inherit;
    line-height: 12px;
    cursor: pointer;
    pointer-events: auto;
  }
  button:hover { background: color-mix(in srgb, #ff5f57 22%, var(--arbol-color-surface)); }
  button:focus-visible { outline: 1px solid #ff756e; outline-offset: 1px; }
  div.complete .fill { background: color-mix(in srgb, #34c759 30%, transparent); border-color: #34c759; }
  div.complete .value { color: #34c759; }
</style>
