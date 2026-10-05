/* Pending approval view helpers.
 *
 * Core's materialized chat render DTO is the sole durable source. This module
 * deliberately has no event subscription and no reducer: approval changes
 * arrive when chat_session.render invalidates and refreshes that DTO.
 */
import type { ChatSessionView } from '@arbol/events'

export interface PendingApproval {
  request_id: string
  /** Canonical/original tool kind (bash, read, write, http, slack.*, …). */
  kind: string
  /** The projected request params. */
  params: Record<string, unknown>
  /** Why the effector requires a decision. */
  reason: string
  /** 'native' when the ask came from the CLI permission bridge. */
  origin?: string
  /** Structured classifier identity; never infer policy from display text. */
  canonical_kind?: string
  /** `every_time` means this exact operation can only be approved once. */
  approval_policy?: string
}

export function approvalsFromView(view: ChatSessionView): PendingApproval[] {
  return Object.values(view.toolRequests)
    .filter((request) => request.phase === 'pending')
    .map((request) => {
      const origin = request.origin || (request.request_id.startsWith('nt-') ? 'native' : undefined)
      return {
        request_id: request.request_id,
        kind: request.kind || '',
        params: view.toolRequestParams[request.request_id] || {},
        reason: request.reason || '',
        ...(request.canonical_kind ? { canonical_kind: request.canonical_kind } : {}),
        ...(request.approval_policy ? { approval_policy: request.approval_policy } : {}),
        ...(origin ? { origin } : {}),
      }
    })
    .sort((a, b) => a.request_id.localeCompare(b.request_id))
}
