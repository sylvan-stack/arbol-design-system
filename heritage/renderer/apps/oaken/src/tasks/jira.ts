import { call, callNative } from '@arbol/design-system'

export type JiraSection = 'ticket' | 'epic' | 'trc' | 'sprint' | 'release'

export type JiraHistoryChange = {
  at: string
  from: string
  to: string
}

export type JiraEditableFields = {
  /** Repository name from repos.list. Required before a ticket can start a chat. */
  repository: string
  title: string
  description: string
  assignee: string
  jiraStatus: string
  arbolStatus: string
  statusCategory: string
  issueType: string
  jiraDueDate: string
  updated: string
  url: string
  section: JiraSection
}

export type JiraItem = {
  key: string
  url: string
  title: string
  description: string
  assignee: string
  /** All known Jira identities plus assignee-history values. */
  assigneeIdentities: string[]
  assigneeHistory: JiraHistoryChange[]
  /** Status reported by Jira. */
  jiraStatus: string
  /** Optional Arbol-owned override. */
  arbolStatus: string
  /** Effective display status: Arbol status when set, otherwise Jira status. */
  status: string
  statusCategory: string
  statusHistory: JiraHistoryChange[]
  issueType: string
  /** Jira-owned due-date metadata. Display-only: never becomes an Arbol Wall. */
  jiraDueDate: string
  updated: string
  section: JiraSection
  /** Kept for diagnostics, but mirror paths/content must never be rendered. */
  sourcePath: string
  /** True when a missing inner artifact was normalized from the raw mirror in memory. */
  convertedFromRaw: boolean
  /** Arbol-owned visibility override. Ignored tickets are omitted from task lists. */
  ignored: boolean
  /** Archived tickets stay available on demand, but are never fetched again. */
  archived: boolean
  /** User-authored field values. They win over refreshed Jira data. */
  overrides: Partial<JiraEditableFields>
  /** Last known Jira values, retained so an override never hides its source. */
  jiraValues: JiraEditableFields
}

export type JiraLoadResult = {
  items: JiraItem[]
  skipped: number
  stored: number
  converted: number
  warnings: string[]
}

export type JiraPipelineLog = {
  at: string
  stage: string
  level: 'info' | 'warning' | 'error'
  message: string
  /** Absolute local file to reveal in Finder when this log entry is activated. */
  filePath?: string
}

export type JiraFetchResult = {
  message: string
  repository: string
  logs: JiraPipelineLog[]
}

export type JiraFetchMyTicketsResult = {
  matched: number
  archived: number
  fetched: number
  failed: number
  failures: { key: string; error: string }[]
  logs: JiraPipelineLog[]
  message: string
}

type ArtifactNode = {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: ArtifactNode[]
}

type ArtifactTree = { root: string; tree: ArtifactNode[] }
type ArtifactFile = { path: string; exists: boolean; content: string }
type ArtifactFiles = { files: ArtifactFile[] }
type UnknownRecord = Record<string, unknown>
type RpcCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>
type MirrorPair = { json?: string; md?: string }

// `repo` maps directly to ~/Artifacts/<repo>. The slash is intentional:
// mirrors live at ~/Artifacts/mirrors/jira, not ~/Artifacts/jira-mirror.
export const JIRA_CORPUS = 'jira'
export const JIRA_MIRROR_CORPUS = 'mirrors/jira'
const ISSUE_FILE = /^([A-Za-z][A-Za-z0-9]*-\d+)\.(json|md)$/i
const ISSUE_PREFIX = /^([A-Za-z][A-Za-z0-9]*-\d+)(?:[-_.]|$)/i

/**
 * Arbol is currently a local single-user app and has no user-profile RPC.
 * Keep every stable Jira representation here until identity moves to settings.
 */
export const MY_JIRA_IDENTITIES = [
  'Alex River',
  'alex.river',
  'alex.river@example.test',
  'JIRAUSER10001',
]

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

let jiraPipelineLogs: JiraPipelineLog[] = []

function pipelineLogs(value: unknown): JiraPipelineLog[] {
  return records(value).map((entry) => ({
    at: text(entry.at) || new Date().toISOString(),
    stage: text(entry.stage) || 'pipeline',
    level: text(entry.level) === 'error' ? 'error' : text(entry.level) === 'warning' ? 'warning' : 'info',
    message: text(entry.message),
    ...(text(entry.file_path) ? { filePath: text(entry.file_path) } : {}),
  })).filter((entry) => entry.message)
}

export function jiraFetchLogSnapshot(): JiraPipelineLog[] {
  return [...jiraPipelineLogs]
}

