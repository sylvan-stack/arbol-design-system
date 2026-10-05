/* Oaken time model + swimmer-wall palette (shared by the Swimlanes board and Swimlane
 * Details). A working-hours vertical axis, paged by day. Ported from the
 * prototype's data.jsx — this is the geometry the two pages share. */

export const PAGE0 = 8 // each day-page shows 08:00 …
export const PAGE1 = 20 //                       … 20:00
export const PAGE_HRS = PAGE1 - PAGE0
export const WORK: [number, number] = [9, 18] // workday band (frames initial scroll)
export const GAP = 30 // px hatched night-gap between day-pages

/* Real wall clock — no fixed/seeded time. Day 0 is today; the board pages
 * DAY_COUNT working days forward (each shown PAGE0–PAGE1). Day labels, the NOW
 * reference line, and simHours() are all derived from the actual date. */
const DAY_COUNT = 3
const todayMidnight = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()
const MIDNIGHT_MS = todayMidnight.getTime()

export type TimelineDay = { offset: number; label: string }

/* Build the board's bounded calendar range. Calendar-month arithmetic is clamped
 * at the target month's final day (31 March - 1 month => 28/29 February). */
function shiftedMonth(date: Date, delta: number): Date {
  const result = new Date(date)
  const wanted = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + delta)
  const last = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(wanted, last))
  return result
}

export function buildTimelineDays(anchorMs = Date.now()): TimelineDay[] {
  const today = new Date(anchorMs)
  today.setHours(0, 0, 0, 0)
  const start = shiftedMonth(today, -1)
  const end = shiftedMonth(today, 1)
  const result: TimelineDay[] = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // Weekends are deliberately absent from the board: Friday and Monday are
    // adjacent pages, separated by the same compact off-hours gap.
    if (d.getDay() === 0 || d.getDay() === 6) continue
    // Rounding keeps the calendar offset stable across DST's 23/25-hour days.
    const offset = Math.round((d.getTime() - today.getTime()) / 86400000)
    result.push({ offset, label: dayLabelFor(d, offset) })
  }
  return result
}

function dayLabelFor(d: Date, offset: number): string {
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' })
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  return (offset === 0 ? 'Today · ' : '') + `${wd} ${mon} ${d.getDate()}`
}

function dayLabel(offset: number): string {
  const d = new Date(todayMidnight)
  d.setDate(d.getDate() + offset)
  return dayLabelFor(d, offset)
}
export const DAYS = Array.from({ length: DAY_COUNT }, (_, i) => dayLabel(i))

export type HourPoint = [number, number] // [dayIndex, hourOfDay]
export type TemporalContext = 'past' | 'future' | null

/** A stable location in the rendered timeline geometry. Unlike an HourPoint,
 * this can represent a position inside the fixed-height gap between workdays.
 * That matters while zooming: day pages scale, but gaps do not. */
export type TimelineGeometryAnchor = {
  segment: 'day' | 'gap'
  index: number
  ratio: number
}

/** Convert a bottom-origin world Y coordinate into a zoom-independent anchor. */
export function timelineGeometryAnchor(
  y: number,
  dayBottoms: readonly number[],
  dayHeights: readonly number[],
): TimelineGeometryAnchor {
  if (!dayBottoms.length || dayBottoms.length !== dayHeights.length) {
    return { segment: 'day', index: 0, ratio: 0 }
  }
  const last = dayBottoms.length - 1
  const worldHeight = dayBottoms[last] + dayHeights[last]
  const clamped = Math.max(dayBottoms[0], Math.min(worldHeight, y))
  for (let i = 0; i <= last; i++) {
    const bottom = dayBottoms[i]
    const height = Math.max(0, dayHeights[i])
    const top = bottom + height
    if (clamped <= top || i === last) {
      return { segment: 'day', index: i, ratio: height ? Math.max(0, Math.min(1, (clamped - bottom) / height)) : 0 }
    }
    const nextBottom = dayBottoms[i + 1]
    if (clamped < nextBottom) {
      return {
        segment: 'gap',
        index: i,
        ratio: Math.max(0, Math.min(1, (clamped - top) / Math.max(1, nextBottom - top))),
      }
    }
  }
  return { segment: 'day', index: last, ratio: 1 }
}

/** Resolve a stable timeline anchor against new (for example, zoomed) geometry. */
export function timelineGeometryY(
  anchor: TimelineGeometryAnchor,
  dayBottoms: readonly number[],
  dayHeights: readonly number[],
): number {
  if (!dayBottoms.length || dayBottoms.length !== dayHeights.length) return 0
  const index = Math.max(0, Math.min(dayBottoms.length - 1, anchor.index))
  const ratio = Math.max(0, Math.min(1, anchor.ratio))
  const bottom = dayBottoms[index]
  const top = bottom + Math.max(0, dayHeights[index])
  if (anchor.segment === 'gap' && index + 1 < dayBottoms.length) {
    return top + (dayBottoms[index + 1] - top) * ratio
  }
  return bottom + Math.max(0, dayHeights[index]) * ratio
}

