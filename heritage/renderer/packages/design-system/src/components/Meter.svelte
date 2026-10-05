<script lang="ts">
  import type { MeterData } from './types'
  let { title, meter }: { title: string; meter: MeterData } = $props()

  const pct = $derived(Math.max(0, Math.min(100, meter.percentUsed)))
  const color = $derived(pct >= 90 ? 'var(--arbol-color-err)' : pct >= 70 ? 'var(--arbol-color-warn)' : 'var(--arbol-color-ok)')
</script>

<div style="margin-top:var(--arbol-space-3)">
  <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:var(--arbol-type-label)">
    <span style="color:var(--arbol-color-text);font-weight:500;white-space:nowrap">{title}</span>
    <span style="color:var(--arbol-color-text-muted);font-family:var(--arbol-font-mono);white-space:nowrap;padding-left:10px">
      {meter.displayText}
    </span>
  </div>
  <div style="height:7px;background:var(--arbol-color-surface-2);border-radius:99px;margin-top:5px;
              overflow:hidden;border:1px solid var(--arbol-color-hairline)">
    <div style="width:{pct}%;height:100%;background:{color};border-radius:99px;
                transition:width .6s cubic-bezier(.2,.7,.2,1)"></div>
  </div>
  {#if meter.resetInfo}
    <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted);margin-top:4px">{meter.resetInfo}</div>
  {/if}
</div>