export function addJiraFetchLog(stage: string, message: string, level: JiraPipelineLog['level'] = 'info'): JiraPipelineLog[] {
  jiraPipelineLogs = [...jiraPipelineLogs, { at: new Date().toISOString(), stage, level, message }].slice(-500)
  return jiraFetchLogSnapshot()
}

export function rememberJiraFetchLogs(logs: JiraPipelineLog[]): JiraPipelineLog[] {
  jiraPipelineLogs = [...jiraPipelineLogs, ...logs].slice(-500)
  return jiraFetchLogSnapshot()
}

export function clearJiraFetchLogs(): JiraPipelineLog[] {
  jiraPipelineLogs = []
  return []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value)
    if (result) return result
  }
  return ''
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const normalized = normalizeIdentity(value)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function issueKeyFromPath(sourcePath: string): string {
  for (const part of sourcePath.split('/').reverse()) {
    const exact = ISSUE_FILE.exec(part)?.[1]
    const prefix = ISSUE_PREFIX.exec(part)?.[1]
    if (exact || prefix) return (exact || prefix || '').toUpperCase()
  }
  return ''
}

function jiraBrowseUrl(self: string, key: string): string {
  if (!self) return ''
  try {
    const url = new URL(self)
    return `${url.origin}/browse/${encodeURIComponent(key)}`
  } catch {
    return ''
  }
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function adfText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(adfText).join('')
  const node = record(value)
  const type = text(node.type)
  if (type === 'text') return text(node.text)
  if (type === 'hardBreak') return '\n'
  const inner = adfText(node.content)
  return /^(paragraph|heading|blockquote|listItem|bulletList|orderedList|codeBlock)$/.test(type)
    ? `${inner}\n`
    : inner
}

function descriptionText(value: unknown): string {
  if (typeof value === 'string') return value
  return adfText(value)
}

