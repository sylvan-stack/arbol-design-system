/* Shared time vocabulary used by the standard New Graft popup. */

export const PAGE0 = 8
export const PAGE1 = 20
export const WORK: [number, number] = [9, 18]

/** Add working time (09:00–18:00, Monday–Friday) to an epoch-ms instant. */
export function addWorkingTime(startMs: number, days: number, minutes: number): number {
  const [workStart, workEnd] = WORK
  const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6
  const date = new Date(startMs)
  date.setSeconds(0, 0)
  for (let guard = 0; guard < 31; guard++) {
    if (isWeekend(date)) {
      date.setDate(date.getDate() + 1)
      date.setHours(workStart, 0, 0, 0)
      continue
    }
    const hour = date.getHours() + date.getMinutes() / 60
    if (hour < workStart) {
      date.setHours(workStart, 0, 0, 0)
      break
    }
    if (hour >= workEnd) {
      date.setDate(date.getDate() + 1)
      date.setHours(workStart, 0, 0, 0)
      continue
    }
    break
  }
  for (let index = 0; index < days; index++) {
    do { date.setDate(date.getDate() + 1) } while (isWeekend(date))
  }
  let remaining = minutes
  while (remaining > 0) {
    const leftToday = (workEnd - date.getHours()) * 60 - date.getMinutes()
    if (remaining <= leftToday) {
      date.setMinutes(date.getMinutes() + remaining)
      remaining = 0
    } else {
      remaining -= leftToday
      do { date.setDate(date.getDate() + 1) } while (isWeekend(date))
      date.setHours(workStart, 0, 0, 0)
    }
  }
  return date.getTime()
}

export const WICON = { estimated: '≈', due: '⚑', deadline: '⛔' } as const
export type WallType = keyof typeof WICON
