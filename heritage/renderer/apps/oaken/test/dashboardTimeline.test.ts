import { describe, expect, it } from 'vitest'
import type { Swimlane, Swimmer } from '../src/data'
import {
  DASHBOARD_MAX_EPOCH_MS,
  DASHBOARD_MAX_SNAPSHOT_BYTES,
  DashboardTimelineError,
  dashboardRGB,
  dashboardTaskID,
  shortenUTF8,
  translateSwimlanesToDashboardTimeline,
  validateCompactDashboardTimelineJSON,
} from '../src/dashboardTimeline'

const baseSwimmer = (overrides: Partial<Swimmer> = {}): Swimmer => ({
  id: 'sw-f4f8323ec699464a8b723dc4d2e5e22d',
  nm: 'Implement dashboard',
  src: 'GRAFT',
  rootKind: 'graft',
  rootRef: 'dashboard',
  start: [0, 9],
  startMs: 1_786_276_800_000,
  due: [0, 11],
  dueMs: 1_786_284_000_000,
  type: 'due',
  items: [],
  ...overrides,
})

const lane = (n: number, swimmers: Swimmer[], overrides: Partial<Swimlane> = {}): Swimlane => ({
  n,
  sid: `sl-${n}`,
  tkt: `Lane ${n}`,
  hue: 220,
  swimmers,
  ...overrides,
})

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toMatchObject<Partial<DashboardTimelineError>>({ code })
}

