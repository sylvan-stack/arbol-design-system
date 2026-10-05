import { call, callNative } from '@arbol/design-system'

export type MailAccount = {
  id: string
  provider: string
  name: string
  email: string
  mailbox_url: string
  message_count: number
  unread_count: number
  updated_at: number
}

export type MailSync = {
  account_id: string
  status: 'never_started' | 'running' | 'completed' | 'failed' | 'needs_login'
  error: string | null
  last_attempt_at: number | null
  last_synced_at: number | null
  message_count: number
  updated_at: number | null
}

export type MailStatus = {
  logged_in: boolean
  gmail_access_suspended: boolean
  legacy_automation_disabled: boolean
  user_mediated_capture_available: boolean
  user_mediated_window_open: boolean
  user_mediated_capture_revision: number
  automatic_sync_running: boolean
  gmail_experiment_safety?: {
    provider_challenge_detected: boolean
    running: boolean
    cooldown_remaining_seconds: number
    maximum_elapsed_seconds: number
    maximum_navigations: number
    maximum_actions: number
    maximum_javascript_evaluations: number
    navigation_count: number
    action_count: number
    javascript_evaluation_count: number
  }
  has_data: boolean
  accounts: MailAccount[]
  sync: MailSync
}

export type MailMessageSummary = {
  id: string
  account_id: string
  account_name: string
  account_email: string
  mailbox: string
  message_id: string
  sender: string
  sender_address: string
  sender_domain: string
  subject: string
  preview: string
  date_received: number
  is_read: boolean
  is_flagged: boolean
  message_size: number
  has_attachments: boolean
  remote_url: string
  content_state: 'preview' | 'partial' | 'complete'
  thread_message_count: number
  thread_message_count_hint?: number
}

export type MailAttachment = {
  name: string
  mime_type?: string
  file_size?: number
}

export type MailMessage = MailMessageSummary & {
  conversation_id: string
  reply_to: string
  to: string[]
  cc: string[]
  bcc: string[]
  date_sent: number
  attachments: MailAttachment[]
  body: string
  body_truncated: boolean
}

export type EmailSourceContent = {
  source_item_id: string
  source_acceptance_seq: number
  provider_message_id: string
  provider_thread_id: string
  content_state: 'preview' | 'partial' | 'rendered_complete' | 'raw_complete'
  content_hash: string
  sender: string
  sender_address: string
  subject: string
  occurred_at: number
  text: string
  to: string[]
  cc: string[]
  bcc: string[]
  reply_to: string
  links: { text: string; url: string }[]
  attachments: MailAttachment[]
  capture_method: string
}

export type MailAcquisitionResult = { captures?: number; complete?: number; partial?: number; attempt_id?: string; terminal_reason?: string }

export function isViewportDiagnosticTarget(message: Pick<MailMessageSummary, 'id' | 'content_state'>, targetId: string): boolean {
  return message.id === targetId && (message.content_state === 'partial' || message.content_state === 'preview')
}
export type MailRendererListTrace = {
  stage: 'load_started' | 'list_received' | 'render_observed' | 'load_failed' | 'window_error' | 'unhandled_rejection'
  generation: number
  account_selection_kind: 'default' | 'specific'
  account_count: number
  query_empty: boolean
  returned_count: number
  visible_count: number
  rendered_count: number
  loading: boolean
  request_current: boolean
  error_kind: 'none' | 'mail_sync_error' | 'error' | 'unknown'
}
export type MailSyncProgress = {
  running: boolean
  phase: 'idle' | 'discovering' | 'loading_inbox' | 'reading_inbox' | 'fetching' | 'finished'
  current: number
  total: number
  message?: string
  subject?: string
  sender?: string
  complete?: number
  partial?: number
  failed?: number
  ignored?: number
  run_id?: string
}
export function mailSyncProgressLabel(progress: MailSyncProgress): string {
  if (progress.message) return progress.message
  if (progress.phase === 'loading_inbox') return 'Opening Gmail…'
  if (progress.phase === 'discovering' || progress.phase === 'reading_inbox') return 'Finding unfetched email threads…'
  if (progress.phase === 'fetching') return `Synchronising ${progress.current + 1} of ${progress.total}…`
  return 'Synchronising emails…'
}

