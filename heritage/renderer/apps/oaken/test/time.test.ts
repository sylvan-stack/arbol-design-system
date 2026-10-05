import { describe, expect, it } from 'vitest'
import { buildTimelineDays, epochToHourPoint, hourPointToEpoch, timelineGeometryAnchor, timelineGeometryY, viewportTemporalContext } from '../src/time'

describe('Swimlanes board timeline range', () => {
  it('spans one calendar month in either direction and includes today', () => {
    const anchor = new Date(2026, 6, 22, 10).getTime()
    const days = buildTimelineDays(anchor)
    expect(days[0].label).toContain('Jun 22')
    expect(days.at(-1)?.label).toContain('Aug 21')
    expect(days.some((day) => day.offset === 0 && day.label.startsWith('Today'))).toBe(true)
  })

  it('clamps month ends instead of overflowing into another month', () => {
    const anchor = new Date(2025, 2, 31, 10).getTime()
    const days = buildTimelineDays(anchor)
    expect(days[0].label).toContain('Feb 28')
    expect(days.at(-1)?.label).toContain('Apr 30')
  })

  it('omits Saturdays and Sundays while retaining calendar-day offsets', () => {
    const anchor = new Date(2026, 6, 22, 10).getTime()
    const days = buildTimelineDays(anchor)
    expect(days.some((day) => day.label.startsWith('Sat') || day.label.startsWith('Sun'))).toBe(false)
    const friday = days.find((day) => day.label.includes('Fri Jul 24'))
    const monday = days.find((day) => day.label.includes('Mon Jul 27'))
    expect(monday!.offset - friday!.offset).toBe(3)
  })

  it('reports temporal context only when NOW is outside the viewport', () => {
    expect(viewportTemporalContext(200, 300, 100)).toBe('past')
    expect(viewportTemporalContext(500, 300, 100)).toBe('future')
    expect(viewportTemporalContext(350, 300, 100)).toBeNull()
    expect(viewportTemporalContext(300, 300, 100)).toBeNull()
    expect(viewportTemporalContext(400, 300, 100)).toBeNull()
  })

  it('preserves a position inside a workday across a zoom geometry change', () => {
    const anchor = timelineGeometryAnchor(60, [0, 150], [120, 120])
    expect(anchor).toEqual({ segment: 'day', index: 0, ratio: 0.5 })
    expect(timelineGeometryY(anchor, [0, 270], [240, 240])).toBe(120)
  })

  it('preserves a position inside a fixed-height inter-day gap while days zoom', () => {
    const anchor = timelineGeometryAnchor(135, [0, 150], [120, 120])
    expect(anchor).toEqual({ segment: 'gap', index: 0, ratio: 0.5 })
    // The day doubled from 120px to 240px, while its following gap stayed 30px.
    expect(timelineGeometryY(anchor, [0, 270], [240, 240])).toBe(255)
  })

  it('round-trips a persisted wall-clock anchor', () => {
    const point: [number, number] = [-4, 13.5]
    const restored = epochToHourPoint(hourPointToEpoch(point))
    expect(restored[0]).toBe(point[0])
    expect(restored[1]).toBeCloseTo(point[1])
  })
})
