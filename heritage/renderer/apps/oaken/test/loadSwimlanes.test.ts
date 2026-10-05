import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@arbol/design-system', () => ({ call }))

import { loadSwimlanesStrict } from '../src/data'

describe('timer panel swimlane loading', () => {
  beforeEach(() => {
    call.mockReset()
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { arbol: { postMessage: vi.fn() } } },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('maps the same active swimlanes returned to the full board', async () => {
    call.mockResolvedValue({
      swimlanes: [{
        swimlane_id: 'sl-4', title: 'Riki Integration', slot_n: 4,
        status: 'active', created_at: 1, updated_at: 1,
        swimmers: [{
          swimmer_id: 'sw-1', swimlane_id: 'sl-4', root_kind: 'graft',
          root_ref: 'riki', title: 'Riki Integration', start_at: 1_700_000_000_000,
          wall_type: 'estimated', due_at: 1_700_003_600_000,
          created_at: 1, updated_at: 1, entities: [],
        }],
      }],
    })

    const lanes = await loadSwimlanesStrict()

    expect(call).toHaveBeenCalledWith('oaken.swimlanes')
    expect(lanes).toMatchObject([{
      n: 4, sid: 'sl-4', tkt: 'Riki Integration',
      swimmers: [{ id: 'sw-1', nm: 'Riki Integration', rootKind: 'graft' }],
    }])
  })

  it('preserves core failures so the panel can retry instead of claiming the board is empty', async () => {
    call.mockRejectedValue(new Error('core reconnecting'))

    await expect(loadSwimlanesStrict()).rejects.toThrow('core reconnecting')
  })
})
