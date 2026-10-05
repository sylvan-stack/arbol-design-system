<script lang="ts">
  /* Oaken[Swimlanes] — the board.
   *
   * A 64px axis column + a scrolling world of Swimlanes. Time runs UP the Y-axis,
   * paged by working day with hatched night-gaps; a glowing NOW rule marks the
   * current time. Each Swimlane is split into Swimmer columns drawn as vertical
   * spines (spent / remaining / overdue / planned + a typed wall + a live
   * countdown). Swimlanes that don't exist yet still show as placeholder slots —
   * the board always renders a fixed set (see withPlaceholders / SWIMLANE_SLOTS).
   *
   * Svelte 5 port of the React component (which itself re-expressed the
   * prototype's imperative sketch). It uses absolutely-positioned divs with the
   * shared .pool/* classes in oaken.css — same px/time geometry, computed
   * analytically. The body scrolls NATIVELY (WebKit reuses rasterised tiles);
   * the header pins with position:sticky; only the left axis gutter is JS-synced
   * to the scroll offset. Pan (drag), zoom (⌘-wheel), column width and Fit are
   * the live controls. */
  import { onMount, tick } from 'svelte'
  import {
    GAP,
    PAGE0,
    PAGE1,
    PAGE_HRS,
    WICON,
    WORK,
    abs,
    baseFill,
    clock,
    fmtLeft,
    buildTimelineDays,
    epochToHourPoint,
    hourPointToEpoch,
    simHours,
    timelineGeometryAnchor,
    timelineGeometryY,
    viewportTemporalContext,
    wallCol,
    type HourPoint,
    type TimelineGeometryAnchor,
  } from '../time'
  import { imp, isEmptySwimlane, withPlaceholders, type Swimlane, type Swimmer } from '../data'
  import {
    PREVIOUS_BOARD_VIEW_KEYS,
    clearSavedBoardView,
    horizontalScrollLeft,
    horizontalScrollRatio,
    readSavedBoardView,
    writeSavedBoardView,
    type SavedBoardView,
  } from '../boardView'
  import type { BoardApi } from './types'

  let { swimlanes, referenceNowMs, onOpenSwimlane, onReady, onToast, onNewSwimlane, onFinishSwimlane, onRemoveSwimlane, onRenameSwimlane, onSwapSwimlane, onChatSwimlane, onAddEntity, onSetWall }:
    {
      swimlanes: Swimlane[]
      /** Freeze the board clock for deterministic workshops and visual tests. */
      referenceNowMs?: number
      onOpenSwimlane: (l: Swimlane) => void
      onReady: (api: BoardApi) => void
      onToast: (msg: string) => void
      onNewSwimlane: (slot?: number) => void
      onFinishSwimlane: (l: Swimlane) => void
      onRemoveSwimlane: (l: Swimlane) => void
      onRenameSwimlane: (l: Swimlane) => void
      onSwapSwimlane: (l: Swimlane, targetSlot: number) => void
      onChatSwimlane: (l: Swimlane) => void
      onAddEntity: (l: Swimlane, sm: Swimmer) => void
      onSetWall: (l: Swimlane, sm: Swimmer) => void
    } = $props()

  const PADX = 12 // .lanes horizontal padding
  const LANEGAP = 8 // gap between swimlanes (and head cells)
  const COLW_DEFAULT = 150
  const COLW_MIN = 50
  const COLW_MAX = 320
  const COLW_STEP = 22
  const ZOOM_MIN = 0.01
  const ZOOM_MAX = 4.5
  const EMPTY_DAY_SCALE = 0.5
  const timelineAnchorMs = (() => referenceNowMs ?? Date.now())()
  const timelineDays = buildTimelineDays(timelineAnchorMs)
  const firstDay = timelineDays[0].offset
  const lastDay = timelineDays[timelineDays.length - 1].offset

  type SwimlanePos = { left: number; width: number; nCols: number; cw: number; swimlane: Swimlane }
  type Layout = { worldW: number; CW: number; pos: SwimlanePos[] }

  /* Analytic swimlane/column layout — mirrors the flexbox below. Non-empty
   * swimlanes share one column width CW (basis colw + an equal slice of any free
   * space); empty swimlanes are a fixed 70px stub. */
  function computeLayout(shownLanes: Swimlane[], colw: number, vpW: number): Layout {
    let content = PADX * 2 + LANEGAP * Math.max(0, shownLanes.length - 1)
    let totalGrow = 0
    for (const L of shownLanes) {
      if (isEmptySwimlane(L)) content += 70
      else {
        const n = L.swimmers!.length
        content += n * colw
        totalGrow += n
      }
    }
    const worldW = Math.max(vpW, content)
    const free = Math.max(0, vpW - content)
    const CW = colw + (free > 0 && totalGrow > 0 ? free / totalGrow : 0)
    let x = PADX
    const pos: SwimlanePos[] = shownLanes.map((swimlane) => {
      const empty = isEmptySwimlane(swimlane)
      const nCols = empty ? 1 : swimlane.swimmers!.length
      const cw = empty ? 70 : CW
      const width = empty ? 70 : nCols * CW
      const p: SwimlanePos = { left: x, width, nCols, cw, swimlane }
      x += width + LANEGAP
      return p
    })
    return { worldW, CW, pos }
  }

  const overlapArea = (
    a: { x0: number; x1: number; y0: number; y1: number },
    b: { x0: number; x1: number; y0: number; y1: number }
  ) => {
    const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
    return x * y
  }

  /* swimlane background tint: hue + per-column index + an importance factor */
  function colBg(hue: number, idx: number, n: number): string {
    const im = imp(n)
    const H = hue + idx * 26
    const L = 0.56 + (idx % 2) * 0.05 + im * 0.07
    const a = Math.round(24 + im * 42)
    return `color-mix(in oklch, oklch(${L} 0.085 ${H}) ${a}%, transparent)`
  }
  const softFill = (type: Swimmer['type'], im = 0.6) =>
    `color-mix(in oklch, ${baseFill(type)} ${Math.round(64 + im * 36)}%, var(--arbol-color-surface))`

  // ── reactive state ─────────────────────────────────────────────────────────
  let zoom = $state(1)
  let colw = $state(COLW_DEFAULT)
  let fitMode = $state(false)
  let vpW = $state(0)
  let vpH = $state(0)
  // live clock — drives countdowns / completion caps; bumped each second (and
  // suspended mid-gesture so an in-progress drag/scroll never re-renders).
  let nowMs = $state(Date.now())
  // bumped by reset() so the layout effect always re-runs (even when zoom/colw are
  // already at their defaults) and re-anchors the scroll.
  let resetNonce = $state(0)

  // context menu (built inline with the shared .dpop classes)
  type MenuItem = {
    label?: string
    glyph?: string
    hint?: string
    sep?: boolean
    danger?: boolean
    disabled?: boolean
    children?: MenuItem[]
    run?: () => void
  }
  type Menu = { x: number; y: number; title: string; items: MenuItem[] }
  let menu = $state<Menu | null>(null)
  let openSubmenu = $state<number | null>(null)

  // The board: real swimlanes padded up to the fixed placeholder slot count.
  const board = $derived(withPlaceholders(swimlanes))
  // When nothing is populated yet, render the placeholders as equal full-width
  // columns (a clear scaffold) rather than the thin "no swimmers" stubs.
  const allEmpty = $derived(board.every(isEmptySwimlane))
  const shown = $derived(fitMode ? board.filter((l) => !isEmptySwimlane(l)) : board)

  // ── element refs ─────────────────────────────────────────────────────────
  let scrollerEl: HTMLDivElement | undefined
  let axisWorldEl: HTMLDivElement | undefined
  let axisCurEl: HTMLDivElement | undefined

  // imperative gesture / scheduling state (plain, non-reactive)
  let tipEvt: { x: number; y: number } | null = null
  let tipRaf: number | null = null
  let rect: DOMRect | null = null
  let drag: { x: number; y: number; sl: number; st: number } | null = null
  let inited = false
  let resetPending = false
  // Auto-pin the NOW line through the initial layout-settling period (the
  // scroller's height arrives over a couple of ResizeObserver fires on first
  // paint), and after Reset — until the user's first scroll/drag/zoom.
  let following = true
  // Scroll target to apply after a geometry-changing re-render (zoom anchors on
  // NOW; Fit resets the horizontal offset). Native scroll auto-clamps out-of-range.
  let pendingScroll: { top?: number; left?: number } | null = null
  let pendingTimeAnchor: { point: HourPoint; ratio: number } | null = null
  // Wheel events can arrive faster than Svelte/DOM layout. Batch them into one
  // zoom transaction per frame so every anchor is measured against the geometry
  // that is actually on screen, never a half-applied intermediate zoom.
  type ZoomRequest = { target: number; anchor: TimelineGeometryAnchor; ratio: number }
  let queuedZoom: ZoomRequest | null = null
  let activeZoom: ZoomRequest | null = null
  let zoomRaf: number | null = null
  let zoomApplyVersion = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let restoring = true
  // The temporal centre is kept independently from scrollTop. The world geometry
  // changes when data arrives (empty dates expand), the viewport resizes, or zoom
  // changes; raw pixels are therefore not a stable representation of the view.
  let stableTimeAnchor: { point: HourPoint; ratio: number } | null = null
  let applyingTimeAnchor = false
  let anchorApplyVersion = 0
  let lastVerticalGeometry = ''
  let pendingSavedView: SavedBoardView | null = null
  // Horizontal position must be restored semantically too. The board first
  // renders placeholders and receives its real columns asynchronously, so a raw
  // scrollLeft restored during first paint would be clamped to zero permanently.
  let stableHorizontalRatio = 0
  let applyingHorizontalAnchor = false
  let horizontalApplyVersion = 0
  let lastHorizontalGeometry = ''
  // When NOW leaves the viewport, retain temporal orientation in the fixed axis
  // gutter. The timeline runs upward, so a viewport below NOW is in the past and
  // a viewport above NOW is in the future.
  let temporalContext = $state<'past' | 'future' | null>(null)

  const verticalGeometryKey = () => `${zoom}|${vpH}|${dayScales.join(',')}`
  const horizontalGeometryKey = () => `${vpW}|${layout.worldW}|${colw}|${fitMode}`
  const captureTimeAnchor = (ratio = 0.5) => {
    const el = scrollerEl
    if (!el || !vpH) return null
    return {
      point: pointAtBottomY(worldH - (el.scrollTop + vpH * ratio)),
      ratio,
    }
  }
  const writeSavedView = (saved: SavedBoardView) => writeSavedBoardView(localStorage, saved)
  const flushPersistedView = () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (pendingSavedView) {
      writeSavedView(pendingSavedView)
      pendingSavedView = null
    }
  }
  const persistView = () => {
    if (restoring) return
    const anchor = captureTimeAnchor()
    if (!anchor) return
    stableTimeAnchor = anchor
    const el = scrollerEl!
    stableHorizontalRatio = horizontalScrollRatio(el.scrollLeft, el.scrollWidth, el.clientWidth)
    pendingSavedView = {
      zoom,
      anchorMs: hourPointToEpoch(anchor.point),
      anchorRatio: anchor.ratio,
      horizontalRatio: stableHorizontalRatio,
      colw,
      fitMode,
    }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flushPersistedView, 180)
  }
  const applyHorizontalAnchor = (ratio: number) => {
    stableHorizontalRatio = ratio
    const version = ++horizontalApplyVersion
    applyingHorizontalAnchor = true
    void tick().then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))).then(() => {
      const el = scrollerEl
      if (!el || version !== horizontalApplyVersion) return
      el.scrollLeft = horizontalScrollLeft(ratio, el.scrollWidth, el.clientWidth)
      lastHorizontalGeometry = horizontalGeometryKey()
      syncAxis()
    }).finally(() => {
      if (version !== horizontalApplyVersion) return
      requestAnimationFrame(() => {
        if (version === horizontalApplyVersion) applyingHorizontalAnchor = false
      })
    })
  }
  const persistViewAfterLayout = () => {
    void tick().then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))).then(persistView)
  }

  const applyTimeAnchor = (anchor: { point: HourPoint; ratio: number }) => {
    stableTimeAnchor = anchor
    const version = ++anchorApplyVersion
    applyingTimeAnchor = true
    void tick().then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))).then(() => {
      const el = scrollerEl
      if (!el || version !== anchorApplyVersion) return
      const height = Math.max(1, el.clientHeight)
      el.scrollTop = worldH - ybA(anchor.point) - anchor.ratio * height
      lastVerticalGeometry = verticalGeometryKey()
      syncAxis()
      scheduleAxisCursor()
    }).finally(() => {
      if (version !== anchorApplyVersion) return
      // Scroll events caused by the correction are dispatched asynchronously.
      // Keep them from replacing the semantic anchor with transient pixels.
      requestAnimationFrame(() => {
        if (version !== anchorApplyVersion) return
        applyingTimeAnchor = false
        if (restoring) restoring = false
      })
    })
  }

  // Suspend the 1s timer re-render while a gesture is in flight, so an in-progress
  // drag/scroll never stutters; resume shortly after the gesture settles.
  let interacting = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const markInteracting = () => {
    interacting = true
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      interacting = false
      nowMs = referenceNowMs ?? Date.now()
    }, 400)
  }

  // ── bounded, non-uniform time geometry ─────────────────────────────────────
  // A day is occupied when a swimmer's visible start→wall/NOW interval intersects
  // it. Today is deliberately never compressed, so Reset is always predictable.
  const occupiedOffsets = $derived.by(() => {
    const result = new Set<number>([0])
    for (const lane of board) for (const sm of lane.swimmers ?? []) {
      const end = sm.due ?? epochToHourPoint(nowMs)
      const lo = Math.max(firstDay, Math.min(swimmerStart(sm)[0], end[0]))
      const hi = Math.min(lastDay, Math.max(swimmerStart(sm)[0], end[0]))
      for (let day = lo; day <= hi; day++) result.add(day)
    }
    return result
  })
  const pph = $derived((vpH / 9) * zoom)
  const dayScales = $derived(timelineDays.map((day) => occupiedOffsets.has(day.offset) ? 1 : EMPTY_DAY_SCALE))
  const dayHeights = $derived(dayScales.map((scale) => PAGE_HRS * pph * scale))
  const dayBottoms = $derived.by(() => {
    const result: number[] = []
    let y = 0
    timelineDays.forEach((_day, i) => {
      result.push(y)
      y += dayHeights[i]
      if (i < timelineDays.length - 1) y += GAP
    })
    return result
  })
  const worldH = $derived(dayBottoms.at(-1)! + dayHeights.at(-1)!)
  // Calendar offsets are not contiguous because weekends are omitted. Project a
  // point that happens to fall on a weekend onto the next visible working page.
  const dayIndex = (offset: number) => {
    const next = timelineDays.findIndex((day) => day.offset >= offset)
    return next < 0 ? timelineDays.length - 1 : next
  }
  const yb = (offset: number, hr: number) => {
    const i = dayIndex(offset)
    const h = Math.max(PAGE0, Math.min(PAGE1, hr))
    return dayBottoms[i] + (h - PAGE0) * pph * dayScales[i]
  }
  const ybA = (a: HourPoint) => yb(a[0], a[1])
  const swimmerStart = (sm: Swimmer): HourPoint => sm.startMs != null ? epochToHourPoint(sm.startMs) : sm.start
  const pointAtBottomY = (y: number): HourPoint => {
    const clamped = Math.max(0, Math.min(worldH, y))
    for (let i = timelineDays.length - 1; i >= 0; i--) {
      const bottom = dayBottoms[i]
      const height = PAGE_HRS * pph * dayScales[i]
      if (clamped >= bottom) {
        const hour = clamped > bottom + height ? PAGE1 : PAGE0 + (clamped - bottom) / (pph * dayScales[i])
        return [timelineDays[i].offset, Math.max(PAGE0, Math.min(PAGE1, hour))]
      }
    }
    return [firstDay, PAGE0]
  }
  const sim = $derived(simHours(nowMs))
  const nowPoint = $derived(epochToHourPoint(nowMs))
  const nowY = $derived(ybA(nowPoint))
  const layout = $derived(computeLayout(shown, colw, vpW))
  // At small scales clock labels become noise and overlap one another. Keep date
  // labels and the highlighted current time, but suppress the repeated legend.
  const showTimeLegend = $derived(pph >= 14)
  const minimumZoom = () => {
    if (!vpH) return ZOOM_MIN
    const scaledHours = dayScales.reduce((sum, scale) => sum + PAGE_HRS * scale, 0)
    const available = Math.max(1, vpH - GAP * (timelineDays.length - 1))
    return Math.max(ZOOM_MIN, available / ((vpH / 9) * scaledHours))
  }

  const dims = () => ({ worldH, worldW: layout.worldW, pph, pageH: pph * PAGE_HRS })

  // The timeline body scrolls NATIVELY; the header pins with position:sticky. Only
  // the left axis lives in its own clipped column, so it's the one gutter we
  // translate to follow the scroll offset.
  const syncAxis = () => {
    const el = scrollerEl
    if (!el) return
    if (axisWorldEl) axisWorldEl.style.transform = `translate3d(0, ${-el.scrollTop}px, 0)`
    const nowTop = worldH - nowY
    temporalContext = viewportTemporalContext(nowTop, el.scrollTop, el.clientHeight)
  }

  // Scroll so the NOW line sits at the viewport's bottom edge (the world is
  // bottom-anchored, so a point at `bottom:nowY` is `worldH - nowY` from the top).
  // Deferred to the next frame so the zoom-driven height change has been applied
  // to the DOM first — otherwise `scrollTop` is clamped to the OLD (smaller)
  // scrollHeight and NOW stays off-screen (the "click Reset several times" bug).
  const frameNow = () => {
    if (!scrollerEl || !vpH || !vpW) return
    requestAnimationFrame(() => {
      const el = scrollerEl
      if (!el) return
      el.scrollTop = Math.max(0, worldH - nowY - vpH)
      const { worldW, pos } = layout
      el.scrollLeft =
        worldW > vpW && pos[3] && pos[4] ? Math.max(0, (pos[3].left + pos[4].left + pos[4].width) / 2 - vpW / 2) : 0
      syncAxis()
    })
  }

  // ── cursor → time readout on the LEFT AXIS (not a floating tip near the
  // pointer). Writes are coalesced to one per frame via rAF — smooth, no flicker.
  const updateAxisCursor = () => {
    const cur = axisCurEl
    const el = scrollerEl
    const ev = tipEvt
    if (!cur || !el) return
    if (!ev) {
      cur.style.display = 'none'
      return
    }
    const r = rect ?? el.getBoundingClientRect()
    const sy = ev.y - r.top
    if (sy < 0 || sy > r.height) {
      cur.style.display = 'none'
      return
    }
    const point = pointAtBottomY(worldH - (sy + el.scrollTop))
    cur.textContent = clock(point[1])
    cur.style.display = 'block'
    cur.style.top = sy + 'px'
  }
  const scheduleAxisCursor = () => {
    if (tipRaf != null) return
    tipRaf = requestAnimationFrame(() => {
      tipRaf = null
      updateAxisCursor()
    })
  }
  const hideAxisCursor = () => {
    tipEvt = null
    if (axisCurEl) axisCurEl.style.display = 'none'
    if (tipRaf != null) {
      cancelAnimationFrame(tipRaf)
      tipRaf = null
    }
  }

  // ── observe viewport size ──────────────────────────────────────────────────
  $effect(() => {
    const el = scrollerEl
    if (!el) return
    const ro = new ResizeObserver(() => {
      vpW = el.clientWidth
      vpH = el.clientHeight
      rect = el.getBoundingClientRect()
    })
    ro.observe(el)
    vpW = el.clientWidth
    vpH = el.clientHeight
    rect = el.getBoundingClientRect()
    return () => ro.disconnect()
  })

  // Live countdown tick (suspended mid-gesture). Storybook and visual tests can
  // provide a reference instant so every planned/active/overdue state is stable.
  $effect(() => {
    if (referenceNowMs != null) {
      nowMs = referenceNowMs
      return
    }
    const id = setInterval(() => {
      if (!interacting) nowMs = Date.now()
    }, 1000)
    return () => {
      clearInterval(id)
      if (idleTimer) clearTimeout(idleTimer)
    }
  })

  // ── wheel: ⌘/Ctrl → zoom; plain wheel scrolls natively ────────────────────
  $effect(() => {
    const el = scrollerEl
    if (!el) return

    const scheduleZoom = () => {
      if (zoomRaf != null || activeZoom || !queuedZoom) return
      zoomRaf = requestAnimationFrame(() => {
        zoomRaf = null
        const request = queuedZoom
        queuedZoom = null
        if (!request || request.target === zoom) {
          if (queuedZoom) scheduleZoom()
          return
        }
        activeZoom = request
        const version = ++zoomApplyVersion
        zoom = request.target
        // tick() is stronger than a bare rAF here: it guarantees the new world
        // height has reached the DOM before scrollTop can be browser-clamped.
        void tick().then(() => {
          if (version !== zoomApplyVersion || !scrollerEl) return
          const currentHeight = Math.max(1, scrollerEl.clientHeight)
          const anchoredY = timelineGeometryY(request.anchor, dayBottoms, dayHeights)
          applyingTimeAnchor = true
          scrollerEl.scrollTop = worldH - anchoredY - request.ratio * currentHeight
          syncAxis()
          scheduleAxisCursor()
          stableTimeAnchor = captureTimeAnchor()
          lastVerticalGeometry = verticalGeometryKey()
          applyingTimeAnchor = false
          persistView()
        }).finally(() => {
          if (activeZoom === request) activeZoom = null
          // Wheel events that arrived while the DOM was settling use this same
          // logical anchor and are committed only after scrollTop is corrected.
          if (queuedZoom) scheduleZoom()
        })
      })
    }

    const onWheel = (e: WheelEvent) => {
      following = false // wheel/trackpad scroll or zoom — stop auto-pinning NOW
      if (!(e.metaKey || e.ctrlKey)) return // let WebKit handle plain scroll natively
      e.preventDefault()
      markInteracting()

      const height = Math.max(1, el.clientHeight)
      const anchorRatio = Math.max(0, Math.min(1, (e.clientY - el.getBoundingClientRect().top) / height))
      const anchorY = worldH - (el.scrollTop + anchorRatio * height)
      const measuredAnchor = timelineGeometryAnchor(anchorY, dayBottoms, dayHeights)
      // A trackpad may send another event after reactive geometry changed but
      // before its scroll correction has committed. Keep the active transaction's
      // logical anchor in that interval; remeasuring would cause a large jump.
      const stableAnchor = activeZoom ?? queuedZoom
      const currentTarget = queuedZoom?.target ?? activeZoom?.target ?? zoom
      const target = Math.min(ZOOM_MAX, Math.max(minimumZoom(), currentTarget * (e.deltaY > 0 ? 0.94 : 1.0638)))
      queuedZoom = {
        target,
        anchor: stableAnchor?.anchor ?? measuredAnchor,
        ratio: stableAnchor?.ratio ?? anchorRatio,
      }
      scheduleZoom()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // ── drag to pan (left button) → drives native scroll position ───────────────
  $effect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag
      const el = scrollerEl
      if (!d || !el) return
      markInteracting()
      el.scrollLeft = d.sl - (e.clientX - d.x)
      el.scrollTop = d.st - (e.clientY - d.y)
      syncAxis()
    }
    const onUp = () => {
      drag = null
      scrollerEl?.classList.remove('grab')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  })

  // ── native scroll → keep the left axis gutter in lock-step ──────────────────
  $effect(() => {
    const el = scrollerEl
    if (!el) return
    const onScroll = () => {
      markInteracting()
      syncAxis()
      // keep the axis time readout live as content scrolls under a still pointer
      scheduleAxisCursor()
      if (!applyingTimeAnchor && !applyingHorizontalAnchor) persistView()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  })

  // A native window can close before the scroll debounce fires. Capture and
  // synchronously flush the latest viewport while WebKit is still available.
  $effect(() => {
    const flushView = () => {
      if (!restoring) persistView()
      flushPersistedView()
    }
    window.addEventListener('pagehide', flushView)
    return () => window.removeEventListener('pagehide', flushView)
  })

  // cancel any pending axis-cursor frame on unmount
  $effect(() => () => {
    if (tipRaf != null) cancelAnimationFrame(tipRaf)
    if (zoomRaf != null) cancelAnimationFrame(zoomRaf)
    queuedZoom = null
    activeZoom = null
    zoomApplyVersion += 1
    anchorApplyVersion += 1
    horizontalApplyVersion += 1
    flushPersistedView()
  })

  // init scroll (workday near the bottom; centre the two top-priority swimlanes),
  // then re-apply any anchored scroll target after a geometry change + sync axis.
  // Reads the geometry-driving state so it re-runs after every relayout.
  $effect(() => {
    // track the geometry-changing deps explicitly
    void zoom
    void colw
    void fitMode
    void vpW
    void vpH
    void swimlanes
    void dayScales
    void resetNonce
    const geometryKey = verticalGeometryKey()
    const el = scrollerEl
    if (!el || !vpH || !vpW) return
    if (!inited) {
      inited = true
      fitMode = false
      const saved = readSavedBoardView(localStorage)
      // Commit a migrated v2/v3 value to v4 before deleting the old key. Without
      // this, merely opening and closing an untouched board loses its view.
      if (saved) {
        writeSavedView(saved)
        for (const key of PREVIOUS_BOARD_VIEW_KEYS) localStorage.removeItem(key)
      }
      let initialAnchor: { point: HourPoint; ratio: number }
      if (saved && Number.isFinite(saved.zoom) && Number.isFinite(saved.anchorMs)) {
        following = false
        // Do not clamp against the data-dependent minimum yet: the board first
        // mounts empty, then expands dates when its asynchronous data arrives.
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved.zoom))
        colw = Math.min(COLW_MAX, Math.max(COLW_MIN, saved.colw))
        fitMode = saved.fitMode
        stableHorizontalRatio = saved.horizontalRatio
        applyHorizontalAnchor(stableHorizontalRatio)
        initialAnchor = {
          point: epochToHourPoint(saved.anchorMs),
          ratio: Math.max(0, Math.min(1, saved.anchorRatio ?? 0.5)),
        }
      } else {
        zoom = 9 / PAGE_HRS
        stableHorizontalRatio = 0
        initialAnchor = { point: [0, 14], ratio: 0.5 }
        following = false
      }
      // Apply even when the saved zoom equals the initial state value; in that
      // case assigning zoom does not cause another reactive pass.
      applyTimeAnchor(initialAnchor)
      return
    }
    if (resetPending) resetPending = false
    if (horizontalGeometryKey() !== lastHorizontalGeometry) {
      // Reapply after data hydration, resize, Fit, or column-width changes. Do
      // not skip while an older correction is in flight: real swimlanes can
      // arrive during that frame, after the placeholder range was measured.
      // Versioning in applyHorizontalAnchor cancels the stale correction.
      applyHorizontalAnchor(stableHorizontalRatio)
    }
    if (pendingTimeAnchor) {
      const anchor = pendingTimeAnchor
      pendingTimeAnchor = null
      applyTimeAnchor(anchor)
    } else if (activeZoom) {
      // Pointer-anchored zoom owns its scroll correction.
    } else if (geometryKey !== lastVerticalGeometry && stableTimeAnchor) {
      // Preserve the same wall-clock centre while empty dates expand/collapse or
      // the viewport changes size. This is especially important when board data
      // arrives after the first paint.
      applyTimeAnchor(stableTimeAnchor)
    } else if (following) {
      // Pin NOW to the bottom edge, deferred a frame so the (possibly just
      // changed) world height is applied before we scroll. Re-runs on every
      // geometry change while following, which rides out the initial settle.
      frameNow()
    } else if (pendingScroll) {
      const t = pendingScroll
      if (t.top != null) el.scrollTop = t.top
      if (t.left != null) el.scrollLeft = t.left
      pendingScroll = null
      syncAxis()
    } else {
      lastVerticalGeometry = geometryKey
      syncAxis()
    }
  })

  // ── scroller pointer handlers ───────────────────────────────────────────────
  const onScrollerDown = (e: MouseEvent) => {
    if (e.button !== 0) return // left button only; right is the context menu
    const t = e.target as HTMLElement
    if (t.closest('.cap') || t.closest('.namelabel') || t.closest('.lane-tkt')) return
    const el = scrollerEl
    if (!el) return
    following = false // user is steering — stop auto-pinning NOW
    drag = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
    el.classList.add('grab')
  }
  const onScrollerMove = (e: MouseEvent) => {
    if (drag) {
      hideAxisCursor()
      return
    }
    tipEvt = { x: e.clientX, y: e.clientY }
    scheduleAxisCursor()
  }
  const onScrollerEnter = () => {
    rect = scrollerEl?.getBoundingClientRect() ?? null
  }
  const onScrollerLeave = () => hideAxisCursor()

  // ── right-click context menus ──────────────────────────────────────────────
  const swapLaneAction = (L: Swimlane): MenuItem => ({
    label: 'Swap Lanes',
    glyph: '⇄',
    children: Array.from({ length: 8 }, (_, i) => {
      const target = i + 1
      const occupant = board.find((lane) => lane.n === target && lane.sid)
      return {
        label: String(target),
        glyph: target === L.n ? '✓' : '',
        hint: target === L.n ? 'current' : occupant ? 'occupied' : 'empty',
        disabled: target === L.n,
        run: () => onSwapSwimlane(L, target),
      }
    }),
  })
  const laneActions = (L: Swimlane): MenuItem[] => [
    { label: 'Chat', glyph: '◌', run: () => onChatSwimlane(L) },
    { sep: true },
    { label: 'Rename…', glyph: '✎', run: () => onRenameSwimlane(L) },
    swapLaneAction(L),
    { sep: true },
    { label: 'Finish Swimlane', glyph: '✓', danger: true, run: () => onFinishSwimlane(L) },
  ]
  const emptyLaneActions = (L: Swimlane): MenuItem[] => [
    { label: 'Chat', glyph: '◌', run: () => onChatSwimlane(L) },
    { sep: true },
    { label: 'Rename…', glyph: '✎', run: () => onRenameSwimlane(L) },
    swapLaneAction(L),
    { sep: true },
    { label: 'Remove swimlane', glyph: '×', danger: true, run: () => onRemoveSwimlane(L) },
  ]
  const swimmerActions = (L: Swimlane, sm: Swimmer): MenuItem[] => [
    { label: 'Add entity…', glyph: '＋', run: () => onAddEntity(L, sm) },
    { label: 'Set wall…', glyph: '⚑', run: () => onSetWall(L, sm) },
  ]
  const swimlaneMenu = (e: MouseEvent, L: Swimlane) => {
    e.preventDefault()
    e.stopPropagation()
    const empty = isEmptySwimlane(L)
    const placeholder = !L.sid
    openSubmenu = null
    menu = {
      x: e.clientX,
      y: e.clientY,
      title: empty ? `Swimlane ${L.n} · empty` : `Swimlane ${L.n}`,
      // A placeholder is not a persisted Swimlane. A real lane with zero
      // Swimmers can instead be renamed or permanently removed.
      items: placeholder
        ? [{ label: `New Swimlane in slot ${L.n}`, glyph: '＋', run: () => onNewSwimlane(L.n) }]
        : empty
          ? emptyLaneActions(L)
          : laneActions(L),
    }
  }
  const swimmerMenu = (e: MouseEvent, sm: Swimmer, L: Swimlane) => {
    e.preventDefault()
    e.stopPropagation()
    openSubmenu = null
    // A swimmer column fills the Swimlane body, so a right-click here is also a
    // Swimlane context click. Keep swimmer-specific actions first, then expose
    // every lane action that used to live in the removed three-dots menu.
    menu = {
      x: e.clientX,
      y: e.clientY,
      title: `Swimlane ${L.n} · ${sm.nm}`,
      items: [
        ...swimmerActions(L, sm),
        { sep: true },
        ...laneActions(L),
      ],
    }
  }
  const closeMenu = () => {
    menu = null
    openSubmenu = null
  }
  const pickMenu = (item?: MenuItem) => {
    if (!item || item.disabled) return
    if (item.children) return
    closeMenu()
    item.run?.()
  }

  // ── control API for the Header (widen / narrow / Fit / reset) ───────────────
  onMount(() => {
    onReady({
      widen() {
        fitMode = false
        colw = Math.min(COLW_MAX, colw + COLW_STEP)
        persistViewAfterLayout()
      },
      narrow() {
        fitMode = false
        colw = Math.max(COLW_MIN, colw - COLW_STEP)
        persistViewAfterLayout()
      },
      isFit: () => fitMode,
      reset() {
        // Deterministic full-day view: today 08:00–20:00.
        fitMode = false
        colw = COLW_DEFAULT
        following = false
        zoom = 9 / PAGE_HRS
        pendingTimeAnchor = { point: [0, 14], ratio: 0.5 }
        clearSavedBoardView(localStorage)
        stableHorizontalRatio = 0
        applyHorizontalAnchor(0)
        pendingSavedView = null
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        resetPending = true
        resetNonce += 1
      },
      fit() {
        const next = !fitMode
        fitMode = next
        if (next) {
          const occ = board.filter((l) => !isEmptySwimlane(l))
          const totalCols = occ.reduce((s, L) => s + L.swimmers!.length, 0)
          const avail = vpW - PADX * 2 - LANEGAP * Math.max(0, occ.length - 1)
          colw = Math.max(46, Math.floor(avail / Math.max(1, totalCols)))
          stableHorizontalRatio = 0
          applyHorizontalAnchor(0)
        } else {
          colw = COLW_DEFAULT
        }
        persistViewAfterLayout()
      },
    })
  })

  // ── label anti-overlap solver (analytic column centres) ────────────────────
  const labelPos = $derived.by(() => {
    const result = new Map<string, number>()
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
    const hh = 12
    for (const lp of layout.pos) {
      if (isEmptySwimlane(lp.swimlane)) continue
      lp.swimlane.swimmers!.forEach((sm, i) => {
        const cx = lp.left + i * lp.cw + lp.cw / 2
        const sY = ybA(swimmerStart(sm))
        const planned = sY > nowY
        // No wall ⇒ the spine ends at NOW (or just above the startmark if planned).
        const dY = sm.due ? ybA(sm.due) : nowY
        const yHi = sm.due ? (planned ? dY : Math.min(nowY, dY)) : (planned ? sY + 14 : nowY)
        const w = Math.min(240, sm.nm.length * 6.6 + sm.src.length * 5 + 38)
        const lo = sY + 14
        const hi = Math.max(sY + 14, yHi - 12)
        const N = 9
        let best = lo
        let bestScore = Infinity
        let bestBox = { x0: cx - w / 2, x1: cx + w / 2, y0: lo - hh, y1: lo + hh }
        for (let k = 0; k < N; k++) {
          const cy = lo + ((hi - lo) * k) / (N - 1)
          const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - hh, y1: cy + hh }
          let ov = 0
          for (const p of placed) ov += overlapArea(box, p)
          const pull = (Math.abs(cy - (lo + hi) / 2) / Math.max(1, hi - lo)) * 22
          const score = ov * 1000 + pull
          if (score < bestScore) {
            bestScore = score
            best = cy
            bestBox = box
          }
        }
        placed.push(bestBox)
        result.set(sm.id, best)
      })
    }
    return result
  })

  // ── overlays: axis ticks, night gaps, hour grid ────────────────────────────
  const AXIS_TICKS = [
    [8, 'faint'],
    [9, ''],
    [12, ''],
    [15, ''],
    [18, ''],
    [20, 'faint'],
  ] as const

  const flagStyle = (t: Swimmer['type']) => {
    const wc = wallCol(t)
    return `background:color-mix(in oklch, ${wc} 30%, var(--arbol-color-surface));color:${wc}`
  }

  // headcell / lane flex string (shared by head row + lanes)
  const flexFor = (lp: SwimlanePos, empty: boolean) =>
    allEmpty ? '1 1 0' : empty ? '0 0 70px' : `${lp.nCols} 0 ${lp.nCols * colw}px`
