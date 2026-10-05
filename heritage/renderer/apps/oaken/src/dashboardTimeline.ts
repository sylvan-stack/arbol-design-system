import type { Swimlane, Swimmer } from './data'

export const DASHBOARD_TIMELINE_VERSION = 1 as const
export const DASHBOARD_MAX_TASKS = 500
export const DASHBOARD_MAX_NAME_BYTES = 200
export const DASHBOARD_MAX_SNAPSHOT_BYTES = 256 * 1024
export const DASHBOARD_MAX_EPOCH_MS = Date.UTC(3000, 0, 1, 0, 0, 0, 0)

const UUID_SWIMMER_ID = /^sw-([0-9a-f]{32})$/i
const UUID_V8_NAMESPACE = 'arbol-oaken-swimmer-v1'
const encoder = new TextEncoder()
const DASH = ' — '
const ELLIPSIS = '…'

export type DashboardUrgency = 'low' | 'normal' | 'high' | 'critical'
export type DashboardShape = 'circle' | 'square' | 'diamond' | 'triangle'

export type DashboardTimelineTask = {
  id: string
  n: string
  s: number
  e?: number
  u: DashboardUrgency
  c?: [number, number, number]
  h?: DashboardShape
}

export type DashboardTimelineSnapshot = {
  v: typeof DASHBOARD_TIMELINE_VERSION
  tasks: DashboardTimelineTask[]
}

export type CompactDashboardTimeline = {
  snapshot: DashboardTimelineSnapshot
  json: string
  byteCount: number
  taskCount: number
}

export class DashboardTimelineError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DashboardTimelineError'
  }
}

const utf8Length = (value: string): number => encoder.encode(value).byteLength

function normalizedTitle(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ')
}

function comparableTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US')
}

/** Shorten at Unicode scalar boundaries and reserve room for an ellipsis. */
export function shortenUTF8(value: string, maximumBytes = DASHBOARD_MAX_NAME_BYTES): string {
  const clean = normalizedTitle(value)
  if (utf8Length(clean) <= maximumBytes) return clean
  const ellipsisBytes = utf8Length(ELLIPSIS)
  if (maximumBytes < ellipsisBytes) return ''
  const budget = maximumBytes - ellipsisBytes
  let used = 0
  let shortened = ''
  for (const scalar of clean) {
    const bytes = utf8Length(scalar)
    if (used + bytes > budget) break
    shortened += scalar
    used += bytes
  }
  return shortened.trimEnd() + ELLIPSIS
}

function dashboardName(lane: Swimlane, swimmer: Swimmer): string {
  const swimmerTitle = normalizedTitle(swimmer.nm)
  if (!swimmerTitle) throw new DashboardTimelineError('invalid_name')

  const laneTitle = normalizedTitle(lane.tkt)
  const hasContext = (lane.swimmers?.length ?? 0) > 1
    && !!laneTitle
    && comparableTitle(laneTitle) !== comparableTitle(swimmerTitle)
  if (!hasContext) return shortenUTF8(swimmerTitle)

  const full = `${laneTitle}${DASH}${swimmerTitle}`
  if (utf8Length(full) <= DASHBOARD_MAX_NAME_BYTES) return full

  // Preserve the task title whenever possible; compact the lane context first.
  const safeSwimmer = shortenUTF8(swimmerTitle)
  if (utf8Length(safeSwimmer) >= DASHBOARD_MAX_NAME_BYTES) return safeSwimmer
  const contextBudget = DASHBOARD_MAX_NAME_BYTES - utf8Length(DASH) - utf8Length(safeSwimmer)
  if (contextBudget < utf8Length(ELLIPSIS) + 1) return safeSwimmer
  const compactLane = shortenUTF8(laneTitle, contextBudget)
  return compactLane ? `${compactLane}${DASH}${safeSwimmer}` : safeSwimmer
}

