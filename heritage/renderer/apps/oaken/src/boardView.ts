export const BOARD_VIEW_KEY = 'oaken-board-view:v4'
export const PREVIOUS_BOARD_VIEW_KEYS = [
  'oaken-board-view:v3',
  'oaken-board-view:v2',
  'oaken-pool-view:v2',
] as const

export type SavedBoardView = {
  zoom: number
  anchorMs: number
  anchorRatio: number
  horizontalRatio: number
  colw: number
  fitMode: boolean
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function decodeSavedBoardView(value: unknown): SavedBoardView | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!finite(raw.zoom) || !finite(raw.anchorMs)) return null
  return {
    zoom: raw.zoom,
    anchorMs: raw.anchorMs,
    anchorRatio: finite(raw.anchorRatio) ? clamp01(raw.anchorRatio) : 0.5,
    // v3 and older did not remember the horizontal viewport or column controls.
    horizontalRatio: finite(raw.horizontalRatio) ? clamp01(raw.horizontalRatio) : 0,
    colw: finite(raw.colw) ? raw.colw : 150,
    fitMode: typeof raw.fitMode === 'boolean' ? raw.fitMode : false,
  }
}

export function readSavedBoardView(storage: Storage): SavedBoardView | null {
  for (const key of [BOARD_VIEW_KEY, ...PREVIOUS_BOARD_VIEW_KEYS]) {
    try {
      const stored = storage.getItem(key)
      if (!stored) continue
      const decoded = decodeSavedBoardView(JSON.parse(stored))
      if (decoded) return decoded
    } catch {
      // Ignore malformed entries and continue through the migration keys.
    }
  }
  return null
}

export function writeSavedBoardView(storage: Storage, view: SavedBoardView): void {
  try {
    storage.setItem(BOARD_VIEW_KEY, JSON.stringify(view))
  } catch {
    // Storage can be disabled or full; the board remains usable without it.
  }
}

export function clearSavedBoardView(storage: Storage): void {
  try {
    storage.removeItem(BOARD_VIEW_KEY)
    for (const key of PREVIOUS_BOARD_VIEW_KEYS) storage.removeItem(key)
  } catch {
    // Storage can be unavailable in embedded/locked-down WebKit contexts.
  }
}

/** Position within the actually scrollable horizontal range. Unlike raw pixels,
 * this survives window resizing and the empty-first/data-second board mount. */
export function horizontalScrollRatio(scrollLeft: number, scrollWidth: number, clientWidth: number): number {
  const range = Math.max(0, scrollWidth - clientWidth)
  return range > 0 ? clamp01(scrollLeft / range) : 0
}

export function horizontalScrollLeft(ratio: number, scrollWidth: number, clientWidth: number): number {
  return clamp01(ratio) * Math.max(0, scrollWidth - clientWidth)
}