function plainDescription(value: string): string {
  if (!value) return ''
  return htmlToText(value)
    .replace(/\r\n?/g, '\n')
    .replace(/^h[1-6]\.\s*/gm, '')
    .replace(/\[([^\]|]+)\|([^\]]+)]/g, '$1 ($2)')
    .replace(/\{(?:code(?::[^}]*)?|noformat)}([\s\S]*?)\{(?:code|noformat)}/gi, '$1')
    .replace(/\{\{([^}]+)}}/g, '$1')
    .replace(/\{\*}|\{_}|\{\^}|\{color(?::[^}]*)?}/gi, '')
    .replace(/\{color}/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function classifyJiraItem(issueType: string, key: string): JiraSection {
  const type = issueType.toLocaleLowerCase()
  const project = key.split('-', 1)[0]?.toLocaleLowerCase() ?? ''
  if (type.includes('epic')) return 'epic'
  if (type.includes('release')) return 'release'
  if (type.includes('sprint')) return 'sprint'
  if (type === 'trc' || type.includes('trc ticket') || project === 'trc') return 'trc'
  return 'ticket'
}

function historyChanges(root: UnknownRecord, fieldName: string): JiraHistoryChange[] {
  const changes: JiraHistoryChange[] = []
  const histories = records(record(root.changelog).histories)
  for (const history of histories) {
    for (const item of records(history.items)) {
      if (text(item.field).toLocaleLowerCase() !== fieldName.toLocaleLowerCase()) continue
      changes.push({
        at: text(history.created),
        from: firstText(item.fromString, item.from),
        to: firstText(item.toString, item.to),
      })
    }
  }
  return changes.sort((a, b) => a.at.localeCompare(b.at))
}

function userIdentities(user: UnknownRecord): string[] {
  return uniqueText([
    text(user.displayName),
    text(user.name),
    text(user.emailAddress),
    text(user.key),
  ])
}

function effectiveStatus(jiraStatus: string, arbolStatus: string): string {
  return arbolStatus || jiraStatus || 'Unknown'
}

/** Return the display value Jira uses for a select, project, or text field. */
function jiraRepositoryValue(value: unknown): string {
  if (typeof value === 'string') return text(value)
  if (Array.isArray(value)) return firstText(...value.map(jiraRepositoryValue))
  const item = record(value)
  return firstText(item.name, item.value, item.key, item.displayName)
}

/**
 * Jira always includes its project in the issue JSON. Some Jira installations
 * additionally expose a dedicated Repository custom field; its field ID is
 * installation-specific, so resolve it through the names map before falling
 * back to the canonical project value.
 */
const REPOSITORY_ALIASES: [RegExp, string][] = [
  [/(?:^|[^a-z0-9])arbol(?:[^a-z0-9]|$)/i, 'Arbol'],
  [/(?:^|[^a-z0-9])mycel(?:[^a-z0-9]|$)/i, 'mycel'],
  [/(?:^|[^a-z0-9])universe(?:[^a-z0-9]|$)/i, 'universe'],
  [/(?:^|[^a-z0-9])infer(?:[^a-z0-9]|$)/i, 'infer'],
  [/(?:^|[^a-z0-9])blueprint(?:[^a-z0-9]|$)/i, 'blueprint'],
]

function repositoryAlias(value: unknown): string {
  const candidate = jiraRepositoryValue(value)
  for (const [pattern, repository] of REPOSITORY_ALIASES) {
    if (pattern.test(candidate)) return repository
  }
  return ''
}

function repositoryFromTitle(title: string): string {
  return repositoryAlias(title)
}

/** Infer a code repository, never a Jira project, from the complete raw issue. */
function repositoryFromRaw(root: UnknownRecord, fields: UnknownRecord): string {
  const names = record(root.names)
  // Installation-specific repository fields are authoritative. Preserve an
  // unknown explicit value so repos.list can diagnose it rather than silently
  // routing the ticket to an unrelated checkout.
  for (const [fieldId, label] of Object.entries(names)) {
    if (!/^(?:repository|repo|codebase|unleash project)$/i.test(text(label))) continue
    const explicit = jiraRepositoryValue(fields[fieldId])
    if (explicit) return repositoryAlias(explicit) || explicit
  }
  const explicit = firstText(
    jiraRepositoryValue(fields.repository), jiraRepositoryValue(fields.repo),
    jiraRepositoryValue(root.repository),
  )
  if (explicit) return repositoryAlias(explicit) || explicit

  // Jira project names are not repository names. Search the raw provider
  // payload instead: team resources, linked-issue summaries, descriptions, and
  // other custom fields carry the repository signal. JSON.stringify
  // intentionally covers nested values and Jira custom fields. The ticket's
  // own title is scanned last so any signal in the rest of the payload
  // outranks it.
  const raw = JSON.stringify({ ...root, summary: undefined, fields: { ...fields, summary: undefined } })
  for (const [pattern, repository] of REPOSITORY_ALIASES) {
    if (pattern.test(raw)) return repository
  }
  return repositoryFromTitle(firstText(jiraRepositoryValue(fields.summary), jiraRepositoryValue(root.summary)))
}

const EDITABLE_KEYS: (keyof JiraEditableFields)[] = [
  'repository', 'title', 'description', 'assignee', 'jiraStatus', 'arbolStatus', 'statusCategory',
  'issueType', 'jiraDueDate', 'updated', 'url', 'section',
]

export function editableJiraFields(item: JiraItem): JiraEditableFields {
  return Object.fromEntries(EDITABLE_KEYS.map((key) => [key, item[key]])) as JiraEditableFields
}

function applyJiraOverrides(item: JiraItem, overrides: Partial<JiraEditableFields>): JiraItem {
  const valid: Partial<JiraEditableFields> = {}
  for (const key of EDITABLE_KEYS) {
    const value = overrides[key]
    if (typeof value === 'string') (valid as Record<string, string>)[key] = value
  }
  const effective = { ...item, ...valid, overrides: valid }
  effective.status = effective.arbolStatus || effective.jiraStatus || 'Unknown'
  return effective
}

function initialJiraValues(fields: JiraEditableFields): JiraEditableFields {
  return { ...fields }
}

export function jiraItemFromRaw(content: string, sourcePath: string): JiraItem {
  const envelope = record(JSON.parse(content))
  // Quick Input mirrors wrap the provider response in `payload` so provenance
  // can live beside the untouched Jira object. Older mirrors contain the Jira
  // object directly; normalize both shapes identically.
  const payload = record(envelope.payload)
  const root = Object.keys(payload).length ? payload : envelope
  const fields = record(root.fields)
  const assignee = record(fields.assignee)
  const status = record(fields.status)
  const statusCategory = record(status.statusCategory)
  const issueType = record(fields.issuetype)
  const key = firstText(root.key, envelope.issue_key, issueKeyFromPath(sourcePath)).toUpperCase()
  if (!key) throw new Error(`Jira mirror has no issue key: ${sourcePath}`)

  const self = text(root.self)
  const typeName = firstText(issueType.name, fields.issueType, 'Jira ticket')
  const description = descriptionText(fields.description)
    || descriptionText(record(root.renderedFields).description)
  const assigneeName = firstText(assignee.displayName, assignee.name, assignee.emailAddress, 'Unassigned')
  const assigneeHistory = historyChanges(root, 'assignee')
  const jiraStatus = firstText(status.name, fields.status, 'Unknown')
  const statusHistory = historyChanges(root, 'status')
  const jiraDueDate = firstText(fields.duedate, fields.dueDate)
  const editable: JiraEditableFields = {
    repository: repositoryFromRaw(root, fields),
    title: firstText(fields.summary, root.summary, 'Untitled Jira ticket'),
    description: plainDescription(description), assignee: assigneeName, jiraStatus,
    arbolStatus: '', statusCategory: firstText(statusCategory.key, statusCategory.name),
    issueType: typeName, jiraDueDate,
    updated: firstText(fields.updated, root.updated, envelope.fetched_at),
    url: firstText(fields.url, envelope.source_url, jiraBrowseUrl(self, key)),
    section: classifyJiraItem(typeName, key),
  }
  return {
    key,
    repository: editable.repository,
    url: editable.url,
    title: editable.title,
    description: editable.description,
    assignee: editable.assignee,
    assigneeIdentities: uniqueText([
      ...userIdentities(assignee),
      ...assigneeHistory.flatMap((change) => [change.from, change.to]),
    ]),
    assigneeHistory,
    jiraStatus: editable.jiraStatus,
    arbolStatus: editable.arbolStatus,
    status: effectiveStatus(editable.jiraStatus, editable.arbolStatus),
    statusCategory: editable.statusCategory,
    statusHistory,
    issueType: editable.issueType,
    jiraDueDate: editable.jiraDueDate,
    updated: editable.updated,
    section: editable.section,
    sourcePath,
    convertedFromRaw: true,
    ignored: false,
    archived: false,
    overrides: {},
    jiraValues: initialJiraValues(editable),
  }
}

function unquoteYaml(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'null' || trimmed === '~') return ''
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return String(JSON.parse(trimmed)) } catch { return trimmed.slice(1, -1) }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'")
  return trimmed
}

