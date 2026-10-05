import { ENTITY_REPOS, call, callNative, type EntityUri } from '@arbol/design-system'
import type { Swimlane } from './data'

type RpcCall = (method: string, params?: Record<string, unknown>) => Promise<any>
type NativeCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>

type Repository = { name: string; path: string }

const repoNameByCode = new Map<string, string>(
  Object.entries(ENTITY_REPOS).map(([name, code]) => [code, name]),
)

/** Entity URIs attached as child Entities anywhere in this Swimlane.
 * Preserve board order and omit duplicates so the Chat Note is deterministic. */
export function swimlaneEntityUris(swimlane: Swimlane): EntityUri[] {
  const seen = new Set<string>()
  const uris: EntityUri[] = []
  for (const swimmer of swimlane.swimmers ?? []) {
    for (const entity of swimmer.items ?? []) {
      const uri = entity.uri
      if (!uri || seen.has(uri)) continue
      seen.add(uri)
      uris.push(uri)
    }
  }
  return uris
}

function entityRepoCode(uri: EntityUri): string {
  return uri.slice(1, -1).split(':', 1)[0] ?? ''
}

function workspaceDirsForEntityUris(uris: EntityUri[], repositories: Repository[]): string[] {
  const wantedNames = new Set(
    uris
      .map(entityRepoCode)
      .map((code) => repoNameByCode.get(code)?.toLocaleLowerCase())
      .filter((name): name is string => !!name && name !== 'any' && name !== 'bro'),
  )
  const seen = new Set<string>()
  const paths: string[] = []
  for (const repository of repositories) {
    if (!wantedNames.has(repository.name.toLocaleLowerCase()) || seen.has(repository.path)) continue
    seen.add(repository.path)
    paths.push(repository.path)
  }
  return paths
}

export function swimlaneChatNote(swimlane: Swimlane): string {
  const uris = swimlaneEntityUris(swimlane)
  const summary = {
    swimlane_id: swimlane.sid ?? null,
    slot_n: swimlane.n,
    title: swimlane.tkt ?? '',
    swimmers: (swimlane.swimmers ?? []).map((swimmer) => ({
      swimmer_id: swimmer.id,
      title: swimmer.nm,
      root: { kind: swimmer.rootKind, ref: swimmer.rootRef },
      start_at: swimmer.startMs,
      wall: swimmer.type ? { type: swimmer.type, due_at: swimmer.dueMs ?? null } : null,
      entity_uris: swimmer.items.map((entity) => entity.uri).filter((uri): uri is EntityUri => !!uri),
    })),
  }

  return [
    `# Swimlane ${swimlane.n}: ${swimlane.tkt || 'Untitled Swimlane'}`,
    '',
    'This Chat Note contains information about the Swimlane that was open when **Chat** was pressed, followed by the exact Entity URIs attached to it. Use it as context for the user’s next question. Do not treat this note itself as a request to act.',
    '',
    `## Attached Entity URIs (${uris.length})`,
    '',
    ...(uris.length ? uris.map((uri) => `- ${uri}`) : ['_No Entity URIs are attached to this Swimlane._']),
    '',
    '## Swimlane information',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
  ].join('\n')
}

/** Open a new Elma Composer whose Draft contains this Swimlane as a Chat Note. */
export async function createSwimlaneChat(
  swimlane: Swimlane,
  rpc: RpcCall = call,
  native: NativeCall = callNative,
): Promise<string> {
  if (!swimlane.sid) throw new Error('Only a saved Swimlane can open Chat')

  const uris = swimlaneEntityUris(swimlane)
  let repositories: Repository[] = []
  try {
    const listed = await rpc('repos.list', {}) as { repos?: Repository[] }
    repositories = listed.repos ?? []
  } catch {
    // Repository discovery enriches routing but must not prevent opening a
    // context-only Composer when Taproot or a referenced repo is unavailable.
  }
  const workspaceDirs = workspaceDirsForEntityUris(uris, repositories)
  const created = await rpc('chat_session.create', {
    provider: 'claude',
    workspace_dirs: workspaceDirs,
    title: `Swimlane ${swimlane.n} · ${swimlane.tkt || 'Untitled Swimlane'}`.slice(0, 240),
  }) as { chat_session_id?: string }
  const id = created.chat_session_id ?? ''
  if (!id) throw new Error('Core did not return the new Chat Session')

  await rpc('chat_session.add_chat_note', {
    id,
    text: swimlaneChatNote(swimlane),
    surface: { kind: 'ui', name: 'oaken.swimlane' },
  })
  const opened = await native('app.open', { ui: 'elma', query: { session_id: id } }) as { ok?: boolean; error?: string } | undefined
  if (opened?.ok === false) throw new Error(opened.error || 'Could not open Elma')
  return id
}