export type MailSyncResult = {
  ingested?: number
  acquisition_requested?: number
  acquisition_resolved?: number
  acquired_conversations?: number
  complete?: number
  partial?: number
  acquisition_failed?: number
  remaining_incomplete?: number
}

/** Describe only the durable result of a completed synchronization.
 *
 * Native may have to inspect legacy or duplicate candidates during Sync. Those
 * attempts are not failures when the final verification proves that no
 * incomplete conversation remains. In particular, never render the internal
 * attempt count as “could not be acquired” after a successful Sync.
 */
export function mailSyncNotice(result: MailSyncResult): string {
  const requested = Math.max(0, Number(result.acquisition_requested) || 0)
  const acquired = Math.max(0, Number(result.acquired_conversations) || 0)
  const remaining = Math.max(0, Number(result.remaining_incomplete) || 0)
  if (remaining > 0) {
    return `Synchronized the inbox, but ${remaining} conversation${remaining === 1 ? '' : 's'} still ${remaining === 1 ? 'does' : 'do'} not have complete content.`
  }
  if (acquired > 0) {
    return `Synchronized the inbox and acquired ${acquired} new or incomplete conversation${acquired === 1 ? '' : 's'}. All synchronized conversations now have complete content.`
  }
  if (requested > 0) {
    return `Synchronized the inbox and reconciled ${requested} previously incomplete conversation record${requested === 1 ? '' : 's'}. All synchronized conversations have complete content.`
  }
  return 'Inbox is up to date; all synchronized conversations already have complete email content.'
}

export type EmailIgnoreKind = 'sender' | 'domain' | 'body_substring'

export type EmailIgnorePreview = {
  kind: EmailIgnoreKind
  canonical_value: string
  display_value: string
  include_subdomains: boolean
  affected_count: number
}

export type EmailIgnoreRule = {
  rule_id: string
  scope_account_id: string
  kind: EmailIgnoreKind
  canonical_value: string
  display_value: string
  include_subdomains: boolean
  created_from_item_id: string | null
  created_at: number
  updated_at: number
}

export type EmailSourceItem = { source_item_id: string; source_acceptance_seq: number;
  content_state: 'preview' | 'partial' | 'rendered_complete' | 'raw_complete'; content_hash: string;
  provider: string; sender_address: string; sender_domain: string; occurred_at: number }
export type EmailParseResult = { parse_result_id: string; status: string; parser_id: string; parser_version: number;
  output_schema_version: string; data_summary: Record<string, any>; diagnostics: any[] }
export type EmailParserDefinition = { parser_id: string; display_name: string; version: number; output_schema_version: string;
  implementation_path: string; workspace_dir: string }
export type EmailParserTestResult = { source_item_id: string; parser_id: string; parser_version: number;
  output_schema_version: string; status: string; extracted: boolean; data: Record<string, any>; stages: any[];
  diagnostics: any[]; cached: boolean; email: EmailSourceContent }
export type SignalTypeDefinition = { name: string; schema_version: number; required: string[] }
export type SignalRule = { signal_rule_id: string; signal_rule_version_id: string; name: string; enabled: boolean;
  archived_at: number | null; version: number; conditions: SignalCondition[]; mappings: Record<string, SignalMapping>;
  signal_type: string; signal_type_schema_version: number; effective_after_source_seq: number; parser_ref: Record<string, any> }
export type SignalCondition = { path: string; operator: 'eq'|'neq'|'exists'|'contains'|'in'; value?: any }
export type SignalMapping = { kind: 'path'|'literal'; path?: string; value?: any }
export type SignalRuleDraft = { name: string; enabled: boolean; conditions: SignalCondition[]; mappings: Record<string, SignalMapping>;
  signal_type: string; signal_type_schema_version: number; parser_ref: Record<string, any>; source_scope?: Record<string, any>; emission_key?: Record<string, any> }
export type EmailAutomationPreview = { source: EmailSourceItem; parse_result: EmailParseResult; parsed_data: Record<string, any>;
  matching_rules: SignalRule[]; available_signal_types: SignalTypeDefinition[]; completion_required: boolean }

export type EmailParserChatContext = {
  parser: EmailParserDefinition
  message: Pick<MailMessageSummary, 'id' | 'sender' | 'sender_address' | 'subject' | 'date_received'>
  result: EmailParserTestResult
}