function markdownParts(content: string): { frontmatter: Record<string, string>; body: string } {
  const normalized = content.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, body: normalized }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: {}, body: normalized }
  const frontmatter: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (match) frontmatter[match[1]] = unquoteYaml(match[2])
  }
  return { frontmatter, body: normalized.slice(end + 5) }
}

function frontmatterText(frontmatter: Record<string, string>, ...names: string[]): string {
  const wanted = new Set(names.map((name) => name.toLocaleLowerCase()))
  for (const [key, value] of Object.entries(frontmatter)) {
    if (wanted.has(key.toLocaleLowerCase()) && value) return value
  }
  return ''
}

function namedSection(body: string, names: string[]): string {
  const lines = body.split('\n')
  const wanted = new Set(names.map((name) => name.toLocaleLowerCase()))
  const start = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    return Boolean(match && wanted.has(match[1].toLocaleLowerCase()))
  })
  if (start < 0) return ''
  let end = start + 1
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) end += 1
  return lines.slice(start + 1, end).join('\n').trim()
}

function markdownDescription(body: string): string {
  // Inner Jira artifacts currently use "Statement" while mirror Markdown uses
  // "Description". Supporting both keeps this adapter independent of the final
  // inner ticket schema, which will be defined separately.
  const preferred = namedSection(body, ['Statement', 'Description'])
  if (preferred) return plainDescription(preferred)
  return plainDescription(body.replace(/^#\s+[^\n]+\n?/, ''))
}

function markdownArbolStatus(frontmatter: Record<string, string>, body: string): string {
  const fromFrontmatter = frontmatterText(
    frontmatter,
    'arbol_status',
    'arbol-status',
    'arbol_internal_status',
    'arbol-internal-status',
  )
  if (fromFrontmatter) return fromFrontmatter
  const internals = namedSection(body, ['Arbol Internals'])
  return /^\s*(?:[-*]\s*)?(?:Arbol\s+)?status\s*:\s*(.+?)\s*$/im.exec(internals)?.[1]?.trim() ?? ''
}

function commaSeparated(value: string): string[] {
  if (!value) return []
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((entry) => text(entry)).filter(Boolean)
    } catch { /* use the comma-separated fallback */ }
  }
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function jiraItemFromMarkdown(content: string, sourcePath: string): JiraItem {
  const { frontmatter, body } = markdownParts(content)
  const heading = /^#\s+([^\n]+)$/m.exec(body)?.[1]?.trim() ?? ''
  const headingKey = /^([A-Za-z][A-Za-z0-9]*-\d+)/.exec(heading)?.[1]
  const key = firstText(frontmatterText(frontmatter, 'key'), issueKeyFromPath(sourcePath), headingKey).toUpperCase()
  if (!key) throw new Error(`Jira artifact has no issue key: ${sourcePath}`)
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const headingTitle = heading.replace(new RegExp(`^${escapedKey}\\s*(?::|—|–|-)\\s*`, 'i'), '')
  const typeName = firstText(
    frontmatterText(frontmatter, 'issue_type', 'issuetype', 'type'),
    'Jira ticket',
  )
  const assignee = firstText(frontmatterText(frontmatter, 'assignee'), 'Unassigned')
  const jiraStatus = firstText(frontmatterText(frontmatter, 'jira_status', 'jira-status', 'status'), 'Unknown')
  const arbolStatus = markdownArbolStatus(frontmatter, body)
  const jiraDueDate = frontmatterText(
    frontmatter, 'jira_due_date', 'jira-due-date', 'due_date', 'due-date', 'duedate',
  )
  const editable: JiraEditableFields = {
    repository: frontmatterText(frontmatter, 'repository', 'repo'),
    url: frontmatterText(frontmatter, 'url'),
    title: firstText(frontmatterText(frontmatter, 'summary'), headingTitle, 'Untitled Jira ticket'),
    description: markdownDescription(body), assignee, jiraStatus, arbolStatus,
    statusCategory: '', issueType: typeName, jiraDueDate,
    updated: frontmatterText(frontmatter, 'updated'), section: classifyJiraItem(typeName, key),
  }
  return {
    key,
    repository: editable.repository,
    url: editable.url,
    title: editable.title,
    description: editable.description,
    assignee: editable.assignee,
    assigneeIdentities: uniqueText([
      assignee,
      ...commaSeparated(frontmatterText(frontmatter, 'assignee_history', 'assignee-history')),
    ]),
    assigneeHistory: [],
    jiraStatus: editable.jiraStatus,
    arbolStatus: editable.arbolStatus,
    status: effectiveStatus(editable.jiraStatus, editable.arbolStatus),
    statusCategory: editable.statusCategory,
    statusHistory: [],
    issueType: editable.issueType,
    jiraDueDate: editable.jiraDueDate,
    updated: editable.updated,
    section: editable.section,
    sourcePath,
    convertedFromRaw: false,
    ignored: /^(?:true|yes|1)$/i.test(frontmatterText(frontmatter, 'arbol_ignored', 'arbol-ignored')),
    archived: /^(?:true|yes|1)$/i.test(frontmatterText(frontmatter, 'arbol_archived', 'arbol-archived')),
    overrides: {},
    jiraValues: initialJiraValues(editable),
  }
}

function collectStoredTicketFiles(nodes: ArtifactNode[], result: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'dir') {
      collectStoredTicketFiles(node.children ?? [], result)
      continue
    }
    // `ticket.md` is the current inner artifact. Also accept a direct KEY.md so
    // a future, flatter inner format does not require another loader rewrite.
    if (node.name.toLocaleLowerCase() === 'ticket.md'
      || (ISSUE_FILE.test(node.name) && node.name.toLocaleLowerCase().endsWith('.md'))) {
      result.push(node.path)
    }
  }
  return result
}

