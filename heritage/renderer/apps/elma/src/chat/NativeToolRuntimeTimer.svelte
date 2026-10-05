<script lang="ts">
  /* Per-call runtime. Calls at or below one minute remain quiet; longer settled
   * calls freeze at their durable settlement timestamp. */
  import type { NativeToolCallView } from '@arbol/events'
  import { nativeCallTimerLabel } from './responseView'

  let { call }: { call: NativeToolCallView } = $props()

  const running = $derived(call.ok === null)
  let now = $state(Date.now())

  $effect(() => {
    if (!running) return
    now = Date.now()
    const id = window.setInterval(() => (now = Date.now()), 1000)
    return () => window.clearInterval(id)
  })

  const label = $derived(nativeCallTimerLabel(call, now))
  const title = $derived(label ? (running ? `Running for ${label}` : `Ran for ${label}`) : '')
</script>

{#if label}
  <span
    data-native-tool-runtime
    {title}
    aria-label={title}
    style="color:{running ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'};flex-shrink:0;font-weight:700;font-variant-numeric:tabular-nums;opacity:{running ? 0.9 : 0.72}"
  >{label}</span>
{/if}
