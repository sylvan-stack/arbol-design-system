import { call } from '@arbol/design-system'

export type TelegramSync = {
  status: 'never_started' | 'running' | 'completed' | 'failed'
  phase?: string | null
  error?: string | null
}

export type TelegramConversation = {
  id: string
  external_id: string
  kind: 'private' | 'bot' | 'group' | 'channel'
  title: string
  last_message_at?: number | null
  is_vip: number | boolean
  sort_position?: number | null
  actor_external_id?: string | null
  display_name?: string | null
  real_name?: string | null
  username?: string | null
  phone?: string | null
  ignored?: number | boolean
  match_score?: number
  avatar_url?: string | null
}

export type TelegramMessage = {
  id: string
  external_id: string
  external_ts: string
  reply_to_external_id?: string | null
  content: string
  occurred_at: number
  edited_at?: number | null
  deleted_at?: number | null
  metadata?: Record<string, unknown>
  author_external_id?: string | null
  author_name?: string | null
  author_username?: string | null
  author_avatar_url?: string | null
}

export type TelegramCursor = { occurred_at: number; external_ts: string; id: string }

export type TelegramOverview = {
  has_data: boolean
  contacts: number
  chats: number
  sync: TelegramSync
  preferences: { message_page_size: number }
}

export const telegramApi = {
  overview: () => call('telegram.surface.overview') as Promise<TelegramOverview>,
  sync: () => call('telegram.surface.sync.start') as Promise<{ accepted: boolean; sync: TelegramSync }>,
  reconcile: () => call('telegram.surface.reconcile') as Promise<{ accepted: boolean }>,
  contacts: (since?: number, query?: string) => call('telegram.surface.contacts.list', { since, query }).then((r) => (r.contacts || []) as TelegramConversation[]),
  chats: (since?: number, query?: string) => call('telegram.surface.chats.list', { since, query }).then((r) => (r.chats || []) as TelegramConversation[]),
  ignored: () => call('telegram.surface.conversations.ignored.list').then((r) => (r.conversations || []) as TelegramConversation[]),
  messages: (conversationId: string, limit: number, before?: TelegramCursor | null) =>
    call('telegram.surface.messages.list', { conversation_id: conversationId, limit, ...(before ? { before } : {}) }) as Promise<{ messages: TelegramMessage[]; next_before: TelegramCursor | null; has_more: boolean }>,
  conversationContext: (conversationId: string, limit: number) =>
    call('telegram.surface.conversation.context', { conversation_id: conversationId, limit }) as Promise<{ conversation: TelegramConversation; messages: TelegramMessage[]; next_before: TelegramCursor | null; has_more: boolean }>,
  messageContext: (itemId: string, limit: number) =>
    call('telegram.surface.message.context', { item_id: itemId, limit }) as Promise<{ conversation: TelegramConversation; messages: TelegramMessage[]; next_before: TelegramCursor | null; has_more: boolean }>,
  setVip: (conversationId: string, isVip: boolean) => call('telegram.surface.conversation.set_vip', { conversation_id: conversationId, is_vip: isVip }),
  ignore: (conversationId: string) => call('telegram.surface.conversation.ignore', { conversation_id: conversationId }),
  unignore: (conversationId: string) => call('telegram.surface.conversation.unignore', { conversation_id: conversationId }),
  reorder: (ids: string[], isVip: boolean) => call('telegram.surface.conversations.reorder', { conversation_ids: ids, is_vip: isVip }),
  setPageSize: (size: number) => call('telegram.surface.preferences.set', { message_page_size: size }),
}

export function telegramConversationName(c: TelegramConversation): string {
  return c.display_name || c.real_name || c.title || c.username || c.external_id
}

export function telegramConversationPrefix(c: TelegramConversation): string {
  return c.kind === 'group' || c.kind === 'channel' ? '# ' : ''
}