describe('Oaken Dashboard timeline translation', () => {
  it('maps one Swimlane swimmer into compact version-1 JSON', async () => {
    const result = await translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer()], { tkt: 'Implement dashboard' }),
    ])

    expect(result.snapshot).toEqual({
      v: 1,
      tasks: [{
        id: 'F4F8323E-C699-464A-8B72-3DC4D2E5E22D',
        n: 'Implement dashboard',
        s: 1_786_276_800_000,
        e: 1_786_284_000_000,
        u: 'high',
        c: [69, 117, 211],
        h: 'square',
      }],
    })
    expect(result.json).toBe(JSON.stringify(result.snapshot))
  })

  it('flattens multiple lanes and deterministically orders by lane, start, then UUID', async () => {
    const early = baseSwimmer({ id: 'sw-00000000000000000000000000000002', nm: 'Early', startMs: 10, dueMs: null, type: undefined })
    const sameStartLowerID = baseSwimmer({ id: 'sw-00000000000000000000000000000001', nm: 'First ID', startMs: 20, dueMs: null })
    const sameStartHigherID = baseSwimmer({ id: 'sw-00000000000000000000000000000003', nm: 'Third ID', startMs: 20, dueMs: null })
    const result = await translateSwimlanesToDashboardTimeline([
      lane(4, [baseSwimmer({ id: 'legacy-four', startMs: 1, dueMs: null })]),
      lane(2, [sameStartHigherID, early, sameStartLowerID]),
    ])

    expect(result.snapshot.tasks.map((task) => task.n)).toEqual([
      'Lane 2 — Early', 'Lane 2 — First ID', 'Lane 2 — Third ID', 'Implement dashboard',
    ])
  })

  it('converts sw-hex directly and derives stable RFC 9562 UUIDv8 fallback IDs', async () => {
    expect(await dashboardTaskID('sw-f4f8323ec699464a8b723dc4d2e5e22d'))
      .toBe('F4F8323E-C699-464A-8B72-3DC4D2E5E22D')
    const first = await dashboardTaskID('legacy-swimmer-id')
    expect(first).toBe('E3CD4E85-99D0-822A-A9F5-C6E4CE6E93FB')
    expect(await dashboardTaskID('legacy-swimmer-id')).toBe(first)
    expect(first[14]).toBe('8')
    expect(['8', '9', 'A', 'B']).toContain(first[19])
  })

  it('adds non-redundant lane context only for multi-swimmer lanes', async () => {
    const two = await translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer({ nm: 'Build' }), baseSwimmer({ id: 'legacy-review', nm: 'Review' })], { tkt: 'Dashboard' }),
    ])
    expect(two.snapshot.tasks.map((task) => task.n).sort()).toEqual(['Dashboard — Build', 'Dashboard — Review'])

    const redundant = await translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer({ nm: '  DASHBOARD ' }), baseSwimmer({ id: 'legacy-two', nm: 'Ship' })], { tkt: 'dashboard' }),
    ])
    expect(redundant.snapshot.tasks.map((task) => task.n)).toContain('DASHBOARD')
  })

  it('shortens names to 200 UTF-8 bytes without splitting a scalar', () => {
    const shortened = shortenUTF8('😀'.repeat(60))
    expect(new TextEncoder().encode(shortened).byteLength).toBeLessThanOrEqual(200)
    expect(shortened.endsWith('…')).toBe(true)
    expect([...shortened].at(-2)).toBe('😀')
  })

  it('emits the authoritative empty snapshot', async () => {
    const result = await translateSwimlanesToDashboardTimeline([{ n: 1, empty: true }])
    expect(result.json).toBe('{"v":1,"tasks":[]}')
    expect(result.taskCount).toBe(0)
  })

  it('rejects duplicate stable IDs and more than 500 tasks', async () => {
    await expectCode(translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer(), baseSwimmer({ nm: 'Duplicate' })]),
    ]), 'duplicate_id')

    const swimmers = Array.from({ length: 501 }, (_, index) => baseSwimmer({ id: `legacy-${index}`, nm: `Task ${index}` }))
    await expectCode(translateSwimlanesToDashboardTimeline([lane(1, swimmers)]), 'too_many_tasks')
  })

  it('rejects malformed date ranges without sending a partial snapshot', async () => {
    await expectCode(translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer({ startMs: DASHBOARD_MAX_EPOCH_MS + 1, dueMs: null })]),
    ]), 'invalid_start_date')
    await expectCode(translateSwimlanesToDashboardTimeline([
      lane(1, [baseSwimmer({ startMs: 200, dueMs: 199 })]),
    ]), 'end_before_start')
  })

  it('uses the exact urgency and shape mappings, including blocked precedence', async () => {
    const swimmers = [
      baseSwimmer({ id: 'legacy-none', nm: 'None', type: undefined, dueMs: null }),
      baseSwimmer({ id: 'legacy-est', nm: 'Estimated', type: 'estimated' }),
      baseSwimmer({ id: 'legacy-due', nm: 'Due', type: 'due' }),
      baseSwimmer({ id: 'legacy-deadline', nm: 'Deadline', type: 'deadline' }),
      baseSwimmer({ id: 'legacy-blocked', nm: 'Blocked', type: 'estimated', blocked: true }),
    ]
    const result = await translateSwimlanesToDashboardTimeline([lane(1, swimmers)])
    const mapped = Object.fromEntries(result.snapshot.tasks.map((task) => [task.n.replace('Lane 1 — ', ''), [task.u, task.h]]))
    expect(mapped).toEqual({
      None: ['normal', undefined],
      Estimated: ['low', 'circle'],
      Due: ['high', 'square'],
      Deadline: ['critical', 'diamond'],
      Blocked: ['critical', 'triangle'],
    })
  })

  it('converts normalized finite hues deterministically and omits invalid hues', async () => {
    expect(dashboardRGB(0)).toEqual([211, 69, 69])
    expect(dashboardRGB(360)).toEqual(dashboardRGB(0))
    expect(dashboardRGB(-120)).toEqual(dashboardRGB(240))
    expect(dashboardRGB(Number.NaN)).toBeUndefined()
    const missing = await translateSwimlanesToDashboardTimeline([lane(1, [baseSwimmer()], { hue: undefined })])
    expect(missing.snapshot.tasks[0]).not.toHaveProperty('c')
  })

  it('rejects a compact payload over 256 KiB', () => {
    expect(() => validateCompactDashboardTimelineJSON('x'.repeat(DASHBOARD_MAX_SNAPSHOT_BYTES + 1)))
      .toThrowError(expect.objectContaining({ code: 'snapshot_too_large' }))
  })

  it('produces byte-identical output for unchanged input', async () => {
    const input = [lane(1, [baseSwimmer(), baseSwimmer({ id: 'legacy-stable', nm: 'Review' })])]
    expect((await translateSwimlanesToDashboardTimeline(input)).json)
      .toBe((await translateSwimlanesToDashboardTimeline(input)).json)
  })
})