export type EmailParserChatSession = { chat_session_id: string }

export type EmailIgnoreResult = {
  rule: EmailIgnoreRule
  removed_message_ids: string[]
  removed_count: number
  suppressed_signal_count: number
}

type NativeResult = { ok?: boolean; error?: string; needs_login?: boolean }

function expectNative<T extends NativeResult>(result: T, fallback: string): T {
  if (!result?.ok) throw new MailSyncError(result?.error || fallback, !!result?.needs_login)
  return result
}

export class MailSyncError extends Error {
  constructor(message: string, readonly needsLogin = false) {
    super(message)
    this.name = 'MailSyncError'
  }
}

export const mailApi = {
  status: async (): Promise<MailStatus> => {
    const result = expectNative(
      await callNative('webMail.status', {}) as NativeResult & Partial<MailStatus>,
      'Could not read web-mail status',
    )
    return {
      logged_in: !!result.logged_in,
      gmail_access_suspended: !!result.gmail_access_suspended,
      legacy_automation_disabled: result.legacy_automation_disabled !== false,
      user_mediated_capture_available: !!result.user_mediated_capture_available,
      user_mediated_window_open: !!result.user_mediated_window_open,
      user_mediated_capture_revision: Math.max(0, Number(result.user_mediated_capture_revision) || 0),
      automatic_sync_running: !!result.automatic_sync_running,
      gmail_experiment_safety: result.gmail_experiment_safety,
      has_data: !!result.has_data,
      accounts: result.accounts || [],
      sync: result.sync || emptySync(),
    }
  },

  openUserMediatedCapture: async (): Promise<void> => {
    expectNative(
      await callNative('webMail.openUserMediatedCapture', {}) as NativeResult,
      'Could not open the visible Gmail capture window',
    )
  },

  synchroniseAllUnfetched: async (): Promise<void> => {
    expectNative(
      await callNative('webMail.synchroniseAllUnfetched', {}) as NativeResult,
      'Could not start automatic email synchronization',
    )
  },

  login: async (): Promise<void> => {
    throw new MailSyncError('Hidden Gmail login is disabled. Use Synchronise Emails.', false)
  },

  logout: async (): Promise<void> => {
    expectNative(await callNative('webMail.logout', {}) as NativeResult, 'Could not log out of web mail')
  },

  syncProgress: async (): Promise<MailSyncProgress> =>
    expectNative(
      await callNative('webMail.progress', {}) as NativeResult & MailSyncProgress,
      'Could not read email synchronization progress',
    ),

  sync: async (): Promise<MailSyncResult> => {
    throw new MailSyncError('Hidden Gmail Sync is disabled. Use Synchronise Emails.', false)
  },

  accounts: async (): Promise<MailAccount[]> => {
    const result = await call('email.surface.accounts.list', { account_id: 'gmail-web' }) as { accounts?: MailAccount[] }
    return result.accounts || []
  },

  messages: async (accountId: string | null, limit = 200): Promise<MailMessageSummary[]> => {
    const result = await call('email.surface.messages.list', {
      account_id: accountId || 'gmail-web', limit,
    }) as { messages?: MailMessageSummary[] }
    return result.messages || []
  },

  rendererListTrace: async (trace: MailRendererListTrace): Promise<void> => {
    await call('email.surface.renderer.list.trace', trace)
  },

  message: async (messageId: string): Promise<MailMessage> => {
    const result = await call('email.surface.message.get', { message_id: messageId }) as { message?: MailMessage }
    if (!result.message) throw new Error('Arbol did not return the requested email')
    return result.message
  },

  setRead: async (messageId: string, isRead: boolean): Promise<void> => {
    await call('email.surface.message.set_read', { message_id: messageId, is_read: isRead })
  },

  previewIgnore: async (messageId: string, kind: EmailIgnoreKind, value?: string): Promise<EmailIgnorePreview> =>
    await call('email.ignore.preview', { message_id: messageId, kind, ...(value ? { value } : {}) }) as EmailIgnorePreview,

  createIgnoreRule: async (messageId: string, kind: EmailIgnoreKind, value?: string): Promise<EmailIgnoreResult> =>
    await call('email.ignore.create', { message_id: messageId, kind, ...(value ? { value } : {}) }) as EmailIgnoreResult,

  automationPreview: async (surfaceMessageId: string): Promise<EmailAutomationPreview> =>
    await call('email.automation.preview', { surface_message_id: surfaceMessageId }) as EmailAutomationPreview,

  parsers: async (): Promise<EmailParserDefinition[]> => {
    const result = await call('email.parsers.list', {}) as { parsers?: EmailParserDefinition[] }
    return result.parsers || []
  },

  testParser: async (surfaceMessageId: string, parserId: string, sourceItemId?: string): Promise<EmailParserTestResult> =>
    await call('email.parsers.test', {
      surface_message_id: surfaceMessageId, parser_id: parserId,
      ...(sourceItemId ? { source_item_id: sourceItemId } : {}),
    }) as EmailParserTestResult,

  createParserChat: async (context: EmailParserChatContext): Promise<EmailParserChatSession> => {
    const titleSubject = context.message.subject.trim() || '(no subject)'
    const title = `Refine ${context.parser.display_name} Parser · ${titleSubject}`.slice(0, 240)
    let workspaceDir = context.parser.workspace_dir
    if (!workspaceDir) {
      const repos = await call('repos.list', {}) as { repos?: { name: string; path: string }[] }
      workspaceDir = repos.repos?.find((repo) => repo.name.toLocaleLowerCase() === 'arbol')?.path || ''
    }
    const created = await call('chat_session.create', {
      provider: 'claude', workspace_dirs: workspaceDir ? [workspaceDir] : [], title,
    }) as EmailParserChatSession
    if (!created.chat_session_id) throw new Error('Core did not return the new Chat Session')
    await call('chat_session.add_chat_note', {
      id: created.chat_session_id,
      text: emailParserChatNote(context),
      surface: { kind: 'ui', name: 'willo.email_parser_test' },
    })
    return created
  },

  signalRules: async (): Promise<SignalRule[]> => {
    const result = await call('email.signal_rules.list', { include_archived: true }) as { rules?: SignalRule[] }
    return result.rules || []
  },
  createSignalRule: async (draft: SignalRuleDraft): Promise<SignalRule> =>
    (await call('email.signal_rules.create', { draft }) as { rule: SignalRule }).rule,
  updateSignalRule: async (signalRuleId: string, draft: SignalRuleDraft): Promise<SignalRule> =>
    (await call('email.signal_rules.update', { signal_rule_id: signalRuleId, draft }) as { rule: SignalRule }).rule,
  setSignalRuleEnabled: async (signalRuleId: string, enabled: boolean): Promise<SignalRule> =>
    (await call('email.signal_rules.set_enabled', { signal_rule_id: signalRuleId, enabled }) as { rule: SignalRule }).rule,
  archiveSignalRule: async (signalRuleId: string): Promise<SignalRule> =>
    (await call('email.signal_rules.archive', { signal_rule_id: signalRuleId }) as { rule: SignalRule }).rule,
  restoreSignalRule: async (signalRuleId: string): Promise<SignalRule> =>
    (await call('email.signal_rules.restore', { signal_rule_id: signalRuleId }) as { rule: SignalRule }).rule,
  testSignalRule: async (sourceItemId: string, draft: SignalRuleDraft): Promise<{ matched: boolean; signal: any }> =>
    await call('email.signal_rules.test', { source_item_id: sourceItemId, draft }) as { matched: boolean; signal: any },

  ignoreRules: async (): Promise<EmailIgnoreRule[]> => {
    const result = await call('email.ignore.list', {}) as { rules?: EmailIgnoreRule[] }
    return result.rules || []
  },

  deleteIgnoreRule: async (ruleId: string): Promise<void> => {
    await call('email.ignore.delete', { rule_id: ruleId })
  },

  sourceContents: async (messageId: string): Promise<EmailSourceContent[]> => {
    const result = await call('email.source.contents.list', { surface_message_id: messageId }) as { messages?: EmailSourceContent[] }
    return result.messages || []
  },

  acquire: async (messageId: string, remoteUrl: string): Promise<MailAcquisitionResult> =>
    expectNative(await callNative('webMail.enrich', { surface_message_id: messageId, url: remoteUrl }) as NativeResult & MailAcquisitionResult,
      'Could not acquire this Gmail conversation'),

  enrich: async (messageId: string, remoteUrl: string): Promise<void> => {
    await mailApi.acquire(messageId, remoteUrl)
  },

  identityDiagnostic: async (messageId: string, expectedThreadCount = 0,
    commandId = crypto.randomUUID().toLowerCase(), rendererSequence = 0): Promise<MailAcquisitionResult> => {
    const trace = async (stage: string, outcome: string) => {
      try {
        await call('email.surface.acquisition.trace', {
          attempt_id: commandId, command_id: commandId, trigger: 'force_refetch_identity_dry',
          stage, outcome, surface_message_id: messageId, renderer_sequence: rendererSequence,
          renderer_expected_count: Math.max(0, expectedThreadCount),
        })
      } catch { /* diagnostics must not block the native command */ }
    }
    await trace('renderer_command_started', 'started')
    try {
      const result = expectNative(
        await callNative('webMail.identityDiagnostic', {
          surface_message_id: messageId, expected_thread_count: expectedThreadCount,
          command_id: commandId, renderer_sequence: rendererSequence,
        }) as NativeResult & MailAcquisitionResult,
        'Could not run the bounded Gmail identity diagnostic',
      )
      await trace('renderer_command_completed', 'succeeded')
      return result
    } catch (error) {
      await trace('renderer_command_completed', 'failed')
      throw error
    }
  },

  countDiagnostic: async (messageId: string, expectedThreadCount = 0,
    commandId = crypto.randomUUID().toLowerCase(), rendererSequence = 0): Promise<MailAcquisitionResult> => {
    const trace = async (stage: string, outcome: string) => {
      try {
        await call('email.surface.acquisition.trace', {
          attempt_id: commandId, command_id: commandId, trigger: 'force_refetch_count_dry',
          stage, outcome, surface_message_id: messageId, renderer_sequence: rendererSequence,
          renderer_expected_count: Math.max(0, expectedThreadCount),
        })
      } catch { /* diagnostics must not block the native command */ }
    }
    await trace('renderer_command_started', 'started')
    try {
      const result = expectNative(
        await callNative('webMail.countDiagnostic', {
          surface_message_id: messageId, expected_thread_count: expectedThreadCount,
          command_id: commandId, renderer_sequence: rendererSequence,
        }) as NativeResult & MailAcquisitionResult,
        'Could not run the bounded Gmail count diagnostic',
      )
      await trace('renderer_command_completed', 'succeeded')
      return result
    } catch (error) {
      await trace('renderer_command_completed', 'failed')
      throw error
    }
  },

  viewportDiagnostic: async (messageId: string, remoteUrl: string, expectedThreadCount = 0,
    commandId = crypto.randomUUID().toLowerCase(), rendererSequence = 0): Promise<MailAcquisitionResult> => {
    const trace = async (stage: string, outcome: string) => {
      try {
        await call('email.surface.acquisition.trace', {
          attempt_id: commandId, command_id: commandId, trigger: 'force_refetch_scroll_dry',
          stage, outcome, surface_message_id: messageId, renderer_sequence: rendererSequence,
          renderer_expected_count: Math.max(0, expectedThreadCount),
        })
      } catch { /* diagnostics must not block the native command */ }
    }
    await trace('renderer_command_started', 'started')
    try {
      const result = expectNative(
        await callNative('webMail.viewportDiagnostic', {
          surface_message_id: messageId, url: remoteUrl,
          expected_thread_count: expectedThreadCount, command_id: commandId,
          renderer_sequence: rendererSequence,
        }) as NativeResult & MailAcquisitionResult,
        'Could not run the bounded Gmail viewport diagnostic',
      )
      await trace('renderer_command_completed', 'succeeded')
      return result
    } catch (error) {
      await trace('renderer_command_completed', 'failed')
      throw error
    }
  },

  forceRefetch: async (messageId: string, remoteUrl: string, expectedThreadCount = 0,
    commandId = crypto.randomUUID().toLowerCase(), rendererSequence = 0): Promise<MailAcquisitionResult> => {
    const trace = async (stage: string, outcome: string) => {
      try {
        await call('email.surface.acquisition.trace', {
          attempt_id: commandId, command_id: commandId, trigger: 'force_refetch',
          stage, outcome, surface_message_id: messageId, renderer_sequence: rendererSequence,
          renderer_expected_count: Math.max(0, expectedThreadCount),
        })
      } catch { /* diagnostics must not block the native command */ }
    }
    await trace('renderer_command_started', 'started')
    try {
      const result = expectNative(
        await callNative('webMail.forceRefetch', {
          surface_message_id: messageId, url: remoteUrl,
          expected_thread_count: expectedThreadCount, command_id: commandId,
          renderer_sequence: rendererSequence,
        }) as NativeResult & MailAcquisitionResult,
        'Could not force refetch this Gmail conversation',
      )
      await trace('renderer_command_completed', 'succeeded')
      return result
    } catch (error) {
      await trace('renderer_command_completed', 'failed')
      throw error
    }
  },

  open: async (remoteUrl: string): Promise<void> => {
    expectNative(
      await callNative('webMail.open', { url: remoteUrl }) as NativeResult,
      'This email cannot be opened in web mail',
    )
  },
}

