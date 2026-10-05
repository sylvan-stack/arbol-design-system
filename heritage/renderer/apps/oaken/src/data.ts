/* Oaken planning model (terms per GLOSSARY.md).
 *
 * SWIMLANE = a top-level workstream container on the Swimlanes board.
 * SWIMMER = one Entity-rooted task track inside a Swimlane. It owns its start,
 * optional typed WALL, and child ENTITIES.
 */
import { call, type EntityKind, type EntityUri } from '@arbol/design-system'
import { epochToHourPoint, PAGE0, type HourPoint, type WallType } from './time'

export type MarkEntity = {
  entityId?: string
  uri?: EntityUri
  kind: EntityKind
  t: HourPoint
  title: string
  meta?: string
  state?: string
}
export type SpanEntity = {
  entityId?: string
  uri?: EntityUri
  kind: EntityKind
  s: HourPoint
  e: HourPoint
  live?: boolean
  title: string
  meta?: string
  state?: string
}
export type EntityItem = MarkEntity | SpanEntity
export const isSpan = (g: EntityItem): g is SpanEntity => 's' in g

export type Swimmer = {
  id: string
  nm: string
  src: string
  rootKind: SwimlaneRootKind
  rootRef: string
  start: HourPoint
  startMs: number
  due?: HourPoint
  dueMs?: number | null
  type?: WallType
  blocked?: boolean
  items: EntityItem[]
}

export type Swimlane = {
  n: number
  empty?: boolean
  sid?: string
  tkt?: string
  hue?: number
  swimmers?: Swimmer[]
}

export const isEmptySwimlane = (l: Swimlane): boolean =>
  !!l.empty || !l.swimmers || l.swimmers.length === 0

export const IMP_ORDER = [4, 5, 6, 3, 7, 2, 1, 8]
export const imp = (n: number) => 1 - Math.max(0, IMP_ORDER.indexOf(n)) / (IMP_ORDER.length - 1)
export const SWIMLANE_SLOTS = 8

export function withPlaceholders(swimlanes: Swimlane[], slots = SWIMLANE_SLOTS): Swimlane[] {
  const byN = new Map(swimlanes.map((l) => [l.n, l]))
  const maxN = Math.max(slots, ...swimlanes.map((l) => l.n), 0)
  const out: Swimlane[] = []
  for (let n = 1; n <= maxN; n++) out.push(byN.get(n) ?? { n, empty: true })
  return out
}

export function hasBridge(): boolean {
  return !!(window as Window & { webkit?: { messageHandlers?: { arbol?: unknown } } }).webkit
    ?.messageHandlers?.arbol
}

export type SwimlaneRootKind = EntityKind | 'merge_request'

export type WireEntity = {
  entity_id: string
  source_entity_id?: string | null
  entity_uri: EntityUri
  swimmer_id: string
  kind: EntityKind
  title: string
  ref?: string | null
  meta?: string | null
  state?: string | null
  ts?: number | null
  span_start?: number | null
  span_end?: number | null
  live?: boolean
  created_at: number
}
export type WireSwimmer = {
  swimmer_id: string
  swimlane_id: string
  root_kind: SwimlaneRootKind
  root_ref: string
  title: string
  start_at: number
  wall_type?: WallType | null
  due_at?: number | null
  created_at: number
  updated_at: number
  entities: WireEntity[]
}
export type WireSwimlane = {
  swimlane_id: string
  title: string
  hue?: number | null
  slot_n: number
  status: string
  created_at: number
  updated_at: number
  swimmers: WireSwimmer[]
}

const ROOT_BADGE: Partial<Record<SwimlaneRootKind, string>> = {
  ticket: 'JIRA', graft: 'GRAFT', mr: 'GIT', merge_request: 'GIT', commit: 'GIT',
  slack: 'SLACK', email: 'EMAIL', chat: 'CHAT', artifact: 'ARTF',
  requirement: 'REQ', invariant: 'INV', glossary: 'TERM', secret: 'SECRET',
  flyer: 'FLYER', branch: 'BRANCH',
}

