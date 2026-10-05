import { beforeEach, describe, expect, it, vi } from 'vitest'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@arbol/design-system', () => ({ call }))

import { addSwimlaneEntity, createSwimlane, createSwimlaneFromEntity, createSwimmerFromEntity, setSwimmerWall, swapSwimlaneLanes } from '../src/data'
import { jiraItemFromMarkdown, jiraItemFromRaw } from '../src/tasks/jira'

describe('entity → swimlane', () => {
  beforeEach(() => call.mockReset())

  it('creates a graft-rooted swimlane with its planned start and wall', async () => {
    call.mockResolvedValue({ ok: true })

    await createSwimlaneFromEntity({
      kind: 'graft',
      ref: 'graft-42',
      title: 'Deep research',
      startAt: 1_782_527_600_000,
      wallType: 'deadline',
      finishAt: 1_782_556_400_000,
    })

    expect(call).toHaveBeenCalledWith('oaken.swimlane.create', {
      root_kind: 'graft',
      root_ref: 'graft-42',
      title: 'Deep research',
      start_at: 1_782_527_600_000,
      wall_type: 'deadline',
      due_at: 1_782_556_400_000,
    })
  })


  it('adds an entity as a swimmer in the selected existing swimlane', async () => {
    call.mockResolvedValue({ ok: true })

    await createSwimmerFromEntity('sl-existing', {
      kind: 'graft', ref: 'graft-7', title: 'Review changes',
      startAt: 1_782_527_600_000,
      wallType: 'due', finishAt: 1_782_556_400_000,
    })

    expect(call).toHaveBeenCalledWith('oaken.swimmer.create', {
      swimlane_id: 'sl-existing',
      root_kind: 'graft',
      root_ref: 'graft-7',
      title: 'Review changes',
      start_at: 1_782_527_600_000,
      wall_type: 'due',
      due_at: 1_782_556_400_000,
    })
  })

  it('links an Entity to a selected swimmer', async () => {
    call.mockResolvedValue({ ok: true })

    await addSwimlaneEntity('sl-existing', 'sw-existing', {
      kind: 'artifact', title: 'Entity Search notes', ref: '[arb:arf:notes:Tm90ZXM=]', ts: 1234,
    })

    expect(call).toHaveBeenCalledWith('oaken.swimlane.add_entity', {
      swimlane_id: 'sl-existing',
      swimmer_id: 'sw-existing',
      kind: 'artifact',
      title: 'Entity Search notes',
      ref: '[arb:arf:notes:Tm90ZXM=]',
      ts: 1234,
    })
  })

  it('requests an atomic lane swap for a swimlane', async () => {
    call.mockResolvedValue({ ok: true })
    await swapSwimlaneLanes('sl-2', 7)
    expect(call).toHaveBeenCalledWith('oaken.swimlane.swap_lanes', {
      swimlane_id: 'sl-2', target_slot: 7,
    })
  })

  it('sets a wall on a swimmer rather than its swimlane', async () => {
    call.mockResolvedValue({ ok: true })
    await setSwimmerWall('sw-2', { wallType: 'deadline', dueAt: 1234 })
    expect(call).toHaveBeenCalledWith('oaken.swimmer.set_wall', {
      swimmer_id: 'sw-2', wall_type: 'deadline', due_at: 1234,
    })
  })

  it('creates a backlog entity without synthesizing a wall', async () => {
    call.mockResolvedValue({ ok: true })

    await createSwimlaneFromEntity({ kind: 'ticket', ref: 'DEMO-10016', title: 'No due date' })

    expect(call).toHaveBeenCalledWith('oaken.swimlane.create', {
      root_kind: 'ticket',
      root_ref: 'DEMO-10016',
      title: 'No due date',
    })
  })
})

describe('Jira Due Date metadata', () => {
  it('keeps Jira duedate as display-only metadata', async () => {
    call.mockResolvedValue({ ok: true })
    const item = jiraItemFromRaw(JSON.stringify({
      key: 'DEMO-10016',
      fields: {
        summary: 'Ship it',
        duedate: '2026-07-21',
        status: { name: 'Open' },
        issuetype: { name: 'Story' },
      },
    }), 'DEMO-10016.json')

    expect(item.jiraDueDate).toBe('2026-07-21')

    await createSwimlaneFromEntity({ kind: 'ticket', ref: item.key, title: item.title })
    expect(call).toHaveBeenCalledWith('oaken.swimlane.create', {
      root_kind: 'ticket',
      root_ref: 'DEMO-10016',
      title: 'Ship it',
    })
  })

  it('does not treat Jira deadline metadata as an Arbol wall', () => {
    const item = jiraItemFromMarkdown(`---
key: DEMO-10017
summary: Hard stop
due_date: 2026-07-21
deadline: 2026-07-20T15:30:00+02:00
---
# DEMO-10017 — Hard stop
`, 'tickets/DEMO-10017/ticket.md')

    expect(item.jiraDueDate).toBe('2026-07-21')
    expect('finishAt' in item).toBe(false)
    expect('wallType' in item).toBe(false)
  })
})

describe('anchor entity uniqueness', () => {
  it('finds the swimmer already anchored to an entity on the board', async () => {
    const { findAnchorAssignment } = await import('../src/data')
    const assignment = findAnchorAssignment([{
      n: 3,
      sid: 'sl-3',
      tkt: 'Planning',
      swimmers: [{
        id: 'sw-7', nm: 'Review changes', src: 'GRAFT',
        rootKind: 'graft', rootRef: 'graft-7', start: [0, 9], startMs: 123,
        items: [],
      }],
    }], { kind: 'graft', ref: 'graft-7' })

    expect(assignment?.swimmer.id).toBe('sw-7')
    expect(assignment?.swimlane.n).toBe(3)
  })

  it('does not treat linked entities as swimmer anchors', async () => {
    const { findAnchorAssignment } = await import('../src/data')
    const assignment = findAnchorAssignment([{
      n: 1,
      swimmers: [{
        id: 'sw-graft', nm: 'Plan', src: 'GRAFT',
        rootKind: 'graft', rootRef: 'graft-plan', start: [0, 9], startMs: 123,
        items: [{ kind: 'ticket', title: 'Linked', meta: 'DEMO-10016', t: [0, 10] }],
      }],
    }], { kind: 'ticket', ref: 'DEMO-10016' })

    expect(assignment).toBeNull()
  })

  it('normalizes the legacy merge_request spelling when comparing anchors', async () => {
    const { findAnchorAssignment } = await import('../src/data')
    const assignment = findAnchorAssignment([{
      n: 2,
      swimmers: [{
        id: 'sw-mr', nm: 'MR', src: 'GIT',
        rootKind: 'merge_request', rootRef: 'project!42', start: [0, 9], startMs: 123,
        items: [],
      }],
    }], { kind: 'mr', ref: 'project!42' })

    expect(assignment?.swimmer.id).toBe('sw-mr')
  })
})
