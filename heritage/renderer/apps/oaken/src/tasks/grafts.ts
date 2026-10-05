/* Grafts — bounded Arbol-native work items (GLOSSARY.md: Graft). A Graft may
 * stand alone or retain a source Entity identity without copying that source.
 * Stored in core Postgres via the `graft.*` RPC family. Each graft owns
 * its planned start time. Urgency reuses the swimmer-wall vocabulary
 * (wall_type estimated|due|deadline + due_at epoch-ms); both absent ⇒ backlog.
 * When scheduled, the start and optional urgency become the Swimmer's start and
 * Wall. */
import { call } from '@arbol/design-system'
import type { WallType } from '../time'

export type GraftType =
  | 'subtask' | 'code-review' | 'merge-request' | 'trc-management' | 'spike'
  | 'branching-chores' | 'solution-defense' | 'deep-research' | 'code-scout' | 'container'

export const GRAFT_TYPES: { id: GraftType; label: string }[] = [
  { id: 'subtask', label: 'Subtask' },
  { id: 'code-review', label: 'Code review' },
  { id: 'merge-request', label: 'Merge request' },
  { id: 'trc-management', label: 'TRC management' },
  { id: 'spike', label: 'Spike' },
  { id: 'branching-chores', label: 'Branching chores' },
  { id: 'solution-defense', label: 'Solution defense' },
  { id: 'deep-research', label: 'Deep research' },
  { id: 'code-scout', label: 'Code scout' },
  { id: 'container', label: 'Container' },
]

export function graftTypeLabel(type: string): string {
  return GRAFT_TYPES.find((t) => t.id === type)?.label ?? type
}

export type GraftStatus = 'open' | 'done'

export type GraftLinkedEntity = {
  repo: string
  kind: string
  entity_id: string
  title: string
  uri: string | null
  relationship_type: string
  direction: 'incoming' | 'outgoing'
}

export type Graft = {
  graft_id: string
  title: string
  description: string
  graft_type: GraftType
  status: GraftStatus
  /** Planned start copied to a Swimmer when this Graft is scheduled. */
  start_at: number
  /** Urgency: both set (copied to a created Swimmer) or both null (backlog). */
  wall_type: WallType | null
  due_at: number | null
  /** Canonical wrapped Entity identity; all null for a standalone Graft. */
  source_repo: string | null
  source_kind: string | null
  source_entity_id: string | null
  source_title: string | null
  /** Canonical Entity relationships attached directly to this Graft. */
  linked_entities: GraftLinkedEntity[]
  created_at: number
  updated_at: number
}

/** The editable form fields (create + edit share this shape). */
export type GraftDraft = {
  title: string
  description: string
  graftType: GraftType
  startAt: number
  wallType: WallType | null
  dueAt: number | null
}

type RpcCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>

function wireDraft(draft: GraftDraft): Record<string, unknown> {
  return {
    title: draft.title,
    description: draft.description,
    graft_type: draft.graftType,
    start_at: draft.startAt,
    wall_type: draft.wallType,
    due_at: draft.dueAt,
  }
}

export async function loadGrafts(rpc: RpcCall = call): Promise<Graft[]> {
  const r = await rpc('graft.list') as { grafts?: Graft[] }
  return Array.isArray(r?.grafts) ? r.grafts : []
}

export async function createGraft(draft: GraftDraft, rpc: RpcCall = call): Promise<void> {
  await rpc('graft.create', wireDraft(draft))
}

export async function updateGraft(graftId: string, draft: GraftDraft, rpc: RpcCall = call): Promise<void> {
  await rpc('graft.update', { graft_id: graftId, ...wireDraft(draft) })
}

export async function setGraftStatus(graftId: string, status: GraftStatus, rpc: RpcCall = call): Promise<void> {
  await rpc('graft.set_status', { graft_id: graftId, status })
}

export async function deleteGraft(graftId: string, rpc: RpcCall = call): Promise<void> {
  await rpc('graft.delete', { graft_id: graftId })
}