function toEntityItem(e: WireEntity): EntityItem {
  const common = {
    entityId: e.source_entity_id ?? e.entity_id,
    uri: e.entity_uri,
    kind: e.kind,
    title: e.title,
    meta: e.meta ?? undefined,
    state: e.state ?? undefined,
  }
  if (e.span_start != null && e.span_end != null) {
    return { ...common, s: epochToHourPoint(e.span_start), e: epochToHourPoint(e.span_end), live: e.live }
  }
  return { ...common, t: epochToHourPoint(e.ts ?? e.created_at) }
}

function toSwimmer(w: WireSwimmer): Swimmer {
  const rawStart = epochToHourPoint(w.start_at)
  const start: HourPoint = rawStart[0] < 0 ? [0, PAGE0] : rawStart
  const hasWall = w.due_at != null
  return {
    id: w.swimmer_id,
    nm: w.title || w.root_ref || 'Untitled swimmer',
    src: ROOT_BADGE[w.root_kind] ?? 'TEXT',
    rootKind: w.root_kind,
    rootRef: w.root_ref,
    start,
    startMs: w.start_at,
    ...(hasWall ? {
      due: epochToHourPoint(w.due_at!),
      dueMs: w.due_at,
      type: (w.wall_type ?? 'estimated') as WallType,
    } : { dueMs: null }),
    items: (w.entities ?? []).map(toEntityItem),
  }
}

function toSwimlane(w: WireSwimlane): Swimlane {
  return {
    n: w.slot_n,
    sid: w.swimlane_id,
    tkt: w.title || `Swimlane ${w.slot_n}`,
    hue: w.hue ?? undefined,
    swimmers: (w.swimmers ?? []).map(toSwimmer),
  }
}

export async function loadSwimlanesStrict(): Promise<Swimlane[]> {
  if (!hasBridge()) throw new Error('Arbol bridge is unavailable')
  const r = await call('oaken.swimlanes')
  const rows = ((r?.swimlanes ?? r) as WireSwimlane[]) || []
  if (!Array.isArray(rows)) throw new Error('Invalid oaken.swimlanes response')
  return rows.map(toSwimlane)
}

export async function loadSwimlanes(): Promise<Swimlane[]> {
  try {
    return await loadSwimlanesStrict()
  } catch {
    return []
  }
}

export type SwimmerRootEntity = {
  kind: EntityKind
  /** Stable identity of the Entity that will anchor the Swimmer. */
  ref: string
  title: string
  /** Planned start for the Swimmer created from this Entity (epoch ms). */
  startAt?: number | null
  finishAt?: number | null
  wallType?: WallType | null
}
// Compatibility name used by existing callers.
export type SwimlaneRootEntity = SwimmerRootEntity

export type AnchorAssignment = {
  swimmer: Swimmer
  swimlane: Swimlane
}

const canonicalAnchorKind = (kind: SwimlaneRootKind): SwimlaneRootKind =>
  kind === 'merge_request' ? 'mr' : kind

/** Find the active Swimmer already anchored to this stable Entity identity. */
export function findAnchorAssignment(
  swimlanes: Swimlane[], entity: { kind: SwimlaneRootKind; ref: string },
): AnchorAssignment | null {
  const ref = entity.ref.trim()
  if (!ref) return null
  const kind = canonicalAnchorKind(entity.kind)
  for (const swimlane of swimlanes) {
    for (const swimmer of swimlane.swimmers ?? []) {
      if (canonicalAnchorKind(swimmer.rootKind) === kind && swimmer.rootRef.trim() === ref) {
        return { swimmer, swimlane }
      }
    }
  }
  return null
}

type EntityPayloadOptions = {
  rootRef?: string
  title?: string
  startAt?: number | null
  finishAt?: number | null
  wallType?: WallType | null
}
type CreateSwimlaneOptions = EntityPayloadOptions & { slot?: number }

function entityPayload(rootKind: SwimlaneRootKind, opts: EntityPayloadOptions) {
  return {
    root_kind: rootKind,
    ...(opts.rootRef ? { root_ref: opts.rootRef } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.startAt != null ? { start_at: opts.startAt } : {}),
    ...(opts.finishAt != null ? { due_at: opts.finishAt, wall_type: opts.wallType ?? 'due' } : {}),
  }
}

