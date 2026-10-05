import { describe, expect, it } from 'vitest'
import {
  BOARD_VIEW_KEY,
  PREVIOUS_BOARD_VIEW_KEYS,
  clearSavedBoardView,
  horizontalScrollLeft,
  horizontalScrollRatio,
  readSavedBoardView,
  writeSavedBoardView,
  type SavedBoardView,
} from '../src/boardView'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const view: SavedBoardView = {
  zoom: 1.4,
  anchorMs: 1_786_200_000_000,
  anchorRatio: 0.5,
  horizontalRatio: 0.72,
  colw: 194,
  fitMode: false,
}

describe('Swimlanes board view persistence', () => {
  it('round-trips the complete vertical and horizontal view', () => {
    const storage = new MemoryStorage() as unknown as Storage
    writeSavedBoardView(storage, view)

    expect(readSavedBoardView(storage)).toEqual(view)
  })

  it('migrates a vertical-only v3 view with safe horizontal defaults', () => {
    const storage = new MemoryStorage() as unknown as Storage
    storage.setItem(PREVIOUS_BOARD_VIEW_KEYS[0], JSON.stringify({
      zoom: 0.9,
      anchorMs: 1_786_200_000_000,
      anchorRatio: 0.4,
    }))

    expect(readSavedBoardView(storage)).toEqual({
      zoom: 0.9,
      anchorMs: 1_786_200_000_000,
      anchorRatio: 0.4,
      horizontalRatio: 0,
      colw: 150,
      fitMode: false,
    })
  })

  it('ignores a malformed current value and continues to a valid previous value', () => {
    const storage = new MemoryStorage() as unknown as Storage
    storage.setItem(BOARD_VIEW_KEY, '{broken')
    storage.setItem(PREVIOUS_BOARD_VIEW_KEYS[0], JSON.stringify({ zoom: 1, anchorMs: 100 }))

    expect(readSavedBoardView(storage)?.anchorMs).toBe(100)
  })

  it('clears current and legacy views for Reset view', () => {
    const storage = new MemoryStorage() as unknown as Storage
    storage.setItem(BOARD_VIEW_KEY, JSON.stringify(view))
    for (const key of PREVIOUS_BOARD_VIEW_KEYS) storage.setItem(key, '{}')

    clearSavedBoardView(storage)

    expect(readSavedBoardView(storage)).toBeNull()
  })

  it('restores the same relative horizontal position after the viewport changes', () => {
    const ratio = horizontalScrollRatio(900, 2_000, 800)
    expect(ratio).toBe(0.75)
    expect(horizontalScrollLeft(ratio, 2_400, 1_000)).toBe(1_050)
  })

  it('clamps horizontal positions and handles a board with no overflow', () => {
    expect(horizontalScrollRatio(50, 500, 800)).toBe(0)
    expect(horizontalScrollLeft(2, 2_000, 800)).toBe(1_200)
    expect(horizontalScrollLeft(-1, 2_000, 800)).toBe(0)
  })
})
