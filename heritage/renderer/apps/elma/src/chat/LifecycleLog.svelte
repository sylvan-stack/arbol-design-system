<script lang="ts">
  /* The turn-lifecycle timeline (sent → started responding → responded). Events
   * within ±3s collapse onto one line. (Ported from ResponseView's LifecycleLog.) */
  import { groupEvents } from './responseView'
  import { fmtTime } from './util'

  let { sentAt, startedAt, respondedAt }:
    { sentAt?: number; startedAt?: number; respondedAt?: number | null } = $props()

  const groups = $derived.by(() => {
    const events: { label: string; t: number }[] = []
    if (sentAt) events.push({ label: 'Message sent', t: sentAt })
    if (startedAt) events.push({ label: 'Agent started responding', t: startedAt })
    if (respondedAt != null) events.push({ label: 'Agent responded', t: respondedAt })
    return events.length ? groupEvents(events) : []
  })
</script>

{#if groups.length}
  <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:var(--arbol-space-3)">
    {#each groups as g, i (i)}
      <div style="font-family:var(--arbol-font-mono);font-weight:400;font-size:calc(var(--arbol-type-label) * 0.88);line-height:1.45;color:var(--arbol-color-text-muted);opacity:0.75">
        {g.labels.join(' · ')} <span style="opacity:0.7">— {fmtTime(g.t)}</span>
      </div>
    {/each}
  </div>
{/if}