/** Identify the viewport's relationship to NOW. Coordinates are measured from
 * the top of the scrollable world; touching/containing the NOW rule is neutral. */
export function viewportTemporalContext(nowTop: number, viewportTop: number, viewportHeight: number): TemporalContext {
  if (nowTop < viewportTop) return 'past'
  if (nowTop > viewportTop + viewportHeight) return 'future'
  return null
}

/* Project a wall-clock epoch (ms) onto the day-paged axis: day 0 = today.
 * Core stores swimlane/entity times as epoch-ms; the renderer owns this axis. */
export function epochToHourPoint(ms: number): HourPoint {
  const h = (ms - MIDNIGHT_MS) / 3600000
  const day = Math.floor(h / 24)
  return [day, h - day * 24]
}

export function hourPointToEpoch(point: HourPoint): number {
  const d = new Date(todayMidnight)
  d.setDate(d.getDate() + point[0])
  d.setHours(0, 0, 0, 0)
  return d.getTime() + point[1] * 3600000
}

/* Add WORKING time to a start instant: working hours are WORK[0]–WORK[1]
 * (09:00–18:00), weekends (Sat/Sun) excluded. `days` are whole working days
 * (same time-of-day, skipping weekends); `minutes` then flow across the working
 * window (consume to close, continue at the next working day's open). The start
 * is first snapped into the window (before open ⇒ open; at/after close or on a
 * weekend ⇒ next working day's open). Used for the Set-wall Duration/Time-slot
 * spans — e.g. +2h at 17:30 ⇒ 10:30 the next working day. */
export function addWorkingTime(startMs: number, days: number, minutes: number): number {
  const WS = WORK[0]
  const WE = WORK[1]
  const isWeekend = (dt: Date) => dt.getDay() === 0 || dt.getDay() === 6
  const d = new Date(startMs)
  d.setSeconds(0, 0)
  for (let g = 0; g < 31; g++) {
    if (isWeekend(d)) { d.setDate(d.getDate() + 1); d.setHours(WS, 0, 0, 0); continue }
    const hf = d.getHours() + d.getMinutes() / 60
    if (hf < WS) { d.setHours(WS, 0, 0, 0); break }
    if (hf >= WE) { d.setDate(d.getDate() + 1); d.setHours(WS, 0, 0, 0); continue }
    break
  }
  for (let i = 0; i < days; i++) {
    do { d.setDate(d.getDate() + 1) } while (isWeekend(d))
  }
  let rem = minutes
  while (rem > 0) {
    const leftToday = (WE - d.getHours()) * 60 - d.getMinutes()
    if (rem <= leftToday) { d.setMinutes(d.getMinutes() + rem); rem = 0 }
    else { rem -= leftToday; do { d.setDate(d.getDate() + 1) } while (isWeekend(d)); d.setHours(WS, 0, 0, 0) }
  }
  return d.getTime()
}

export const abs = (a: HourPoint) => a[0] * 24 + a[1] // [day,hour] → absolute hours
export const clock = (h: number) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`

/* Swimmer WALL types — pastel fill for the remaining part; the wall line a touch
 * more saturated. Three types, shared so the two pages match. */
export const WALL = {
  estimated: 'oklch(0.60 0.125 150)',
  due: 'oklch(0.74 0.135 64)',
  deadline: 'oklch(0.62 0.165 25)',
} as const
export const FILL = {
  estimated: 'oklch(0.80 0.075 150)',
  due: 'oklch(0.80 0.072 66)',
  deadline: 'oklch(0.76 0.085 24)',
} as const
export const WICON = { estimated: '≈', due: '⚑', deadline: '⛔' } as const
export type WallType = keyof typeof WALL

export const wallCol = (t: WallType) => WALL[t] || WALL.due
export const baseFill = (t: WallType) => FILL[t] || FILL.due

/* live countdown formatting: `2d 4h`, `3h 12m`, `12:34`, or `+1:02` when overdue */
export function fmtLeft(hoursLeft: number): string {
  const over = hoursLeft < 0
  const s = Math.floor(Math.abs(hoursLeft) * 3600)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  let t: string
  if (!over && Math.abs(hoursLeft) * 60 > 30) {
    t = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  } else {
    t =
      h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`
  }
  return (over ? '+' : '') + t
}

/* The live clock — real elapsed time as absolute hours since today's midnight, so
 * countdowns tick and live session bars grow each second. */
export const simHours = (nowMs = Date.now()) => (nowMs - MIDNIGHT_MS) / 3600000

/* A swimmer is overdue when its wall is below NOW and it has already started. */
export function isOverdue(sm: { start: HourPoint; due?: HourPoint }): boolean {
  if (!sm.due) return false // no wall set ⇒ never overdue
  const now = simHours()
  return abs(sm.due) < now && !(abs(sm.start) > now)
}