function emptySync(): MailSync {
  return { account_id: 'gmail-web', status: 'never_started', error: null,
    last_attempt_at: null, last_synced_at: null, message_count: 0, updated_at: null }
}

export function mailMessageKey(message: Pick<MailMessageSummary, 'id'>): string {
  return message.id
}

export function senderName(sender: string): string {
  const trimmed = sender.trim()
  const quoted = trimmed.match(/^"([^"]+)"\s*</)
  if (quoted) return quoted[1].trim()
  const bracketed = trimmed.match(/^([^<]+)\s*</)
  if (bracketed) return bracketed[1].trim()
  const address = trimmed.match(/<?([^<>\s]+@[^<>\s]+)>?/)
  return (address?.[1] || trimmed || 'Unknown sender').split('@')[0]
}

export function senderAddress(sender: string): string {
  const bracketed = sender.match(/<([^>]+)>/)
  if (bracketed) return bracketed[1].trim()
  const address = sender.match(/[^<>\s]+@[^<>\s]+/)
  return address?.[0] || sender.trim()
}

export function messagePreview(body: string, maxLength = 180): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}



export const CHAT_NOTE_CLIPBOARD_HEADER = '### Chat Note ###'

export function emailParserChatNoteClipboard(context: EmailParserChatContext): string {
  return `${CHAT_NOTE_CLIPBOARD_HEADER}
${emailParserChatNote(context)}`
}

