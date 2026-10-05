import { call, callNative } from '../bridge/arbol'
import type { ParsedEntityUri } from './entityUri'

export type EntityNavigator = (entity: ParsedEntityUri) => Promise<void> | void

type EntityDestination =
  | { type: 'app'; ui: 'elma' | 'seqoya' | 'willo' | 'oaken' | 'artifact'; query?: Record<string, unknown> }
  | { type: 'link'; kind: 'http' | 'file'; target: string }
  | { type: 'unavailable'; reason?: string }

export const defaultEntityNavigator: EntityNavigator = async (entity) => {
  const response = await call('entity.go_to', {
    kind: entity.kind,
    entity_id: entity.entityId,
  }) as { destination?: EntityDestination }
  const destination = response?.destination
  if (!destination || destination.type === 'unavailable') {
    throw new Error(destination?.reason || `No destination is registered for ${entity.kind}`)
  }
  if (destination.type === 'app') {
    const query = destination.query || {}
    const result = await callNative('app.open', { ui: destination.ui, query })
    if (result?.ok === false && destination.ui === 'elma') {
      // Dev/single-host builds may not install a separate Elma bundle. The
      // local listener understands the same app.open payload, including the
      // exact session/Turn target used by Prompt and Response chips.
      window.dispatchEvent(new CustomEvent('arbol-open', { detail: query }))
      return
    }
    if (result?.ok === false) throw new Error(result.error || 'Could not open Entity')
    return
  }
  const result = await callNative('link.open', { kind: destination.kind, target: destination.target })
  if (result?.ok === false) throw new Error(result.error || 'Could not open Entity')
}
