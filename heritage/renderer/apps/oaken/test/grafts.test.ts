import { beforeEach, describe, expect, it, vi } from 'vitest'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@arbol/design-system', () => ({ call }))

import { GRAFT_TYPES, createGraft, updateGraft, type GraftDraft } from '../src/tasks/grafts'
import { graftPayload } from '../../../packages/design-system/src/grafts/payload'

const draft: GraftDraft = {
  title: 'Plan the release',
  description: 'Coordinate the final tasks',
  graftType: 'trc-management',
  startAt: 1_782_527_600_000,
  wallType: 'deadline',
  dueAt: 1_782_556_400_000,
}

describe('graft persistence payloads', () => {
  beforeEach(() => call.mockReset().mockResolvedValue({ ok: true }))

  it('offers Container as a graft type', () => {
    expect(GRAFT_TYPES).toContainEqual({ id: 'container', label: 'Container' })
  })

  it('sends the selected start when creating a graft', async () => {
    await createGraft(draft)

    expect(call).toHaveBeenCalledWith('graft.create', {
      title: draft.title,
      description: draft.description,
      graft_type: draft.graftType,
      start_at: draft.startAt,
      wall_type: draft.wallType,
      due_at: draft.dueAt,
    })
  })

  it('sends the edited start when updating a graft', async () => {
    await updateGraft('gr-42', { ...draft, startAt: 1_782_531_200_000 })

    expect(call).toHaveBeenCalledWith('graft.update', {
      graft_id: 'gr-42',
      title: draft.title,
      description: draft.description,
      graft_type: draft.graftType,
      start_at: 1_782_531_200_000,
      wall_type: draft.wallType,
      due_at: draft.dueAt,
    })
  })

  it('adds a canonical source identity when wrapping an entity', () => {
    expect(graftPayload(draft, {
      repo: 'Any',
      kind: 'slack',
      entityId: 'slack-item-1',
      title: 'Alice: please review the rollout',
    })).toMatchObject({
      source_repo: 'Any',
      source_kind: 'slack',
      source_entity_id: 'slack-item-1',
      source_title: 'Alice: please review the rollout',
    })
  })

})
