import { describe, expect, it } from 'vitest'

import {
  addPickedEntity,
  makeMainEntity,
  parsePickedEntity,
  removePickedEntity,
  type PickedEntity,
} from '../src/newSwimlane'

const pick = (over: Partial<PickedEntity> = {}): PickedEntity => ({
  entityId: 'DEMO-10001',
  uri: '[arb:tic:DEMO-10001:VGl0bGU=]' as PickedEntity['uri'],
  repo: 'BRO',
  kind: 'ticket',
  title: 'Title',
  ...over,
})

describe('parsePickedEntity', () => {
  it('accepts the native popup event detail', () => {
    expect(parsePickedEntity({
      entity_id: 'g-1', uri: '[arb:grf:g-1:VGl0bGU=]', repo: 'Arbol', kind: 'graft', title: 'Title',
    })).toEqual({
      entityId: 'g-1', uri: '[arb:grf:g-1:VGl0bGU=]', repo: 'Arbol', kind: 'graft', title: 'Title',
    })
  })

  it('rejects payloads missing identity fields', () => {
    expect(parsePickedEntity(null)).toBeNull()
    expect(parsePickedEntity('x')).toBeNull()
    expect(parsePickedEntity({ entity_id: 'g-1', repo: 'Arbol', kind: 'graft' })).toBeNull()
    expect(parsePickedEntity({ entity_id: '', repo: 'Arbol', kind: 'graft', title: 'T' })).toBeNull()
  })
})

describe('picked entity list', () => {
  it('appends new entities and deduplicates by identity', () => {
    const a = pick()
    const b = pick({ entityId: 'g-1', kind: 'graft', repo: 'Arbol' })
    let list = addPickedEntity([], a)
    list = addPickedEntity(list, b)
    expect(list).toEqual([a, b])
    expect(addPickedEntity(list, { ...a, title: 'Renamed' })).toBe(list)
  })

  it('treats the same id under a different kind or repo as distinct', () => {
    const a = pick()
    const list = addPickedEntity([a], pick({ kind: 'graft' }))
    expect(list).toHaveLength(2)
    expect(addPickedEntity(list, pick({ repo: 'Mycel' }))).toHaveLength(3)
  })

  it('removes by index', () => {
    const a = pick()
    const b = pick({ entityId: 'DEMO-10015' })
    expect(removePickedEntity([a, b], 0)).toEqual([b])
    expect(removePickedEntity([a, b], 5)).toEqual([a, b])
  })

  it('promotes an entity to main, keeping the remaining order', () => {
    const a = pick({ entityId: 'a' })
    const b = pick({ entityId: 'b' })
    const c = pick({ entityId: 'c' })
    expect(makeMainEntity([a, b, c], 2)).toEqual([c, a, b])
    expect(makeMainEntity([a, b, c], 0)).toEqual([a, b, c])
    expect(makeMainEntity([a, b, c], 9)).toEqual([a, b, c])
  })
})
