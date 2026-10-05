/* New Swimlane modal state: the ordered list of catalog Entities picked via
 * the standard (native) Entity Search popup. The first Entity is the MAIN
 * one — it anchors Swimmer 1 and, when it carries time data (e.g. a Graft's
 * wall), the Swimmer's start/wall are inferred from it by Core. */
import type { EntityKind, EntityUri } from '@arbol/design-system'

export type PickedEntity = {
  entityId: string
  uri: EntityUri
  repo: string
  kind: EntityKind
  title: string
}

/** Validate the `arbol-oaken-entity-picked` event detail from the native popup. */
export function parsePickedEntity(detail: unknown): PickedEntity | null {
  if (typeof detail !== 'object' || detail === null) return null
  const value = detail as Record<string, unknown>
  const entityId = typeof value.entity_id === 'string' ? value.entity_id : ''
  const uri = typeof value.uri === 'string' ? value.uri : ''
  const repo = typeof value.repo === 'string' ? value.repo : ''
  const kind = typeof value.kind === 'string' ? value.kind : ''
  const title = typeof value.title === 'string' ? value.title : ''
  if (!entityId || !repo || !kind || !title) return null
  return { entityId, uri: uri as EntityUri, repo, kind: kind as EntityKind, title }
}

const identity = (e: PickedEntity) => `${e.repo}\u0000${e.kind}\u0000${e.entityId}`

/** Append a pick; re-picking an already listed Entity is a no-op. */
export function addPickedEntity(list: PickedEntity[], entity: PickedEntity): PickedEntity[] {
  if (list.some((e) => identity(e) === identity(entity))) return list
  return [...list, entity]
}

export function removePickedEntity(list: PickedEntity[], index: number): PickedEntity[] {
  return list.filter((_, i) => i !== index)
}

/** Promote an Entity to the front, making it the main (anchor) Entity. */
export function makeMainEntity(list: PickedEntity[], index: number): PickedEntity[] {
  if (index <= 0 || index >= list.length) return list
  return [list[index], ...list.filter((_, i) => i !== index)]
}