/** Create a Swimlane whose first Swimmer is anchored to the selected Entity. */
export async function createSwimlane(
  rootKind: SwimlaneRootKind, opts: CreateSwimlaneOptions = {},
): Promise<void> {
  await call('oaken.swimlane.create', {
    ...entityPayload(rootKind, opts),
    ...(opts.slot != null ? { slot_n: opts.slot } : {}),
  })
}

export async function createSwimlaneFromEntity(entity: SwimmerRootEntity): Promise<void> {
  await createSwimlane(entity.kind, {
    rootRef: entity.ref,
    title: entity.title,
    startAt: entity.startAt,
    finishAt: entity.finishAt,
    wallType: entity.wallType,
  })
}

/** Create a Swimlane anchored to the main picked Entity, then attach the
 * companion Entities to Swimmer 1. Core infers the Swimmer's start/wall from
 * the main Entity when it carries time data (e.g. a Graft's wall). */
export async function createSwimlaneFromPickedEntities(
  main: { entityId: string; repo: string; kind: EntityKind; title: string },
  companions: { entityId: string; repo: string; kind: EntityKind }[],
  opts: { title?: string; slot?: number } = {},
): Promise<{ attachFailures: number }> {
  const r = await call('oaken.swimlane.create', {
    root_kind: main.kind,
    root_ref: main.entityId,
    title: opts.title || main.title,
    ...(opts.slot != null ? { slot_n: opts.slot } : {}),
  })
  const swimlaneId = (r?.swimlane as WireSwimlane | undefined)?.swimlane_id
  let attachFailures = 0
  for (const e of companions) {
    if (!swimlaneId) { attachFailures += 1; continue }
    try {
      await call('oaken.swimlane.add_entity', {
        swimlane_id: swimlaneId,
        kind: e.kind,
        source_entity_id: e.entityId,
        source_repo: e.repo,
        ts: Date.now(),
      })
    } catch {
      attachFailures += 1
    }
  }
  return { attachFailures }
}

/** Add a new Swimmer anchored to the selected Entity in an existing Swimlane. */
export async function createSwimmerFromEntity(
  swimlaneId: string, entity: SwimmerRootEntity,
): Promise<void> {
  await call('oaken.swimmer.create', {
    swimlane_id: swimlaneId,
    ...entityPayload(entity.kind, {
      rootRef: entity.ref,
      title: entity.title,
      startAt: entity.startAt,
      finishAt: entity.finishAt,
      wallType: entity.wallType,
    }),
  })
}

export async function setSwimmerWall(
  swimmerId: string, w: { wallType: WallType; dueAt: number | null },
): Promise<void> {
  await call('oaken.swimmer.set_wall', {
    swimmer_id: swimmerId,
    wall_type: w.wallType,
    due_at: w.dueAt,
  })
}

export async function finishSwimlane(swimlaneId: string): Promise<void> {
  await call('oaken.swimlane.finish', { swimlane_id: swimlaneId })
}

export async function removeEmptySwimlane(swimlaneId: string): Promise<void> {
  await call('oaken.swimlane.remove', { swimlane_id: swimlaneId })
}

export async function renameSwimlane(swimlaneId: string, title: string): Promise<void> {
  await call('oaken.swimlane.rename', { swimlane_id: swimlaneId, title })
}

/** Move a Swimlane to a board slot; an occupied target swaps into the freed slot. */
export async function swapSwimlaneLanes(swimlaneId: string, targetSlot: number): Promise<void> {
  await call('oaken.swimlane.swap_lanes', { swimlane_id: swimlaneId, target_slot: targetSlot })
}

export async function addSwimlaneEntity(
  swimlaneId: string,
  swimmerId: string,
  e: { kind: EntityKind; title: string; ref?: string; ts?: number },
): Promise<void> {
  await call('oaken.swimlane.add_entity', {
    swimlane_id: swimlaneId,
    swimmer_id: swimmerId,
    kind: e.kind,
    title: e.title,
    ...(e.ref ? { ref: e.ref } : {}),
    ts: e.ts ?? Date.now(),
  })
}
