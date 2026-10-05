import type { Swimmer } from './data'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Compact, stable duration copy for an always-visible surface. Deliberately
 * rounds down so "left" never promises more time than remains. */
export function formatCompactDuration(durationMs: number): string {
  const ms = Math.max(0, durationMs)
  if (ms < MINUTE_MS) return '<1m'
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS)
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  return hours ? `${days}d ${hours}h` : `${days}d`
}

export type CompactSwimmerProgress = {
  elapsedMs: number
  elapsedLabel: string
  hasEnd: boolean
  percent: number
  remainingLabel?: string
  overdue: boolean
  planned: boolean
}

/** Project persisted swimmer timestamps into the horizontal compact-panel meter.
 * Progress is clamped for rendering, while the labels retain overdue duration. */
export function compactSwimmerProgress(
  swimmer: Pick<Swimmer, 'startMs' | 'dueMs'>,
  nowMs = Date.now(),
): CompactSwimmerProgress {
  const startMs = Number.isFinite(swimmer.startMs) ? swimmer.startMs : nowMs
  const dueMs = swimmer.dueMs == null || !Number.isFinite(swimmer.dueMs)
    ? null
    : swimmer.dueMs
  const planned = nowMs < startMs
  const elapsedMs = Math.max(0, nowMs - startMs)

  if (dueMs == null) {
    return {
      elapsedMs,
      elapsedLabel: `${formatCompactDuration(elapsedMs)} elapsed`,
      hasEnd: false,
      percent: 0,
      overdue: false,
      planned,
    }
  }

  const totalMs = Math.max(0, dueMs - startMs)
  const overdue = nowMs > dueMs
  const percent = totalMs > 0
    ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))
    : (nowMs >= dueMs ? 100 : 0)

  return {
    elapsedMs,
    elapsedLabel: `${formatCompactDuration(elapsedMs)} elapsed`,
    hasEnd: true,
    percent,
    remainingLabel: overdue
      ? `${formatCompactDuration(nowMs - dueMs)} overdue`
      : `${formatCompactDuration(dueMs - nowMs)} left`,
    overdue,
    planned,
  }
}
