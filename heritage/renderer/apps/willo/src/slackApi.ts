import { call } from '@arbol/design-system'

export type SlackSync = {
  status: 'never_started' | 'running' | 'completed' | 'failed'
  phase?: string | null
  error?: string | null
}

export type SlackConversation = {
  id: string
  external_id: string
  kind: 'im' | 'mpim' | 'public_channel' | 'private_channel'
  title: string
  last_message_at?: number | null
  is_vip: number | boolean
  sort_position?: number | null
  actor_external_id?: string | null
  display_name?: string | null
  real_name?: string | null
  avatar_url?: string | null
}

export type SlackMessage = {
  id: string
  external_id: string
  external_ts: string
  thread_ts?: string | null
  content: string
  rendered_content?: string
  occurred_at: number
  edited_at?: number | null
  deleted_at?: number | null
  metadata?: Record<string, unknown>
  author_external_id?: string | null
  author_name?: string | null
  author_avatar_url?: string | null
  reply_count?: number
  latest_reply_at?: number | null
}

export type SlackCursor = { occurred_at: number; external_ts: string; id: string }

export type SlackOverview = {
  has_data: boolean
  contacts: number
  channels: number
  sync: SlackSync
  preferences: { message_page_size: number }
  workspace_url?: string | null
}

export const slackApi = {
  overview: () => call('slack.surface.overview') as Promise<SlackOverview>,
  sync: () => call('slack.surface.sync.start') as Promise<{ accepted: boolean; sync: SlackSync }>,
  reconcile: () => call('slack.surface.reconcile') as Promise<{ accepted: boolean }>,
  contacts: () => call('slack.surface.contacts.list').then((r) => (r.contacts || []) as SlackConversation[]),
  channels: () => call('slack.surface.channels.list').then((r) => (r.channels || []) as SlackConversation[]),
  ignored: () => call('slack.surface.conversations.ignored.list').then((r) => (r.conversations || []) as SlackConversation[]),
  messages: (conversationId: string, limit: number, before?: SlackCursor | null) =>
    call('slack.surface.messages.list', { conversation_id: conversationId, limit, ...(before ? { before } : {}) }) as Promise<{ messages: SlackMessage[]; next_before: SlackCursor | null; has_more: boolean }>,
  threadReplies: (conversationId: string, threadTs: string) =>
    call('slack.surface.thread.replies', { conversation_id: conversationId, thread_ts: threadTs }).then((r) => (r.messages || []) as SlackMessage[]),
  permalink: (channel: string, messageTs: string, threadTs?: string | null) =>
    call('slack.surface.message.permalink', {
      channel, message_ts: messageTs, ...(threadTs ? { thread_ts: threadTs } : {}),
    }).then((r) => String(r.permalink || '')),
  setVip: (conversationId: string, isVip: boolean) => call('slack.surface.contact.set_vip', { conversation_id: conversationId, is_vip: isVip }),
  ignore: (conversationId: string) => call('slack.surface.conversation.ignore', { conversation_id: conversationId }),
  unignore: (conversationId: string) => call('slack.surface.conversation.unignore', { conversation_id: conversationId }),
  reorder: (ids: string[], isVip: boolean) => call('slack.surface.contacts.reorder', { conversation_ids: ids, is_vip: isVip }),
  setPageSize: (size: number) => call('slack.surface.preferences.set', { message_page_size: size }),
}

export function slackConversationName(c: SlackConversation): string {
  return c.display_name || c.real_name || c.title || c.external_id
}


/** Build Slack's canonical message URL. Replies retain their thread context. */
export function slackMessagePermalink(
  workspaceUrl: string,
  conversationExternalId: string,
  message: Pick<SlackMessage, 'external_ts' | 'thread_ts'>,
): string {
  const workspace = workspaceUrl.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^/]+\.slack\.com$/i.test(workspace)) {
    throw new Error('Slack workspace URL is unavailable')
  }
  const channel = encodeURIComponent(conversationExternalId)
  const messageTs = message.external_ts
  const pathTs = messageTs.replace('.', '')
  if (!/^\d+\.\d+$/.test(messageTs) || !/^\d+$/.test(pathTs)) {
    throw new Error('Slack message timestamp is invalid')
  }
  const url = new URL(`${workspace}/archives/${channel}/p${pathTs}`)
  const threadTs = message.thread_ts
  if (threadTs && threadTs !== messageTs) {
    url.searchParams.set('thread_ts', threadTs)
    url.searchParams.set('cid', conversationExternalId)
  }
  return url.toString()
}
