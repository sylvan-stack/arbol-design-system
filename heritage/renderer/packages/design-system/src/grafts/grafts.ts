import { call } from '../bridge/arbol'
import type { WallType } from './time'
import { graftPayload } from './payload'

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

export type GraftSource = {
  repo: string
  kind: string
  entityId: string
  title?: string
}

export type Graft = {
  graft_id: string
  title: string
  description: string
  graft_type: GraftType
  status: 'open' | 'done'
  start_at: number
  wall_type: WallType | null
  due_at: number | null
  source_repo: string | null
  source_kind: string | null
  source_entity_id: string | null
  source_title: string | null
  created_at: number
  updated_at: number
}

export type GraftDraft = {
  title: string
  description: string
  graftType: GraftType
  startAt: number
  wallType: WallType | null
  dueAt: number | null
}

type RpcCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>

export async function createGraft(
  draft: GraftDraft,
  source?: GraftSource | null,
  rpc: RpcCall = call,
): Promise<Graft> {
  const result = await rpc('graft.create', graftPayload(draft, source)) as { graft: Graft }
  return result.graft
}