function collectInternalTicketKeys(nodes: ArtifactNode[], marker: 'ignored.md' | 'archived.md', result: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.type === 'dir') {
      collectInternalTicketKeys(node.children ?? [], marker, result)
      continue
    }
    // Markers live separately from normalized Jira files, so normalization can
    // never undo an Arbol-owned lifecycle decision.
    if (node.name.toLocaleLowerCase() !== marker) continue
    const key = issueKeyFromPath(node.path)
    if (key && node.path.split('/').some((part) => part.toLocaleLowerCase() === '_arbol-internals')) result.add(key)
  }
  return result
}

function collectOverrideFiles(nodes: ArtifactNode[], result: Map<string, string> = new Map()): Map<string, string> {
  for (const node of nodes) {
    if (node.type === 'dir') { collectOverrideFiles(node.children ?? [], result); continue }
    if (node.name.toLocaleLowerCase() !== 'overrides.json') continue
    const key = issueKeyFromPath(node.path)
    if (key && node.path.split('/').some((part) => part.toLocaleLowerCase() === '_arbol-internals')) result.set(key, node.path)
  }
  return result
}

function collectMirrorIssueFiles(nodes: ArtifactNode[], result: Map<string, MirrorPair> = new Map()): Map<string, MirrorPair> {
  for (const node of nodes) {
    if (node.type === 'dir') {
      collectMirrorIssueFiles(node.children ?? [], result)
      continue
    }
    const match = ISSUE_FILE.exec(node.name)
    if (!match) continue
    const key = match[1].toUpperCase()
    const pair = result.get(key) ?? {}
    if (match[2].toLocaleLowerCase() === 'json') pair.json = node.path
    else pair.md = node.path
    result.set(key, pair)
  }
  return result
}

