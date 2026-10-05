<script lang="ts">
  import Swimlanes from './Swimlanes.svelte'
  import type { Swimlane, Swimmer } from '../data'
  import type { BoardApi } from './types'

  let {
    swimlanes,
    referenceNowMs,
    initialView = 'natural',
  }: {
    swimlanes: Swimlane[]
    referenceNowMs: number
    initialView?: 'natural' | 'fit'
  } = $props()

  let boardApi: BoardApi | null = $state(null)
  let slotOverrides = $state<Record<string, number>>({})
  const displayedSwimlanes = $derived(swimlanes.map((lane) => ({
    ...lane,
    n: lane.sid ? (slotOverrides[lane.sid] ?? lane.n) : lane.n,
  })))
  let event = $state('Ready — open a title, right-click a Swimlane or swimmer, pan, zoom, or resize columns.')
  let initialized = false

  function laneLabel(lane: Swimlane): string {
    return `Swimlane ${lane.n}${lane.tkt ? ` · ${lane.tkt}` : ''}`
  }

  function setReady(api: BoardApi) {
    boardApi = api
    if (!initialized && initialView === 'fit') {
      initialized = true
      requestAnimationFrame(() => api.fit())
    }
  }

  function report(action: string, lane?: Swimlane, swimmer?: Swimmer) {
    event = [action, lane ? laneLabel(lane) : '', swimmer?.nm ?? ''].filter(Boolean).join(' — ')
  }

  function swapStoryLanes(lane: Swimlane, targetSlot: number) {
    if (!lane.sid || lane.n === targetSlot) return
    const occupant = displayedSwimlanes.find((candidate) => candidate.sid && candidate.n === targetSlot)
    const next = { ...slotOverrides, [lane.sid]: targetSlot }
    if (occupant?.sid) next[occupant.sid] = lane.n
    slotOverrides = next
    event = occupant
      ? `Swapped lanes ${lane.n} and ${targetSlot}`
      : `Moved Swimlane ${lane.n} to empty lane ${targetSlot}`
  }
</script>

<div class="workshop">
  <div class="workshop-bar">
    <div>
      <strong>Board workshop</strong>
      <span>{event}</span>
    </div>
    <div class="controls" aria-label="Swimlanes board view controls">
      <button type="button" onclick={() => boardApi?.reset()}>↺ Reset</button>
      <button type="button" onclick={() => boardApi?.narrow()}>▭− Narrow</button>
      <button type="button" onclick={() => boardApi?.widen()}>▭＋ Widen</button>
      <button class:active={boardApi?.isFit?.() ?? false} type="button" onclick={() => boardApi?.fit()}>Fit occupied</button>
    </div>
  </div>

  <div class="board-stage">
    <Swimlanes
      swimlanes={displayedSwimlanes}
      {referenceNowMs}
      onReady={setReady}
      onOpenSwimlane={(lane) => report('Open details', lane)}
      onToast={(message) => (event = message)}
      onNewSwimlane={(slot) => (event = `Create a Swimlane${slot ? ` in slot ${slot}` : ''}`)}
      onFinishSwimlane={(lane) => report('Finish', lane)}
      onRemoveSwimlane={(lane) => report('Remove', lane)}
      onRenameSwimlane={(lane) => report('Rename', lane)}
      onSwapSwimlane={swapStoryLanes}
      onChatSwimlane={(lane) => report('Chat', lane)}
      onAddEntity={(lane, swimmer) => report('Add entity', lane, swimmer)}
      onSetWall={(lane, swimmer) => report('Set wall', lane, swimmer)}
    />
  </div>
</div>

<style>
  .workshop { box-sizing:border-box;height:100vh;min-height:620px;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--arbol-color-bg);color:var(--arbol-color-text);font-family:var(--arbol-font-ui); }
  .workshop-bar { min-width:0;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:9px 12px;border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface); }
  .workshop-bar>div:first-child { min-width:0;display:flex;align-items:baseline;gap:10px; }
  strong { flex:none;font-size:calc(11px * var(--arbol-font-scale)); }
  span { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text-muted);font-size:calc(10px * var(--arbol-font-scale)); }
  .controls { flex:none;display:flex;gap:5px; }
  button { padding:5px 8px;border:1px solid var(--arbol-color-border);border-radius:6px;background:var(--arbol-color-surface-2);color:var(--arbol-color-text);font:600 calc(10px * var(--arbol-font-scale))/1 var(--arbol-font-ui);cursor:pointer; }
  button:hover, button.active { border-color:var(--arbol-color-accent);background:var(--arbol-color-accent-soft);color:var(--arbol-color-accent); }
  .board-stage { min-height:0;min-width:0; }
  @media (max-width:760px) { .workshop-bar>div:first-child span { display:none; } .controls button { padding-inline:6px; } }
</style>
