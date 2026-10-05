<script lang="ts">
  import type { Swimlane, Swimmer } from './data'
  import { compactSwimmerProgress } from './compactTime'
  import { wallCol, WICON } from './time'

  let {
    swimlanes,
    nowMs,
    loading = false,
    loadError = false,
    onExit,
    onOpenSwimlane,
    onDrag,
  }: {
    swimlanes: Swimlane[]
    nowMs: number
    loading?: boolean
    loadError?: boolean
    onExit: () => void
    onOpenSwimlane: (lane: Swimlane) => void
    onDrag: (event: MouseEvent) => void
  } = $props()

  const occupied = $derived(swimlanes
    .filter((lane) => lane.sid && lane.swimmers?.length)
    .sort((a, b) => a.n - b.n))
  const swimmerCount = $derived(occupied.reduce((count, lane) => count + (lane.swimmers?.length ?? 0), 0))

  const laneColor = (lane: Swimlane) => `oklch(0.68 0.12 ${lane.hue ?? 150})`
  const progress = (swimmer: Swimmer) => compactSwimmerProgress(swimmer, nowMs)
  const barColor = (swimmer: Swimmer) => swimmer.type ? wallCol(swimmer.type) : 'var(--arbol-color-accent)'
  const dueTitle = (swimmer: Swimmer) => swimmer.dueMs == null
    ? `${progress(swimmer).elapsedLabel}; no estimated end`
    : `${progress(swimmer).elapsedLabel}; ${progress(swimmer).remainingLabel}`
</script>

<div class="oaken-compact-shell">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="oaken-compact-header" onmousedown={onDrag}>
    <div class="oaken-compact-brand" aria-label="Oaken compact swimlanes">
      <span class="oaken-compact-mark" aria-hidden="true">◒</span>
      <span>Oaken</span>
      <span class="oaken-compact-count">{swimmerCount} {swimmerCount === 1 ? 'swimmer' : 'swimmers'}</span>
    </div>
    <button type="button" class="oaken-compact-exit" onclick={onExit} title="Close the Swimlanes timer panel">
      Close
    </button>
  </header>

  <main class="oaken-compact-body">
    {#if loading && occupied.length === 0}
      <div class="oaken-compact-empty oaken-compact-loading" aria-live="polite">
        <span class="oaken-compact-spinner" aria-hidden="true"></span>
        <strong>Loading swimlanes…</strong>
      </div>
    {:else if loadError && occupied.length === 0}
      <div class="oaken-compact-empty" aria-live="polite">
        <strong>Reconnecting to Oaken…</strong>
        <span>The timer panel will refresh automatically.</span>
      </div>
    {:else if occupied.length === 0}
      <div class="oaken-compact-empty">
        <strong>No active swimlanes</strong>
        <span>Create a swimlane in the full board to track it here.</span>
      </div>
    {:else}
      <div class="oaken-compact-list">
        {#each occupied as lane (lane.sid)}
          <section class="oaken-compact-lane" style={`--lane-color:${laneColor(lane)}`}>
            <button
              type="button"
              class="oaken-compact-lane-head"
              onclick={() => onOpenSwimlane(lane)}
              title={`Open ${lane.tkt ?? `Swimlane ${lane.n}`} in Oaken`}
            >
              <span class="oaken-compact-lane-dot" aria-hidden="true"></span>
              <span class="oaken-compact-lane-number">{String(lane.n).padStart(2, '0')}</span>
              <span class="oaken-compact-lane-name">{lane.tkt ?? `Swimlane ${lane.n}`}</span>
              <span class="oaken-compact-lane-total">{lane.swimmers?.length ?? 0}</span>
            </button>

            <div class="oaken-compact-swimmers">
              {#each lane.swimmers ?? [] as swimmer (swimmer.id)}
                {@const state = progress(swimmer)}
                <article class:overdue={state.overdue} class:planned={state.planned} class="oaken-compact-swimmer" title={dueTitle(swimmer)}>
                  <div class="oaken-compact-swimmer-top">
                    <span class="oaken-compact-source">{swimmer.src}</span>
                    <span class="oaken-compact-swimmer-name">{swimmer.nm}</span>
                    {#if state.planned}<span class="oaken-compact-planned">PLANNED</span>{/if}
                  </div>

                  {#if state.hasEnd}
                    <div class="oaken-compact-times">
                      <span>{state.elapsedLabel}</span>
                      <span class:overdue={state.overdue} class="oaken-compact-left">
                        {#if swimmer.type}<span aria-hidden="true">{WICON[swimmer.type]}</span>{/if}
                        {state.remainingLabel}
                      </span>
                    </div>
                    <div
                      class="oaken-compact-progress"
                      class:overdue={state.overdue}
                      role="progressbar"
                      aria-label={`${swimmer.nm}: ${state.elapsedLabel}, ${state.remainingLabel}`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={Math.round(state.percent)}
                    >
                      <span class="oaken-compact-progress-fill" style={`width:${state.percent}%;--bar-color:${barColor(swimmer)}`}></span>
                      {#if state.overdue}<span class="oaken-compact-overdue-cap"></span>{/if}
                    </div>
                  {:else}
                    <div class="oaken-compact-elapsed-only">
                      <span class="oaken-compact-elapsed-pulse" aria-hidden="true"></span>
                      <span>{state.elapsedLabel}</span>
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {/if}
  </main>
</div>