async function readArtifacts(corpus: string, paths: string[], rpc: RpcCall): Promise<Map<string, string>> {
  if (!paths.length) return new Map()
  const result = await rpc('artifacts.read_many', { paths, repo: corpus }) as ArtifactFiles
  return new Map(result.files
    .filter((file) => file.exists)
    .map((file) => [file.path, file.content]))
}

function loadStored(path: string, contents: Map<string, string>): JiraItem {
  const content = contents.get(path)
  if (content === undefined) throw new Error(`${path} no longer exists`)
  return jiraItemFromMarkdown(content, path)
}

function loadMirror(pair: MirrorPair, contents: Map<string, string>): JiraItem {
  // JSON is the raw source of truth. Markdown is only a compatibility fallback
  // for older mirror entries that do not have its JSON companion. In either
  // case it is normalized into JiraItem and no mirror content/path reaches UI.
  if (pair.json) {
    try {
      const content = contents.get(pair.json)
      if (content === undefined) throw new Error(`${pair.json} no longer exists`)
      return jiraItemFromRaw(content, pair.json)
    }
    catch (rawError) {
      if (!pair.md) throw rawError
    }
  }
  if (pair.md) {
    const converted = jiraItemFromMarkdown(
      contents.get(pair.md) ?? (() => { throw new Error(`${pair.md} no longer exists`) })(), pair.md)
    return { ...converted, convertedFromRaw: true }
  }
  throw new Error('Jira mirror entry has no source file')
}

function preferNewest(byKey: Map<string, JiraItem>, item: JiraItem): void {
  const previous = byKey.get(item.key)
  if (!previous) { byKey.set(item.key, item); return }
  // A ticket workspace's authored ticket.md owns Arbol Internals and curated
  // prose. Quick Input also writes a flat KEY.md projection; fetching must not
  // let that derived file replace the richer inner artifact. Jira-owned fields
  // are refreshed from the raw mirror later in mergeStoredWithMirror().
  const previousAuthored = previous.sourcePath.toLocaleLowerCase().endsWith('/ticket.md')
  const itemAuthored = item.sourcePath.toLocaleLowerCase().endsWith('/ticket.md')
  if (previousAuthored !== itemAuthored) {
    if (itemAuthored) byKey.set(item.key, item)
    return
  }
  if (item.updated > previous.updated) byKey.set(item.key, item)
}

function mergeStoredWithMirror(stored: JiraItem, mirror: JiraItem): JiraItem {
  const jiraStatus = mirror.jiraStatus || stored.jiraStatus
  const arbolStatus = stored.arbolStatus
  return {
    ...stored,
    // Authored title/description and Arbol fields stay internal. Jira-owned
    // fields and histories come from the raw mirror after normalization.
    url: stored.url || mirror.url,
    assignee: mirror.assignee || stored.assignee,
    assigneeIdentities: uniqueText([
      ...stored.assigneeIdentities,
      ...mirror.assigneeIdentities,
      stored.assignee,
      mirror.assignee,
    ]),
    assigneeHistory: mirror.assigneeHistory.length ? mirror.assigneeHistory : stored.assigneeHistory,
    jiraStatus,
    arbolStatus,
    status: effectiveStatus(jiraStatus, arbolStatus),
    statusCategory: mirror.statusCategory || stored.statusCategory,
    statusHistory: mirror.statusHistory.length ? mirror.statusHistory : stored.statusHistory,
    issueType: stored.issueType === 'Jira ticket' ? mirror.issueType : stored.issueType,
    jiraDueDate: mirror.jiraDueDate || stored.jiraDueDate,
    updated: mirror.updated || stored.updated,
    section: stored.issueType === 'Jira ticket' ? mirror.section : stored.section,
    jiraValues: initialJiraValues(editableJiraFields(mirror)),
  }
}

export function normalizeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function isMyJiraItem(item: JiraItem, identities: string[] = MY_JIRA_IDENTITIES): boolean {
  const mine = new Set(identities.map(normalizeIdentity).filter(Boolean))
  const candidates = uniqueText([
    item.assignee,
    ...item.assigneeIdentities,
    ...item.assigneeHistory.flatMap((change) => [change.from, change.to]),
  ])
  return candidates.some((candidate) => mine.has(normalizeIdentity(candidate)))
}

