export const TIME_OFFSETS_MINUTES = [30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720, 960, 1200, 1440] as const

export function roundToFiveMinutes(value: Date): Date {
  const result = new Date(value)
  result.setSeconds(0, 0)
  result.setMinutes(Math.round(result.getMinutes() / 5) * 5)
  return result
}

export function startOfWeek(value: Date): Date {
  const result = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const mondayOffset = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - mondayOffset)
  return result
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

export function sameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

export function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3])
  const candidate = new Date(year, month, day)
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) return null
  return { year, month, day }
}

export function parseTimeInput(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1]); const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

export function formatOffset(minutes: number): string {
  if (minutes < 60) return `+${minutes}min`
  const hours = minutes / 60
  return `+${Number.isInteger(hours) ? hours : String(hours).replace('.', ',')}h`
}