export function emailParserChatNote(context: EmailParserChatContext): string {
  const { parser, message, result } = context
  const parserLocation = parser.implementation_path || '(implementation path unavailable)'
  return [
    '# Email Parser test context',
    '',
    'This Chat Note was created from Willo’s **Test Parser** popup. It contains the exact normalized email input and Parse Result used by the test. Use it to help the user analyze and refine the Parser implementation. Do not treat this note itself as a request to modify code; wait for the user’s message.',
    '',
    '## Parser',
    '',
    `- Display name: ${parser.display_name}`,
    `- Parser ID: \`${parser.parser_id}\``,
    `- Parser version: \`${parser.version}\``,
    `- Output schema version: \`${parser.output_schema_version}\``,
    `- Implementation: \`${parserLocation}\``,
    '',
    '## Email',
    '',
    `- Willo message ID: \`${message.id}\``,
    `- Source Item ID: \`${result.source_item_id}\``,
    `- From: ${message.sender || message.sender_address}`,
    `- Subject: ${message.subject || '(no subject)'}`,
    `- Received at: ${message.date_received ? new Date(message.date_received).toISOString() : '(unknown)'}`,
    `- Content state: \`${result.email.content_state}\``,
    '',
    '### Normalized email input',
    '',
    '```json',
    JSON.stringify(result.email, null, 2),
    '```',
    '',
    '## Parsing result',
    '',
    `- Status: \`${result.status}\``,
    `- Extracted data: ${result.extracted ? 'yes' : 'no'}`,
    `- Cache: ${result.cached ? 'cached result' : 'fresh run'}`,
    '',
    '### Extracted data',
    '',
    '```json',
    JSON.stringify(result.data, null, 2),
    '```',
    '',
    '### Parser stages',
    '',
    '```json',
    JSON.stringify(result.stages, null, 2),
    '```',
    '',
    '### Diagnostics',
    '',
    '```json',
    JSON.stringify(result.diagnostics, null, 2),
    '```',
  ].join('\n')
}
