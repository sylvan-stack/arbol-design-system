<script lang="ts">
  // A 4th "traffic light" that rebuilds + relaunches this UI. (Ported from React.)
  import { callNative } from '../bridge/arbol'

  let busy = $state(false)
  let failed = $state(false)
  let failureMessage = $state('')
  let focused = $state(false)

  const hasBridge = typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.arbol

  const palette = $derived(
    failed
      ? { top: '#ff8a86', bottom: '#ff5f57', glyph: 'rgba(105, 24, 18, 0.74)' }
      : busy
        ? { top: '#ffd972', bottom: '#ffbd2e', glyph: 'rgba(105, 70, 0, 0.74)' }
        : { top: '#c084fc', bottom: '#8b5cf6', glyph: 'rgba(52, 22, 86, 0.78)' },
  )

  async function onClick() {
    if (busy) return
    busy = true
    failed = false
    failureMessage = ''
    try {
      const r = await callNative('app.rebuildAndRestart')
      if (!r?.ok) throw new Error(r?.error || 'Rebuild failed')
      void watchRebuild()
    } catch (e) {
      console.error('Rebuild/restart failed', e)
      failed = true
      failureMessage = e instanceof Error ? e.message : String(e)
      busy = false
    }
  }

  // The host survives the whole rebuild now and terminates at cutover, so the
  // click itself only starts the run. Track the shared progress file the same
  // way RebuildProgress does: without this the light spins forever and never
  // surfaces a failed build.
  async function watchRebuild() {
    let seenActive = false
    let waited = 0
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      let s: { active?: boolean; failed?: boolean; phase?: string } | undefined
      try {
        s = (await callNative('app.rebuildProgress')) as { active?: boolean; failed?: boolean; phase?: string }
      } catch {
        continue // host is being replaced at cutover; the fresh app takes over
      }
      waited += 500
      if (s?.active) {
        seenActive = true
        continue
      }
      if (!seenActive) {
        // Our run never registered (spawn died before telemetry started).
        if (waited >= 15_000) break
        continue
      }
      if (s?.failed) {
        failed = true
        failureMessage = s?.phase || 'Rebuild failed'
      }
      break
    }
    busy = false
  }
</script>

{#if hasBridge}
  <button
    type="button"
    aria-label="Rebuild and restart this UI"
    title={failed ? `Rebuild failed: ${failureMessage}. Click to retry.` : busy ? 'Rebuilding this UI…' : 'Rebuild and restart this UI'}
    disabled={busy}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onclick={onClick}
    style="position:absolute;left:calc(var(--arbol-traffic-light-gutter) - 20px);
           top:calc((var(--arbol-control-bar-height) - 14px) / 2 - 4px);
           width:14px;height:14px;padding:0;margin:0;box-sizing:border-box;display:grid;
           place-items:center;border-radius:99px;border:0.5px solid rgba(0,0,0,0.18);
           background:linear-gradient({palette.top}, {palette.bottom});
           box-shadow:inset 0 1px 0 rgba(255,255,255,0.36);cursor:{busy ? 'wait' : 'pointer'};
           opacity:{busy ? 0.96 : 1};z-index:3;line-height:0;
           outline:{focused ? '1px solid rgba(255,255,255,0.28)' : 'none'};outline-offset:2px;
           min-width:0;min-height:0;overflow:hidden;font:0/0 sans-serif;vertical-align:top;
           appearance:none;-webkit-appearance:none;-webkit-app-region:no-drag"
  >
    {#if busy}
      <span
        aria-hidden="true"
        style="width:8px;height:8px;border-radius:99px;border:1.2px solid {palette.glyph};
               border-top-color:rgba(255,255,255,0.88);animation:arbol-rebuild-spin 0.8s linear infinite"
      ></span>
    {:else if failed}
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" style="display:block">
        <path d="M2 2 L6 6 M6 2 L2 6" fill="none" stroke={palette.glyph} stroke-width="1.15" stroke-linecap="round" />
      </svg>
    {/if}
  </button>
{/if}
