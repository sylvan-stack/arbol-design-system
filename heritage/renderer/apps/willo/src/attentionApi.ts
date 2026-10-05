import { call } from '@arbol/design-system'

export type AttentionDescriptor =
  | { type: 'app'; ui: string; query?: Record<string, unknown> }
  | { type: 'link'; kind: 'http' | 'file'; target: string }
  | { type: 'unavailable'; reason?: string }

export type SpotlightTarget = {
  repo: string
  kind: string
  entity_id: string
  uri?: string | null
}

export type SpotlightItem = {
  target: SpotlightTarget
  title: string
  meta: string
  activity_at: number
  descriptor: AttentionDescriptor
  detail?: Record<string, unknown>
}

export type ComunicadoItem = {
  comunicado_id: string
  species: string
  kind?: 'arbol_restart' | 'postgres_restart' | 'postgres_manipulation' | 'other'
  status: 'active' | 'action_required' | 'resolved'
  title: string
  content: string
  descriptor: AttentionDescriptor
  payload: Record<string, unknown>
  source_ref?: string | null
  created_at: number
  updated_at: number
  entity: { repo: string; kind: 'comunicado'; entity_id: string }
}

export const attentionApi = {
  spotlights: () => call('spotlight.list', { limit: 200 })
    .then((result) => (result.items || []) as SpotlightItem[]),
  add: (target: SpotlightTarget) => call('spotlight.add', { target }) as Promise<{ ok: boolean; added: boolean }>,
  remove: (target: Pick<SpotlightTarget, 'kind' | 'entity_id'>) =>
    call('spotlight.remove', { target }) as Promise<{ ok: boolean; removed: boolean }>,
  addSlackThread: (conversationExternalId: string, threadTs: string, messageTs = threadTs) =>
    call('spotlight.slack_thread.add', {
      conversation_external_id: conversationExternalId,
      thread_ts: threadTs,
      message_ts: messageTs,
    }) as Promise<{ ok: boolean; added: boolean; entity_id: string }>,
  actionItems: () => call('comunicado.list', { status: 'action_required', limit: 200 })
    .then((result) => (result.items || []) as ComunicadoItem[]),
  dismissActionItem: (id: string) =>
    call('comunicado.dismiss', { comunicado_id: id }) as Promise<{ ok: boolean; dismissed: boolean }>,
  decidePermission: (id: string, action: 'approve' | 'reject' | 'stop', details?: string) =>
    call('comunicado.decide', { comunicado_id: id, action, ...(details ? { details } : {}) }) as Promise<{ ok: boolean; action: string }>,
}