function normalizeStatus(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function isCodeReviewJiraItem(item: JiraItem): boolean {
  const jiraStatus = normalizeStatus(item.jiraStatus)
  const arbolStatus = normalizeStatus(item.arbolStatus)
  return jiraStatus === 'in code review'
    || jiraStatus === 'ready for code review'
    || arbolStatus === 'in code review'
}

/** Format Jira's own due-date metadata without turning it into an Arbol time.
 * Date-only values are rendered as calendar dates and never receive a synthetic
 * hour or timezone. */
export function formatJiraDueDate(value: string): string {
  if (!value) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateOnly) {
    const date = new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  }
  return value
}

/** Format external timestamps consistently in the user's Madrid wall-clock time. */
export function formatMadridDateTime(value: string): string {
  if (!value) return ''
  // Jira commonly emits offsets as +0000; WebKit is stricter than Chromium.
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    hourCycle: 'h23',
  }).format(date)
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function ignoredTicketMarkdown(item: JiraItem): string {
  return [
    '---',
    'normalized_by: jira',
    `key: ${yamlString(item.key)}`,
    `url: ${yamlString(item.url)}`,
    `summary: ${yamlString(item.title)}`,
    `jira_status: ${yamlString(item.jiraStatus)}`,
    `assignee: ${yamlString(item.assignee)}`,
    `issue_type: ${yamlString(item.issueType)}`,
    `updated: ${yamlString(item.updated)}`,
    'arbol_ignored: true',
    '---',
    '',
    `# ${item.key}: ${item.title}`,
    '',
    '## Description',
    '',
    item.description || '_(empty)_',
    '',
  ].join('\n')
}

export function jiraTicketChatNote(item: JiraItem): string {
  return [
    `# Jira ticket ${item.key}`,
    '',
    'This Chat Note contains the normalized ticket information that was open when **Chat** was pressed. User overrides are effective values; last known Jira values are retained below for provenance. Use it as context for the user’s next question. Do not treat this note as a request to act.',
    '',
    '## Effective normalized ticket', '', '```json',
    JSON.stringify({ key: item.key, ...editableJiraFields(item) }, null, 2), '```', '',
    '## Last known Jira values', '', '```json',
    JSON.stringify({ key: item.key, ...item.jiraValues }, null, 2), '```', '',
    '## User overrides', '', '```json', JSON.stringify(item.overrides, null, 2), '```',
  ].join('\n')
}

export type JiraRepository = { name: string; path: string }

export async function loadJiraRepositories(rpc: RpcCall = call): Promise<JiraRepository[]> {
  const result = record(await rpc('repos.list', {}))
  return records(result.repos)
    .map((repo) => ({ name: text(repo.name), path: text(repo.path) }))
    .filter((repo) => repo.name && repo.path)
}

/** Resolve a ticket repository to its workspace dir. */
function jiraWorkspaceDirs(repository: string, repos: JiraRepository[]): string[] {
  const wanted = repository.trim().toLocaleLowerCase()
  const workspace = repos.find((repo) => repo.name.toLocaleLowerCase() === wanted || repo.path.toLocaleLowerCase() === wanted)
  if (!workspace) {
    throw new Error(`Repository “${repository}” is not available. Use Edit to select another repository.`)
  }
  return [workspace.path]
}

export async function createJiraChat(item: JiraItem, rpc: RpcCall = call): Promise<string> {
  if (!(item.repository || '').trim()) {
    throw new Error(`${item.key} requires a repository. Use Edit to select one before opening Chat.`)
  }
  const workspaceDirs = jiraWorkspaceDirs(item.repository, await loadJiraRepositories(rpc))
  const created = record(await rpc('chat_session.create', {
    provider: 'claude', workspace_dirs: workspaceDirs,
    title: `${item.key} · ${item.title}`.slice(0, 240),
  }))
  const id = text(created.chat_session_id)
  if (!id) throw new Error('Core did not return the new Chat Session')
  await rpc('chat_session.add_chat_note', {
    id, text: jiraTicketChatNote(item), surface: { kind: 'ui', name: 'oaken.jira_ticket' },
  })
  const opened = await callNative('app.open', { ui: 'elma', query: { session_id: id } }) as { ok?: boolean; error?: string } | undefined
  if (opened?.ok === false) throw new Error(opened.error || 'Could not open Elma')
  return id
}

export async function saveJiraOverrides(
  item: JiraItem, fields: JiraEditableFields, rpc: RpcCall = call,
): Promise<JiraItem> {
  const overrides: Partial<JiraEditableFields> = {}
  for (const key of EDITABLE_KEYS) {
    if (fields[key] !== item.jiraValues[key]) (overrides as Record<string, string>)[key] = fields[key]
  }
  const path = `_arbol-internals/${item.key}/overrides.json`
  await rpc('artifacts.write', {
    repo: JIRA_CORPUS, path,
    content: JSON.stringify({ schema_version: 1, key: item.key, overrides }, null, 2) + '\n',
  })
  return applyJiraOverrides({ ...item, overrides: {} }, overrides)
}

