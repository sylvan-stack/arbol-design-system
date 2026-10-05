import type { GraftDraft, GraftSource } from './grafts'

/** Convert the standard Graft form and optional wrapped Entity to Core's wire shape. */
export function graftPayload(draft: GraftDraft, source?: GraftSource | null): Record<string, unknown> {
  return {
    title: draft.title,
    description: draft.description,
    graft_type: draft.graftType,
    start_at: draft.startAt,
    wall_type: draft.wallType,
    due_at: draft.dueAt,
    ...(source ? {
      source_repo: source.repo,
      source_kind: source.kind,
      source_entity_id: source.entityId,
      source_title: source.title || null,
    } : {}),
  }
}