</script>

<div class="pool">
  <div class="scroller axiscol">
    <div class="world" bind:this={axisWorldEl} style="height:{worldH}px;width:100%">
      {#each timelineDays as day, i (day.offset)}
        {#if showTimeLegend}
          {#each AXIS_TICKS as [hr, cls] (hr)}
            <div class="tick {cls}" style="bottom:{yb(day.offset, hr)}px">{clock(hr)}</div>
          {/each}
        {/if}
        <div class="daylabel" style="bottom:{yb(day.offset, PAGE0) + 6}px">
          {day.offset === 0 ? 'TODAY' : day.label.toUpperCase().slice(0, 3)}
        </div>
      {/each}
      <div class="tick now" style="bottom:{nowY}px">{clock(nowPoint[1])}</div>
    </div>
    <div
      class="temporal-context {temporalContext ?? ''}"
      class:visible={temporalContext !== null}
      aria-live="polite"
      aria-hidden={temporalContext === null}
    >
      {temporalContext === 'past' ? '← PAST' : temporalContext === 'future' ? 'FUTURE →' : ''}
    </div>
    <div class="axiscursor" bind:this={axisCurEl} style="display:none"></div>
  </div>

  <div
    class="scroller"
    bind:this={scrollerEl}
    role="application"
    onmousedown={onScrollerDown}
    onmousemove={onScrollerMove}
    onmouseenter={onScrollerEnter}
    onmouseleave={onScrollerLeave}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <div class="world" style="height:{worldH}px;width:{layout.worldW}px">
      <div class="timeline-boundary past-boundary">Timeline starts · {timelineDays[0].label}</div>
      <div class="timeline-boundary future-boundary">Timeline ends · {timelineDays.at(-1)!.label}</div>
      <div class="headrow">
        {#each layout.pos as lp (lp.swimlane.n)}
          {@const L = lp.swimlane}
          {@const empty = isEmptySwimlane(L)}
          <div
            class="headcell {empty ? 'empty' : ''}"
            style="flex:{flexFor(lp, empty)}"
            oncontextmenu={(e) => swimlaneMenu(e, L)}
            role="presentation"
          >
            <div class="lane-num">SWIMLANE {L.n}</div>
            {#if !empty}
              <button
                type="button"
                class="lane-tkt"
                title={`Open “${L.tkt}” →`}
                onclick={(e) => {
                  e.stopPropagation()
                  onOpenSwimlane(L)
                }}
              >
                {L.tkt}
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="nightgaps">
        {#each timelineDays.slice(0, -1) as day, i (day.offset)}
          <div class="nightgap" style="bottom:{yb(day.offset, PAGE1)}px;height:{GAP}px">
            <span>↑ {timelineDays[i + 1].label.split(' · ')[0]}</span>
          </div>
        {/each}
      </div>

      <div class="grid">
        {#each timelineDays as day (day.offset)}
          {#each Array.from({ length: PAGE_HRS + 1 }, (_, k) => PAGE0 + k) as hr (hr)}
            {@const work = hr === WORK[0] || hr === WORK[1]}
            <div class="gridline hour {work ? 'work' : ''}" style="bottom:{yb(day.offset, hr)}px"></div>
            {#if hr < PAGE1 && dayScales[dayIndex(day.offset)] === 1}
              <div class="gridline half" style="bottom:{yb(day.offset, hr + 0.5)}px"></div>
            {/if}
          {/each}
        {/each}
      </div>

      <div class="lanes">
        {#each layout.pos as lp (lp.swimlane.n)}
          {@const L = lp.swimlane}
          {@const empty = isEmptySwimlane(L)}
          {@const im = imp(L.n)}
          <div
            class="lane {empty ? 'empty' : ''}"
            style="flex:{flexFor(lp, empty)}"
            oncontextmenu={(e) => swimlaneMenu(e, L)}
            role="presentation"
          >
            <div class="track">
              {#if empty}
                <div class="col" style="background:color-mix(in oklch, var(--arbol-color-text-muted) 9%, transparent)">
                  <div class="empty-note {allEmpty ? 'wide' : ''}">no swimmers</div>
                </div>
              {:else}
                {#each L.swimmers! as sm, i (sm.id)}
                  {@const sY = ybA(swimmerStart(sm))}
                  <div
                    class="col"
                    style="background:{colBg(L.hue!, i, L.n)}"
                    oncontextmenu={(e) => swimmerMenu(e, sm, L)}
                    role="presentation"
                  >
                    {#if sm.due}
                      {@const dY = ybA(sm.due)}
                      {@const planned = sY > nowY}
                      {@const overdue = dY < nowY && !planned}
                      {@const wt = sm.type ?? 'estimated'}
                      {@const wc = wallCol(wt)}
                      {@const soft = softFill(wt, im)}
                      {@const left = abs(sm.due) - sim}
                      {#if planned}
                        <div class="seg future plan" style="bottom:{sY}px;height:{Math.max(0, dY - sY)}px;background:{soft}"></div>
                        <div class="startmark" style="bottom:{sY}px">▸ {clock(swimmerStart(sm)[1])}</div>
                      {:else}
                        {@const pastTop = Math.min(nowY, dY)}
                        <div class="seg past {sm.blocked ? 'blocked' : ''}" style="bottom:{sY}px;height:{Math.max(0, pastTop - sY)}px"></div>
                        {#if !overdue}
                          <div class="seg future" style="bottom:{nowY}px;height:{Math.max(0, dY - nowY)}px;background:{soft}"></div>
                        {:else}
                          <div class="seg over" style="bottom:{dY}px;height:{Math.max(0, nowY - dY)}px"></div>
                        {/if}
                      {/if}
                      <div class="wall" style="bottom:{dY}px;border-color:{wc}">
                        <span class="flag" style={flagStyle(wt)}>
                          {WICON[wt] || '⚑'} {clock(sm.due[1])}
                        </span>
                      </div>
                      <div class="timer {left < 0 ? 'over' : ''}" data-due={abs(sm.due)} style="bottom:{dY}px;color:{wc}">
                        {fmtLeft(left)}
                      </div>
                      {#if !planned}
                        {@const el = dY > sY ? Math.round(((nowY - sY) / (dY - sY)) * 100) : 100}
                        <div class="cap {overdue ? 'over' : ''}" style="bottom:{nowY}px">
                          {overdue ? 'OVER' : el + '%'}
                        </div>
                      {/if}
                    {:else}
                      <!-- No wall set yet: just the spine from start → NOW + a start
                           mark. No wall flag / timer / completion cap / projection. -->
                      {#if sY <= nowY}
                        <div class="seg past {sm.blocked ? 'blocked' : ''}" style="bottom:{sY}px;height:{Math.max(0, nowY - sY)}px"></div>
                      {/if}
                      <div class="startmark" style="bottom:{sY}px">▸ {clock(swimmerStart(sm)[1])}</div>
                    {/if}
                    <div class="namelabel" style="bottom:{labelPos.get(sm.id) ?? sY + 14}px">
                      <span class="nm-t">{sm.nm}</span>
                      <span class="src">{sm.src}</span>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Repeating, low-contrast temporal watermarks keep orientation visible
           anywhere in the viewport, including when NOW and the axis cue are far
           away. They sit above lane tints but below the NOW rule and labels. -->
      <div class="temporal-field past-field" style="height:{Math.max(0, nowY)}px" aria-hidden="true"></div>
      <div
        class="temporal-field future-field"
        style="bottom:{Math.max(0, nowY)}px;height:{Math.max(0, worldH - nowY)}px"
        aria-hidden="true"
      ></div>
      <div class="nowline" style="bottom:{nowY}px"></div>
    </div>
  </div>

  {#if menu}
    <button
      type="button"
      aria-label="Close menu"
      style="position:fixed;inset:0;z-index:299;background:transparent;border:0;padding:0;cursor:default"
      onclick={closeMenu}
      oncontextmenu={(e) => {
        e.preventDefault()
        closeMenu()
      }}
    ></button>
    <div class="dpop" style="left:{menu.x}px;top:{menu.y}px" role="menu" tabindex="-1">
      <div class="dpop-title">{menu.title}</div>
      {#each menu.items as item, i (i)}
        {#if item.sep}
          <div class="dpop-sep"></div>
        {:else}
          <div
            class="dpop-item"
            onmouseenter={() => (openSubmenu = item.children ? i : null)}
            onmouseleave={() => { if (item.children && openSubmenu === i) openSubmenu = null }}
            role="presentation"
          >
            <button
              type="button"
              class="dpop-btn"
              role="menuitem"
              class:disabled={item.disabled}
              disabled={item.disabled}
              style={item.danger ? 'color:var(--arbol-color-err)' : ''}
              aria-haspopup={item.children ? 'menu' : undefined}
              aria-expanded={item.children ? openSubmenu === i : undefined}
              onclick={() => item.children ? (openSubmenu = openSubmenu === i ? null : i) : pickMenu(item)}
            >
              <span class="dpop-glyph">{item.glyph ?? ''}</span>
              <span>{item.label}</span>
              {#if item.hint}<span class="dpop-hint">{item.hint}</span>{/if}
              {#if item.children}<span class="dpop-arrow">›</span>{/if}
            </button>
            {#if item.children && openSubmenu === i}
              <div class="dpop dpop-submenu" role="menu" aria-label={`${item.label} targets`}>
                {#each item.children as child, childIndex (childIndex)}
                  <button
                    type="button"
                    class="dpop-btn"
                    role="menuitem"
                    class:disabled={child.disabled}
                    disabled={child.disabled}
                    onclick={() => pickMenu(child)}
                  >
                    <span class="dpop-glyph">{child.glyph ?? ''}</span>
                    <span>{child.label}</span>
                    {#if child.hint}<span class="dpop-hint">{child.hint}</span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
