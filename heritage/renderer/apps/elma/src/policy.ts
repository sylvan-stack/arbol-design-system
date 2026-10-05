/* Pure repo-rule logic for Elma's IP/repo pickers — no bridge, no React, no
 * runtime imports, so it's unit-testable on its own (renderer/apps/elma/test).
 *
 * The rules themselves are configured in Seqoya Lab's Intelligence Providers
 * page (the ip_repo_rule table) and read by Elma via `ip.repo_rules.all`. This
 * module only folds that data both ways:
 *   - per repo: which IPs are prohibited / which are the repo default (point 1/2)
 *   - per IP:   which repos it prohibits (point 3)
 * Repo paths are matched exactly (repos.list paths === rule repo_path). */

export type Ip = {
  name: string
  label?: string
  provider: string
  version: string
  deprecated: number | boolean
  default_for_provider: number | boolean
  // The bound subscription + its auth state (joined by the daemon). An IP is
  // usable only when its subscription is logged in.
  subscription_name?: string | null
  subscription_auth_state?: string | null
  default_model?: string | null
  enabled_models?: string[] | null
  enabled_thinking_levels?: Record<string, string[]> | null
  // Seqoya-configured default thinking level for new turns using this IP.
  thinking_level?: string | null
}

/* A per-repo routing rule. `rule` is 'default' (the repo's preferred IP) or
 * 'prohibited' (the IP may not serve a chat rooted in that repo). `repo_path`
 * is absolute (matches repos.list). */
export type RepoRule = { ip_name: string; repo_path: string; rule: 'default' | 'prohibited' }

/* The full repo-rule set plus the single global-default IP. */
export type RepoPolicy = { rules: RepoRule[]; global_default: string }

/* Repository discovery historically exposed ~/repo/<name> (and even
 * /~/repo/<name>) while policy stores the canonical Sylvan Stack container.
 * Keep matching pure and conservative: exact paths always match, and only the
 * transparent `sylvan-stack` grouping segment may differ. */
export function repoPathsEquivalent(left: string, right: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  const a = normalize(left)
  const b = normalize(right)
  if (a === b) return true
  const repoRelative = (value: string): string | null => {
    const marker = '/repo/'
    const index = value.lastIndexOf(marker)
    return index >= 0 ? value.slice(index + marker.length) : null
  }
  const ar = repoRelative(a)
  const br = repoRelative(b)
  if (!ar || !br) return false
  const ungroup = (value: string) => value.startsWith('sylvan-stack/') ? value.slice('sylvan-stack/'.length) : value
  return ar !== br && ungroup(ar) === ungroup(br)
}

const rulesForRepo = (policy: RepoPolicy, repoPath: string) =>
  policy.rules.filter((rule) => repoPathsEquivalent(rule.repo_path, repoPath))

/* An IP is usable in Elma only when its bound subscription is logged in. Pass
 * the set of logged-in subscription names (built from subscription.list). */
export function ipEnabled(ip: Ip, loggedInSubs: Set<string>): boolean {
  return !!ip.subscription_name && loggedInSubs.has(ip.subscription_name)
}

/* IP names the repo forbids — disable these in the IP picker for this repo. */
export function prohibitedIpsForRepo(policy: RepoPolicy, repoPath: string): Set<string> {
  return new Set(
    rulesForRepo(policy, repoPath).filter((r) => r.rule === 'prohibited').map((r) => r.ip_name)
  )
}

/* IP names the repo marks default, in declared order (precedence for point 1). */
export function defaultIpsForRepo(policy: RepoPolicy, repoPath: string): string[] {
  return rulesForRepo(policy, repoPath).filter((r) => r.rule === 'default').map((r) => r.ip_name)
}

/* Repo paths an IP forbids — disable these in the repo picker once the IP is
 * explicitly chosen (point 3). */
export function prohibitedReposForIp(policy: RepoPolicy, ipName: string): Set<string> {
  return new Set(
    policy.rules.filter((r) => r.rule === 'prohibited' && r.ip_name === ipName).map((r) => r.repo_path)
  )
}

/* The IP a repo opens with (point 1): the repo's default → the global default →
 * any enabled IP (prefer the provider default). Login-aware and never a
 * repo-prohibited IP. Returns '' when nothing is usable. */
export function repoDefaultIp(
  policy: RepoPolicy,
  repoPath: string,
  ips: Ip[],
  loggedInSubs: Set<string>
): string {
  const prohibited = prohibitedIpsForRepo(policy, repoPath)
  const byName = new Map(ips.map((ip) => [ip.name, ip]))
  const usable = (name: string): boolean => {
    const ip = byName.get(name)
    return !!ip && ipEnabled(ip, loggedInSubs) && !prohibited.has(name)
  }
  for (const name of defaultIpsForRepo(policy, repoPath)) if (usable(name)) return name
  if (policy.global_default && usable(policy.global_default)) return policy.global_default
  const enabled = ips.filter((ip) => ipEnabled(ip, loggedInSubs) && !prohibited.has(ip.name))
  return (enabled.find((ip) => ip.default_for_provider) || enabled[0])?.name ?? ''
}

/* Resolve the IP at the boundary where a new chat is created. An explicit
 * choice made in the still-empty composer belongs to that chat; otherwise never
 * inherit the IP attached to a previously opened session. */
export function newChatIp(
  policy: RepoPolicy,
  repoPath: string,
  ips: Ip[],
  loggedInSubs: Set<string>,
  selectedIp: string,
  explicitlySelectedForNewChat: boolean
): string {
  return explicitlySelectedForNewChat ? selectedIp : repoDefaultIp(policy, repoPath, ips, loggedInSubs)
}
