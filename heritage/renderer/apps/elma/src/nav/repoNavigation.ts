export type RepoNavigationAction =
  | { kind: 'change-current-session'; detachComposer: false }
  | { kind: 'new-chat'; detachComposer: true }

/** Mouse selection edits the attached Chat Session's repository in place. That
 * is a working-directory change, not Chat navigation, so its Composer remains
 * mounted. Keyboard shortcuts intentionally retain Elma's long-standing
 * "new chat" behavior. */
export function repoNavigationAction(
  source: 'mouse' | 'hotkey',
  hasCurrentSession: boolean,
): RepoNavigationAction {
  return source === 'mouse' && hasCurrentSession
    ? { kind: 'change-current-session', detachComposer: false }
    : { kind: 'new-chat', detachComposer: true }
}


export type RepoPathIdentity = { name: string; path: string; container?: boolean; pinned?: boolean }

/** Fixed navigation targets, followed by the most recently used repositories. */
export const PINNED_REPOS = ['Arbol'] as const

export type OrganizationTarget = { name: string; root: string }

export function navigationTargets<T extends RepoPathIdentity>(
  repos: readonly T[],
  organizations: readonly OrganizationTarget[] = [],
): RepoPathIdentity[] {
  return [
    ...repos,
    // The organization's name is its alias — targets are addressed by it.
    ...[...organizations].sort((left, right) => {
      // Keep Euro Office on Cmd+2, using its configured folder and display name.
      const isEuroOffice = (name: string) => /^euro[\s-]+office$/i.test(name.trim())
      return Number(isEuroOffice(right.name)) - Number(isEuroOffice(left.name))
    }).map((organization) => ({
      name: organization.name,
      path: organization.root,
      pinned: true,
    })),
  ]
}

export function buildRepoSlots(
  repos: readonly RepoPathIdentity[],
  recents: readonly RepoPathIdentity[],
): { key: string; name: string; path: string }[] {
  // Discovery uses checkout names (e.g. "arbol"), while the fixed shortcut
  // predates that naming. Resolve the pin to the catalog's actual identity.
  const pinned = [...new Set([
    ...PINNED_REPOS.map((name) => repos.find((repo) => repo.name === name)?.name
      ?? repos.find((repo) => repo.name.toLowerCase() === name.toLowerCase())?.name
      ?? name),
    ...repos.filter((repo) => repo.pinned).map((repo) => repo.name),
  ])].slice(0, 9)
  const byName = new Map(repos.map((repo) => [repo.name, repo]))
  const slots = pinned.map((name, index) => ({
    key: `⌘${index + 1}`, name: String(name), path: byName.get(name)?.path || '',
  }))
  const seen = new Set<string>(pinned)
  const seenPaths = new Set(slots.filter((slot) => slot.path).map((slot) => normalizedPath(slot.path)))
  for (const candidate of [...recents, ...repos]) {
    if (slots.length === 9) break
    // Resolve old recents named "main" back to their Worktree Container,
    // and organization-folder recents back to their organization name.
    const repo = repoForWorkspacePath(repos, candidate.path) ?? candidate
    if (seen.has(repo.name) || (repo.path && seenPaths.has(normalizedPath(repo.path)))) continue
    // Old recents may retain the former capitalization and checkout path.
    if (PINNED_REPOS.some((name) => repo.name.toLowerCase() === name.toLowerCase())) continue
    seen.add(repo.name)
    if (repo.path) seenPaths.add(normalizedPath(repo.path))
    slots.push({ key: `⌘${slots.length + 1}`, name: repo.name, path: repo.path })
  }
  return slots
}

const normalizedPath = (path: string) => path.replace(/\/+$/, '')

/** Resolve a workspace checkout back to its owning Repo. Worktree Containers
 * expose branch checkouts below the Repo root, so the checkout's basename
 * (often `main`) is not a Repo name. */
export function repoForWorkspacePath<T extends RepoPathIdentity>(
  repos: readonly T[],
  workspacePath: string,
): T | undefined {
  const path = normalizedPath(workspacePath)
  const exact = repos.find((repo) => normalizedPath(repo.path) === path)
  if (exact) return exact
  return repos
    .filter((repo) => repo.container && path.startsWith(`${normalizedPath(repo.path)}/`))
    .sort((left, right) => normalizedPath(right.path).length - normalizedPath(left.path).length)[0]
}