/** Persist an Arbol Internal visibility override, then let callers remove the card. */
export async function ignoreJiraItem(item: JiraItem, rpc: RpcCall = call): Promise<void> {
  const path = `_arbol-internals/${item.key}/ignored.md`
  await rpc('artifacts.write', { repo: JIRA_CORPUS, path, content: ignoredTicketMarkdown(item) })
}

/** Archive a ticket, freeze all of its Markdown artifacts as Heartwood, and
 * persist a fetch tombstone in Arbol Internals. */
export async function archiveJiraItem(item: JiraItem, rpc: RpcCall = call): Promise<void> {
  await rpc('jira.archive_ticket', { key: item.key })
}

/** Fetch every ticket ever assigned to the configured Jira user. */
export async function fetchMyJiraTickets(rpc: RpcCall = call): Promise<JiraFetchMyTicketsResult> {
  const result = record(await rpc('jira.fetch_my_tickets', {}))
  const failures = records(result.failures).map((failure) => ({
    key: text(failure.key),
    error: text(failure.error),
  }))
  return {
    matched: Number(result.matched) || 0,
    archived: Number(result.archived) || 0,
    fetched: Number(result.fetched) || 0,
    failed: Number(result.failed) || 0,
    failures,
    logs: pipelineLogs(result.logs),
    message: text(result.message),
  }
}

/** Fetch Jira through the existing raw-mirror -> normalizer pipeline. */
export async function fetchJiraItem(item: JiraItem, rpc: RpcCall = call): Promise<JiraFetchResult> {
  if (item.archived) throw new Error(`${item.key} is archived and cannot be fetched`)
  if (!item.url) throw new Error(`${item.key} has no Jira link to fetch`)
  const result = record(await rpc('quick_input.submit', { content: item.url, force_refresh: true }))
  if (result.handled === false || text(result.status) === 'unsupported') {
    throw new Error(firstText(result.message, `Could not fetch ${item.key}`))
  }
  const handler = record(result.handler_result)
  return {
    message: firstText(handler.message, result.message),
    repository: text(handler.repository),
    logs: pipelineLogs(handler.logs),
  }
}

/**
 * Load only already-normalized Jira ticket artifacts.
 *
 * Opening Oaken is intentionally a read-only render path: it never walks the
 * raw mirror corpus and never parses provider payloads. Mirror retrieval and
 * normalization happen exclusively through the explicit Fetch actions.
 */
export async function loadJiraItems(rpc: RpcCall = call): Promise<JiraLoadResult> {
  let storedTree: ArtifactTree
  try {
    storedTree = await rpc('artifacts.tree', { repo: JIRA_CORPUS }) as ArtifactTree
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ~/Artifacts/jira: ${message}`)
  }

  const storedPaths = collectStoredTicketFiles(storedTree.tree)
  const overrideFiles = collectOverrideFiles(storedTree.tree)
  const contents = await readArtifacts(JIRA_CORPUS, [...storedPaths, ...overrideFiles.values()], rpc)
  const results = await Promise.allSettled(storedPaths.map(async (path) => loadStored(path, contents)))
  const byKey = new Map<string, JiraItem>()
  let skipped = 0
  for (const result of results) {
    if (result.status === 'rejected') { skipped += 1; continue }
    preferNewest(byKey, result.value)
  }

  const ignoredKeys = collectInternalTicketKeys(storedTree.tree, 'ignored.md')
  const archivedKeys = collectInternalTicketKeys(storedTree.tree, 'archived.md')
  const warnings: string[] = []
  for (const [key, item] of byKey) {
    let effective = item
    if (ignoredKeys.has(key)) effective = { ...effective, ignored: true }
    else if (archivedKeys.has(key)) effective = { ...effective, archived: true }
    const overridePath = overrideFiles.get(key)
    if (overridePath) {
      try {
        const parsed = record(JSON.parse(contents.get(overridePath) || '{}'))
        effective = applyJiraOverrides(effective, record(parsed.overrides) as Partial<JiraEditableFields>)
      } catch { warnings.push(`Could not read overrides for ${key}.`) }
    }
    byKey.set(key, effective)
  }

  const items = [...byKey.values()]
    .filter((item) => !item.ignored)
    .sort((a, b) =>
      b.updated.localeCompare(a.updated) || a.key.localeCompare(b.key, undefined, { numeric: true }))
  return { items, skipped, stored: items.length, converted: 0, warnings }
}