function canonicalUUID(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function dashboardTaskID(swimmerID: string): Promise<string> {
  const direct = UUID_SWIMMER_ID.exec(swimmerID)
  if (direct) {
    const hex = direct[1]
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase()
  }

  const prefix = encoder.encode(UUID_V8_NAMESPACE)
  const source = encoder.encode(swimmerID)
  const input = new Uint8Array(prefix.length + 1 + source.length)
  input.set(prefix)
  input[prefix.length] = 0
  input.set(source, prefix.length + 1)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new DashboardTimelineError('sha256_unavailable')
  const digest = new Uint8Array(await subtle.digest('SHA-256', input))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return canonicalUUID(bytes)
}

function validEpochMilliseconds(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= DASHBOARD_MAX_EPOCH_MS
}

function urgency(swimmer: Swimmer): DashboardUrgency {
  if (swimmer.blocked) return 'critical'
  if (swimmer.type === 'deadline') return 'critical'
  if (swimmer.type === 'due') return 'high'
  if (swimmer.type === 'estimated') return 'low'
  return 'normal'
}

function shape(swimmer: Swimmer): DashboardShape | undefined {
  if (swimmer.blocked) return 'triangle'
  if (swimmer.type === 'deadline') return 'diamond'
  if (swimmer.type === 'due') return 'square'
  if (swimmer.type === 'estimated') return 'circle'
  return undefined
}

/** Deterministic HSL(0.62, 0.55) conversion for one Swimlane hue. */
export function dashboardRGB(hue: number): [number, number, number] | undefined {
  if (!Number.isFinite(hue)) return undefined
  const h = ((hue % 360) + 360) % 360
  const saturation = 0.62
  const lightness = 0.55
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - chroma / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [chroma, x, 0]
  else if (h < 120) rgb = [x, chroma, 0]
  else if (h < 180) rgb = [0, chroma, x]
  else if (h < 240) rgb = [0, x, chroma]
  else if (h < 300) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]
  return rgb.map((component) => Math.round((component + m) * 255)) as [number, number, number]
}

function validateTask(task: DashboardTimelineTask): void {
  if (!task.id || !task.n || task.n !== task.n.trim() || utf8Length(task.n) > DASHBOARD_MAX_NAME_BYTES) {
    throw new DashboardTimelineError('invalid_name')
  }
  if (!validEpochMilliseconds(task.s)) throw new DashboardTimelineError('invalid_start_date')
  if (task.e !== undefined) {
    if (!validEpochMilliseconds(task.e)) throw new DashboardTimelineError('invalid_end_date')
    if (task.e < task.s) throw new DashboardTimelineError('end_before_start')
  }
  if (task.c !== undefined && (task.c.length !== 3 || task.c.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255))) {
    throw new DashboardTimelineError('invalid_color')
  }
}

export function validateCompactDashboardTimelineJSON(json: string): number {
  const byteCount = utf8Length(json)
  if (byteCount > DASHBOARD_MAX_SNAPSHOT_BYTES) throw new DashboardTimelineError('snapshot_too_large')
  return byteCount
}

export async function translateSwimlanesToDashboardTimeline(
  swimlanes: readonly Swimlane[],
): Promise<CompactDashboardTimeline> {
  const rows: Array<{ lane: Swimlane; swimmer: Swimmer; id: string }> = []
  for (const lane of swimlanes) {
    if (lane.empty || !lane.swimmers?.length) continue
    for (const swimmer of lane.swimmers) {
      rows.push({ lane, swimmer, id: await dashboardTaskID(swimmer.id) })
    }
  }
  if (rows.length > DASHBOARD_MAX_TASKS) throw new DashboardTimelineError('too_many_tasks')

  rows.sort((a, b) => a.lane.n - b.lane.n
    || a.swimmer.startMs - b.swimmer.startMs
    || a.id.localeCompare(b.id, 'en-US'))

  const seen = new Set<string>()
  const tasks = rows.map(({ lane, swimmer, id }): DashboardTimelineTask => {
    if (seen.has(id)) throw new DashboardTimelineError('duplicate_id')
    seen.add(id)
    if (!validEpochMilliseconds(swimmer.startMs)) throw new DashboardTimelineError('invalid_start_date')
    const due = swimmer.dueMs
    if (due != null && !validEpochMilliseconds(due)) throw new DashboardTimelineError('invalid_end_date')
    if (due != null && due < swimmer.startMs) throw new DashboardTimelineError('end_before_start')

    const task: DashboardTimelineTask = {
      id,
      n: dashboardName(lane, swimmer),
      s: swimmer.startMs,
      ...(due != null ? { e: due } : {}),
      u: urgency(swimmer),
      ...(dashboardRGB(lane.hue as number) ? { c: dashboardRGB(lane.hue as number)! } : {}),
      ...(shape(swimmer) ? { h: shape(swimmer)! } : {}),
    }
    validateTask(task)
    return task
  })

  const snapshot: DashboardTimelineSnapshot = { v: DASHBOARD_TIMELINE_VERSION, tasks }
  const json = JSON.stringify(snapshot)
  const byteCount = validateCompactDashboardTimelineJSON(json)
  return { snapshot, json, byteCount, taskCount: tasks.length }
}
