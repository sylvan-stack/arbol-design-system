<script lang="ts">
  import { finalAnswerScrollTop, isAnswerThresholdBelowViewport } from './finalAnswerNavigation'

  type Ref<T> = { current: T }

  let { scrollRef }: { scrollRef: Ref<HTMLDivElement | null> } = $props()
  let scrollContainer = $state<HTMLDivElement | null>(null)
  let scrollTick = $state(0)

  // ResponseView populates the shared ref after this sibling has mounted. Wait for
  // that DOM commit rather than relying on the intentionally non-reactive ref.
  $effect(() => {
    let frame = 0
    const connect = () => {
      if (scrollRef.current) scrollContainer = scrollRef.current
      else frame = requestAnimationFrame(connect)
    }
    connect()
    return () => cancelAnimationFrame(frame)
  })

  $effect(() => {
    const scroller = scrollContainer
    if (!scroller) return
    const track = () => (scrollTick += 1)
    scroller.addEventListener('scroll', track, { passive: true })
    const observer = new ResizeObserver(track)
    observer.observe(scroller)
    const content = scroller.firstElementChild
    if (content) observer.observe(content)
    return () => {
      scroller.removeEventListener('scroll', track)
      observer.disconnect()
    }
  })

  const showBeacon = $derived.by(() => {
    void scrollTick
    const scroller = scrollContainer
    return Boolean(scroller && isAnswerThresholdBelowViewport(scroller))
  })

  const jumpToAnswer = () => {
    const scroller = scrollContainer
    const top = scroller ? finalAnswerScrollTop(scroller) : null
    if (scroller && top !== null) scroller.scrollTo({ top, behavior: 'smooth' })
  }
</script>

{#if showBeacon}
  <button
    type="button"
    class="answer-beacon"
    onclick={jumpToAnswer}
    aria-label="Jump to final answer"
    title="Jump to final answer"
  >
    <svg viewBox="0 0 720 76" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sunset-horizon-fade" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="currentColor" stop-opacity="0" />
          <stop offset=".18" stop-color="currentColor" stop-opacity=".25" />
          <stop offset=".5" stop-color="currentColor" stop-opacity=".8" />
          <stop offset=".82" stop-color="currentColor" stop-opacity=".25" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
        <radialGradient id="sunset-afterglow">
          <stop stop-color="currentColor" stop-opacity=".25" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse class="afterglow" cx="360" cy="63" rx="92" ry="48" />
      <path class="sun" d="M326 64a34 34 0 0 1 68 0Z" />
      <path class="horizon" d="M0 64c98-3 178 2 270-3 39-2 61-8 90-8s51 6 90 8c92 5 172 0 270 3" />
      <path class="reflection" d="m340 69 20 4 20-4M350 73l10 2 10-2" />
    </svg>
  </button>
{/if}

<style>
  .answer-beacon {
    position: absolute;
    z-index: 3;
    left: 50%;
    top: 0;
    width: min(520px, calc(100% - 48px));
    height: 30px;
    padding: 0;
    overflow: visible;
    color: var(--arbol-color-accent);
    border: 0;
    background: transparent;
    cursor: pointer;
    transform: translate(-50%, -74%);
    filter: drop-shadow(0 -4px 12px color-mix(in srgb, var(--arbol-color-accent) 12%, transparent));
    opacity: .78;
    transition: opacity 140ms ease, filter 140ms ease, transform 140ms ease;
  }

  .answer-beacon svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .afterglow { fill: url(#sunset-afterglow); }
  .sun { fill: color-mix(in srgb, currentColor 18%, transparent); stroke: currentColor; stroke-width: 1.5; }
  .horizon { fill: none; stroke: url(#sunset-horizon-fade); stroke-width: 1.5; stroke-linecap: round; }
  .reflection { fill: none; stroke: currentColor; stroke-width: 1; stroke-linecap: round; opacity: .34; }

  .answer-beacon:hover {
    opacity: 1;
    filter: drop-shadow(0 -5px 15px color-mix(in srgb, var(--arbol-color-accent) 22%, transparent));
    transform: translate(-50%, -80%);
  }

  .answer-beacon:focus-visible {
    outline: 2px solid var(--arbol-color-accent);
    outline-offset: 4px;
    border-radius: 50%;
  }

  @media (prefers-reduced-motion: reduce) {
    .answer-beacon { transition: none; }
  }
</style>
