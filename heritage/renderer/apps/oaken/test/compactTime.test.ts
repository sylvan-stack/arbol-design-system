import { describe, expect, it } from 'vitest'
import { compactSwimmerProgress, formatCompactDuration } from '../src/compactTime'

describe('Oaken compact Swimlanes time projection', () => {
  it('formats compact durations without overstating time remaining', () => {
    expect(formatCompactDuration(12_000)).toBe('<1m')
    expect(formatCompactDuration(59 * 60_000)).toBe('59m')
    expect(formatCompactDuration((2 * 60 + 7) * 60_000)).toBe('2h 7m')
    expect(formatCompactDuration((3 * 24 + 5) * 60 * 60_000)).toBe('3d 5h')
  })

  it('shows elapsed time only when no estimated end exists', () => {
    const state = compactSwimmerProgress({ startMs: 1_000, dueMs: null }, 3_601_000)
    expect(state).toMatchObject({
      hasEnd: false,
      elapsedLabel: '1h elapsed',
      percent: 0,
      overdue: false,
    })
    expect(state.remainingLabel).toBeUndefined()
  })

  it('projects elapsed and remaining time onto a horizontal percentage', () => {
    const state = compactSwimmerProgress({ startMs: 0, dueMs: 4 * 60 * 60_000 }, 90 * 60_000)
    expect(state.elapsedLabel).toBe('1h 30m elapsed')
    expect(state.remainingLabel).toBe('2h 30m left')
    expect(state.percent).toBe(37.5)
    expect(state.overdue).toBe(false)
  })

  it('clamps an overdue bar while retaining overdue duration', () => {
    const state = compactSwimmerProgress({ startMs: 0, dueMs: 60 * 60_000 }, 90 * 60_000)
    expect(state.percent).toBe(100)
    expect(state.remainingLabel).toBe('30m overdue')
    expect(state.overdue).toBe(true)
  })

  it('does not count elapsed time before a planned swimmer starts', () => {
    const state = compactSwimmerProgress({ startMs: 10_000, dueMs: 20_000 }, 5_000)
    expect(state.elapsedLabel).toBe('<1m elapsed')
    expect(state.percent).toBe(0)
    expect(state.planned).toBe(true)
  })
})
