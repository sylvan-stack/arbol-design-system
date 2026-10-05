import { visibleProviders } from '../../../packages/design-system/src/providers'
/* Typed RPC wrappers for Seqoya Lab over the shared bridge. */
import { call, callNative } from '@arbol/design-system'

export type UsageMeter = {
  label: string
  resetInfo: string
  percentUsed: number
  displayText: string
}

export type ClaudeUsage = {
  provider?: string
  accountName: string | null
  accountEmail: string | null
  organizationName: string | null
  planType: string | null
  currentSession: UsageMeter | null
  weeklyLimits: UsageMeter[]
  additionalFeatures: { label: string; used: number; total: number }[]
  raw?: string
}

export type ClaudeUsageResult =
  | { ok: true; data: ClaudeUsage }
  | { ok: false; error?: string; needsLogin?: boolean }

export type CodexRateWindow = {
  label?: string
  usedPercent: number | null
  remainingPercent: number | null
  resetAt: number | null
  resetAfterSeconds: number | null
  limitWindowSeconds: number | null
  raw?: unknown
}

export type CodexUsage = {
  provider: 'codex'
  usagePageUrl: string
  planType: string | null
  allowed: boolean | null
  limitReached: boolean | null
  primaryWindow: CodexRateWindow | null
  secondaryWindow: CodexRateWindow | null
  additionalRateLimits: unknown[]
  credits?: unknown
  spendControl?: unknown
  raw?: unknown
}

export type CodexUsageResult =
  | { ok: true; data: CodexUsage; captured_at?: number }
  | { ok: false; error?: string; needsLogin?: boolean }

// z.ai (GLM Coding Plan) usage, fetched daemon-side from the z.ai quota API
// with the subscription's static API key — never scraped from a web session.
export type ZaiWindow = {
  kind: 'session' | 'weekly' | 'mcp'
  credit: boolean
  label: string
  windowMinutes: number | null
  usedPercent: number
  resetAtMs: number | null
  usage: number | null
  remaining: number | null
}

export type ZaiUsage = {
  provider: 'zai'
  usagePageUrl: string
  planType: string | null
  windows: ZaiWindow[]
  models: { modelCode: string; usage: number }[]
  raw?: unknown
}

export type ZaiUsageResult =
  | { ok: true; data: ZaiUsage; captured_at?: number }
  | { ok: false; error?: string; needsLogin?: boolean }

export type WebRequestRow = {
  when: string
  model: string
  detail: string
  cost: string
}

export type WebRequestsResult =
  | { ok: true; rows: WebRequestRow[]; raw?: string }
  | { ok: false; error?: string; needsLogin?: boolean }

export type Subscription = {
  name: string
  provider: string
  label: string
  auth_state: 'logged_out' | 'logged_in' | 'expired' | 'error'
  subscription_type: string | null
  rate_limit_tier: string | null
  usage: ClaudeUsage | null  // cached web-session usage (instant on launch)
  // 'api_key' subscriptions hold a static key (subscription.set_token) and
  // never open an OAuth page; 'oauth' subscriptions use the PKCE web flow.
  auth_mode?: 'oauth' | 'api_key'
}

export type Ip = {
  name: string
  label?: string
  provider: string
  version: string
  deprecated: number | boolean
  default_for_provider: number | boolean
  enabled?: number | boolean
}

export type ModelOption = { value: string; label: string }

export type ModelFetchResult = {
  provider: string
  source: string
  models: ModelOption[]
}

export type IpSettings = {
  ip_name: string
  subscription_name: string | null
  default_model: string
  thinking_level: string
  enabled_models: string[]
  enabled_thinking_levels: Record<string, string[]>
  is_global_default: boolean
  full_permissions: boolean
  working_dir: string
  enabled?: boolean
} | null

export type RepoRules = { default: string[]; prohibited: string[] }

export type FeatureToggle = {
  key: string
  label: string
  description: string
  default_enabled: boolean
  enabled: boolean
}

export type FeatureTogglesResult = {
  features: FeatureToggle[]
  cue_catalog: { path: string; entries: number }
}

export type Repo = {
  name: string; path: string
  // Mycel per-repo flags (repo-scoping): opt-in gate + which embedding model.
  mycel_enabled?: boolean; embedder_profile?: string | null
  has_artifacts?: boolean
  artifact_root?: string
  // Worktree Container: ~/repo/<name> holds .bare + branch worktrees
  container?: boolean
  worktrees?: { branch: string; path: string; exists: boolean }[]
}

// ---- Organizations (~/repos/<organization> folders) ----
export type OrgRepo = { name: string; path: string; artifact_root?: string; vip: boolean; ignored: boolean }
export type Organization = {
  name: string; root: string; url: string
  artifact_root?: string
  // Whether the GitHub url points at the upstream repos or our fork of them.
  url_kind: 'original' | 'fork'
  ignored: string[]; vip: string[]
  repos: OrgRepo[]
}
export type GitJobResult = { action?: 'pull' | 'push' | 'clone'; repo: string; path: string; ok: boolean; detail: string }
export type GitJobStatus = {
  running: boolean; action: 'pull' | 'push' | 'clone' | null; target: string | null
  done: number; total: number; current: string | null
  results: GitJobResult[]; error: string | null
}
export type OrganizationDraft = {
  name: string; root: string; url: string; url_kind: 'original' | 'fork'
  ignored?: string[]; vip?: string[]; old_name?: string
}
export type Overlay = {
  name: string; base_repo: string; branch: string; worktree_path: string
  chunks: number; embedded: number; merged: boolean; last_sync: number | null
}

export type LivingTopicEntity = {
  repo_name: string
  kind: string
  kind_tag: string | null
  entity_id: string
  title: string | null
  uri: string | null
  file_path: string | null
  display_path: string | null
  lifecycle: string | null
  linked_at: number
}

export type LivingTopic = {
  living_topic_id: string
  title: string
  description: string
  created_at: number
  updated_at: number
  entities: LivingTopicEntity[]
}

export type Steward = {
  steward_id: string
  title: string
  description: string
  mission: string
  default_brain_recipe_id: string | null
  status: 'draft' | 'active' | 'suspended' | 'retired'
  metadata: Record<string, unknown>
  instruction_files: string[]
  mandate_count: number
  mandates: StewardMandate[]
  created_at: number
  updated_at: number
}

export type StewardMandate = {
  mandate_id: string; title: string; description: string; mandate_type: string; status: string
  assignment_kind: 'static' | 'runtime'; source_activation_rule_id: string | null
  assigned_at: number; revoked_at: number | null; version: number; definition: Record<string, unknown>
}

export type Mandate = {
  mandate_id: string
  title: string
  description: string
  mandate_type: 'new_chat_session' | 'post_in_chat' | 'chat_history' | 'brain_recipe' | 'blueprint'
  status: 'draft' | 'active' | 'suspended' | 'revoked'
  effective_at: number | null
  expires_at: number | null
  current_version_id: string
  version: number
  definition: Record<string, unknown>
  created_at: number
  updated_at: number
  version_created_at: number
}

export type ActivationRule = {
  activation_rule_id: string; title: string; description: string
  status: 'draft' | 'active' | 'suspended' | 'retired'
  emitted_signal_type: string; current_version_id: string; version: number
  definition: Record<string, unknown>; created_at: number; updated_at: number
}


export type RequestRow = {
  occurred_at: number
  model: string
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
}

// ---- Mycel (chunks / derivation / detection / drifts) ----
export type KnChunk = {
  id: string
  natural_key: string
  title: string
  level: number
  ordinal: number
  parent: string | null
  role: string
  origin: string
  tier: number
  lang: string | null
  symbol_kind: string | null
  line_start: number | null
  line_end: number | null
  chars: number
  content_hash: string
  title_hash: string
  raw_text: string
  status: string | null
  prev: string | null
  state: string
  stale: boolean
  stale_because: string | null
  derives_from: KnDerivation[]
  // Source Refs that failed to resolve at ingest (file moved / typo) — loud, never dropped
  unresolved_sources: string[] | null
}
export type KnDerivation = {
  parent_id: string; parent: string; path: string; origin: string
  hash_at_gen: string; current: string; drifted: boolean
}
export type KnArtifact = {
  path: string; chunk_count: number; chunks: KnChunk[]
  heartwood: { implemented: string | null; outdated: string | null } | null
}
export type KnChunksView = {
  artifact_count: number; total_chunks: number; artifacts: KnArtifact[]
  offset?: number; limit?: number | null
}
export type KnStatus = {
  documents: number; chunks: number; stale: number; edges: number; open_drifts: number
}
export type KnHealthCounts = { total: number; fresh: number; stale: number; heartwood: number }
export type KnDashboardStatus = {
  files: KnHealthCounts
  chunks: KnHealthCounts & { embedded: number; pending: number }
  composition: {
    codebase: { files: KnHealthCounts; chunks: KnHealthCounts }
    artifacts: { files: KnHealthCounts; chunks: KnHealthCounts }
    base_repositories: { files: number; chunks: number }
    overlays: { files: number; chunks: number }
    repositories: {
      repo: string; base_files: number; overlay_files: number
      code_files: number; artifact_files: number; chunks: number
    }[]
  }
  synchronization: {
    enabled: boolean
    sync: {
      running: boolean; repos: string[]; done: number; total: number; error: string | null
      active_files: { repo: string; path: string }[]
    }
    embedding: {
      running: boolean; done: number; total: number; error: string | null
      active_files: { repo: string; path: string; pending_chunks: number }[]
    }
  }
  updated_at: number
}
export type KnEmbedStatus = {
  embedder_profile: string
  has_key: boolean; embedded: number; pending: number
  progress: { running: boolean; done: number; total: number; error: string | null }
  local_model?: {
    model: string; dim: number; available: boolean; dir: string; bytes: number
    download: { running: boolean; done: number; total: number; error: string | null }
  }
  sync?: {
    enabled: boolean; interval: number; running: boolean; last_ts: number
    watcher: boolean; watcher_error: string | null; debounce: number
    error: string | null
    last: {
      docs_edited: number; docs_new: number; stale: number
      code_added: number; code_updated: number; code_removed: number; embedded: number
    } | null
  }
}
export type KnSearchResult = {
  id: string; chunk: string; path: string; natural_key: string
  origin: string; tier: number; score: number; preview: string
  // time-frozen record (GLOSSARY › Heartwood) — dates/commits are free-form pins
  heartwood: { implemented: string | null; outdated: string | null } | null
}
export type KnCodeHit = {
  id: string; path: string; natural_key: string; symbol: string
  // machine-local, validated source location for Read/ReadSymbol; null for stale/synthetic hits
  read_path: string | null; readable: boolean; unavailable_reason?: string
  lang: string | null; symbol_kind: string | null; line_start: number | null; line_end: number | null
  score: number; dense_rank: number | null; bm25_rank: number | null; preview: string
  // doc-bridge attribution: this hit was injected (or boosted) by a doc section's Source Refs
  via: { doc: string; stale: boolean; heartwood: boolean } | null
  // reverse edges: doc sections citing this chunk (with staleness as trust signal)
  documented_in: { doc: string; stale: boolean }[]
}
export type KnCodeSearch = { results: KnCodeHit[]; dense: number; bm25: number }
export type KnBrainRecipe = { name: string; ip_name: string; model: string; thinking: string }
export type BrainRecipeCondition = {
  condition_type: 'repo' | 'ip'; operator: 'equals' | 'not_equals'
  condition_value: string; join: 'and' | 'or'
}
export type BrainRecipeRule = {
  assignment_id?: number; position?: number
  conditions: BrainRecipeCondition[]; ip_name: string; model: string; thinking: string; recipes: string[]
}
export type BrainRecipeAssignmentConfig = {
  recipe_name: string; ip_name: string | null; model: string | null; thinking: string
  fallback_policy: 'global' | 'local' | 'null'; recipes: string[]
  updated_at: number; assignments: BrainRecipeRule[]
}
export type BrainRecipeRole = { key: string; name: string; description: string }
export type BrainRecipeRoleAssignment = { role_key: string; recipe_name: string; updated_at: number }
export type BrainRecipeAssignmentsResult = {
  recipes: BrainRecipeAssignmentConfig[]; global_default_recipe: string | null
  roles: BrainRecipeRole[]; role_assignments: BrainRecipeRoleAssignment[]
}
export type KnRaptorStatus = {
  running: boolean; tier: number; tier_done: number; tier_total: number
  summaries: number; tiers: number; top_nodes: number
  error: string | null; done: boolean; cancelled: boolean
  mode?: 'build' | 'regen'; stale_summaries?: number; max_concurrency?: number
  message?: string
  active_jobs?: { tier: number; ordinal: number; members: number; preview: string }[]
}
export type KnBuildPlan = {
  corpus_chunks: number; total_summaries: number; top_nodes: number
  tiers: { tier: number; nodes_in: number; summaries: number; carried: number }[]
}
export type KnRegenPlan = {
  stale_summaries: number; members: number
  by_tier: { tier: number; count: number }[]
}
export type ArtifactNode = { name: string; path: string; type: 'dir' | 'file'; children?: ArtifactNode[]; read_only?: boolean; linked?: boolean }
export type ArtifactTree = { root: string; tree: ArtifactNode[] }
export type ArtifactFile = { path: string; exists: boolean; content: string; read_only?: boolean; linked?: boolean }
export type ArtifactWriteResult = {
  ok: boolean; path: string
  ingest: Record<string, number>; detect: Record<string, number>; stale: string[]
}
export type KnDriftSource = { id: string | null; label: string | null; reason: string | null }
export type KnDrift = {
  id: string
  chunk_id: string
  chunk: string
  path: string
  natural_key: string
  source: string | null
  source_id: string | null
  /* Every source that contributed to the drift (a chunk can derive from many). */
  sources: KnDriftSource[]
  reason: string | null
  opened_at: number
}

/* One kn_activity feed row: a completed sync/embed/overlay/raptor/pull
 * operation, written by the shared library — daemon and CLI runs alike. */
export type LogJournalEntry = {
  id: string
  ts: number
  level: string
  daemon: string
  logger: string
  event: string
  msg: string
  file: string
  fields: Record<string, unknown>
}
export type LogJournalFacets = { daemons: string[]; levels: string[] }
export type LogJournalResult = { entries: LogJournalEntry[]; facets: LogJournalFacets }

export type SignalRecord = {
  id: string
  seq?: number
  type: string
  source: string
  occurred_at: number
  sent_at: number
  data: Record<string, unknown>
  type_schema_version?: number
  source_ref?: string
  provenance?: Record<string, unknown>
}

export type ReactionSummary = {
  reaction_id: string
  version: number
  name: string
  summary: string
  enabled: boolean
  trigger: { signal_types: string[]; summary: string }
  action: { type: string; summary: string }
  runtime: {
    runs: number
    succeeded: number
    failed: number
    last_status: string | null
    last_error: string | null
    last_completed_at: number | null
  }
}

export type KnActivity = {
  id: string
  ts: number
  kind: 'sync' | 'embed' | 'overlay_ingest' | 'raptor_build' | 'raptor_regen' | 'pull'
  repo: string | null
  actor: 'cli' | 'daemon'
  summary: Record<string, unknown>
  duration_ms: number | null
  error: string | null
}

export type BlueprintInput = { name: string; type: string; required: boolean; description?: string; default?: string }
export type BlueprintOutput = { artifact: string; must: string[] }
export type Blueprint = {
  blueprint_id: string; name: string; summary: string; instructions: string
  status: 'active'; inputs: BlueprintInput[]; outputs: BlueprintOutput[]
  done_when: string; restrictions: string[]; recipe_policy: 'inherit' | 'default' | 'pinned'
  brain_recipe_id: string | null; max_minutes: number | null; metadata: Record<string, unknown>
  created_at: number; updated_at: number; corpus_path: string
}
export type BlueprintDraft = Omit<Blueprint, 'blueprint_id' | 'created_at' | 'updated_at'>
export type QuickText = { quick_text_id: string; name: string; activation_key: string; content: string; enabled: boolean; display_order: number; created_at: number; updated_at: number }
export type QuickTextDraft = { quick_text_id?: string; name: string; activation_key: string; content: string; enabled: boolean; display_order?: number }
export type EntityMetadataRecord = { repo_name: string; kind: string; entity_id: string; metadata: Record<string, unknown>; created_at: number | null; updated_at: number | null }

export const api = {
  reactions: () => call('reaction.list').then((r) => r.reactions as ReactionSummary[]),
  logJournal: {
    list: (filters: { limit?: number; daemon?: string; level?: string; event?: string; query?: string; signals_only?: boolean } = {}) =>
      call('log_journal.list', filters) as Promise<LogJournalResult>,
  },
  signals: {
    get: (id: string) => call('signal.get', { id }).then((r) => r.signal as SignalRecord),
  },
  slackCredentials: {
    status: () => call('slack.credentials.status') as Promise<{ credentials: Record<'user' | 'app' | 'bot', boolean> }>,
    set: (role: 'user' | 'app' | 'bot', value: string) => call('slack.credentials.set', { role, value }),
    remove: (role: 'user' | 'app' | 'bot') => call('slack.credentials.remove', { role }),
  },
  telegramCredentials: {
    status: () => call('telegram.credentials.status') as Promise<{
      credentials: Record<'api_id' | 'api_hash' | 'phone', boolean>
      values?: Partial<Record<'api_id' | 'phone', string>>
      session: boolean
    }>,
    set: (role: 'api_id' | 'api_hash' | 'phone', value: string) => call('telegram.credentials.set', { role, value }),
    remove: (role: 'api_id' | 'api_hash' | 'phone' | 'session') => call('telegram.credentials.remove', { role }),
  },
  telegramLogin: {
    cancel: (login_id: string) => call('telegram.login.start', { cancel: true, login_id }),
    start: (resend = false, method: 'code' | 'qr' = 'code') => call('telegram.login.start', { resend, method }) as Promise<{
      ok: boolean; message: string; can_resend: boolean; retry_after: number; code_length?: number; qr_url?: string; login_id: string
    }>,
    complete: (code: string, password?: string, login_id?: string) =>
      call('telegram.login.complete', { code, password: password || '', login_id }) as Promise<{
        ok: boolean
        password_required?: boolean
        pending?: boolean
        expired?: boolean
      }>,
  },
  subscriptions: () =>
    call('subscription.list').then((r) => r.subscriptions as Subscription[]),
  login: (name: string) =>
    call('subscription.login', { name }) as Promise<{ url: string; redirect_uri: string }>,
  loginComplete: (name: string, code?: string) =>
    call('subscription.login.complete', { name, code }),
  logout: (name: string) => call('subscription.logout', { name }),
  setToken: (name: string, token: string) =>
    call('subscription.set_token', { name, token }).then((r) => r.subscription as Subscription),
  requests: (name: string, limit = 40) =>
    call('subscription.requests', { name, limit }).then((r) => r.requests as RequestRow[]),
  codexUsage: (name: string) =>
    call('subscription.codex.usage', { name })
      .then((r) => ({ ok: true, data: r.usage as CodexUsage, captured_at: r.captured_at }) as CodexUsageResult)
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }) as CodexUsageResult),
  zaiUsage: (name: string) =>
    call('subscription.zai.usage', { name })
      .then((r) => ({ ok: true, data: r.usage as ZaiUsage, captured_at: r.captured_at }) as ZaiUsageResult)
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }) as ZaiUsageResult),
  // Spawn a VS Code instance on this subscription's own profile; the daemon
  // injects the account token into the child env (token never reaches the UI).
  openVSCode: (name: string) =>
    call('subscription.open_vscode', { name }) as Promise<{ ok: boolean; profile_dir: string }>,

  ips: () => call('ip.list').then((r) => visibleProviders((r.ips as Ip[]) || [])),
  ipSettings: (ip_name: string) =>
    call('ip.settings.get', { ip_name }) as Promise<{
      ip_name: string
      settings: IpSettings
      repo_rules: RepoRules
    }>,
  setIpSettings: (params: {
    ip_name: string
    subscription_name: string | null
    default_model: string
    thinking_level: string
    enabled_models?: string[]
    enabled_thinking_levels?: Record<string, string[]>
    is_global_default: boolean
    working_dir?: string
    full_permissions?: boolean
  }) => call('ip.settings.set', params),
  setRepoRules: (ip_name: string, def: string[], prohibited: string[]) =>
    call('ip.repo_rules.set', { ip_name, default: def, prohibited }),
  testIp: (ip_name: string) =>
    call('ip.test', { ip_name }) as Promise<{ success: boolean; error?: string }>,
  enableIp: (ip_name: string) =>
    call('ip.enable', { ip_name }) as Promise<{ ok: boolean; ip_name: string; enabled: boolean }>,
  disableIp: (ip_name: string) =>
    call('ip.disable', { ip_name }) as Promise<{ ok: boolean; ip_name: string; enabled: boolean }>,
  fetchIpModels: (params: { ip_name: string; subscription_name?: string | null }) =>
    call('ip.models.fetch', params) as Promise<ModelFetchResult>,

  quickText: {
    list: () => call('quick_text.list').then((r) => r.quick_texts as QuickText[]),
    save: (value: QuickTextDraft) => call('quick_text.save', value) as Promise<{ ok: boolean; quick_text: QuickText }>,
    remove: (quick_text_id: string) => call('quick_text.delete', { quick_text_id }) as Promise<{ ok: boolean }>,
  },

  featureToggles: () => call('feature_toggles.list') as Promise<FeatureTogglesResult>,
  setFeatureToggle: (key: string, enabled: boolean) =>
    call('feature_toggles.set', { key, enabled }) as Promise<FeatureTogglesResult>,
  rebuildCueDetectionCatalog: () =>
    call('cue_detection.catalog.rebuild') as Promise<{ ok: boolean; path: string; entries: number }>,

  repos: () => call('repos.list').then((r) => r.repos as Repo[]),
  cloneRepo: (url: string) =>
    call('repos.orgs.git', { action: 'clone', url }) as Promise<{ started: boolean; total?: number }>,
  setMycel: (name: string, opts: { mycel_enabled?: boolean; embedder_profile?: string }) =>
    call('repos.set_mycel', { name, ...opts }) as Promise<{ name: string; mycel_enabled: boolean; embedder_profile: string }>,
  organizations: {
    list: () => call('repos.orgs.list').then((r) => r.organizations as Organization[]),
    save: (draft: OrganizationDraft) =>
      call('repos.orgs.save', draft) as Promise<{ ok: boolean; organization: Organization }>,
    remove: (name: string) => call('repos.orgs.delete', { name }) as Promise<{ ok: boolean }>,
    git: (action: 'pull' | 'push', target: { organization?: string; path?: string }) =>
      call('repos.orgs.git', { action, ...target }) as Promise<{ started: boolean; total?: number }>,
    gitStatus: () => call('repos.orgs.git_status') as Promise<GitJobStatus>,
  },
  overlays: (repo?: string) =>
    call('overlay.list', repo ? { repo } : {}).then((r) => r.overlays as Overlay[]),
  dropOverlay: (repo: string, branch: string) => call('overlay.drop', { repo, branch }),
  refreshOverlay: (repo: string, branch: string) => call('overlay.refresh', { repo, branch }),

  stewards: {
    list: () => call('steward.list').then((r) => r.stewards as Steward[]),
    setActive: (steward_id: string, active: boolean) =>
      call('steward.set_active', { steward_id, active }).then((r) => r.steward as Steward),
  },
  mandates: {
    list: () => call('mandate.list').then((r) => r.mandates as Mandate[]),
    versions: (mandate_id: string) => call('mandate.versions', { mandate_id }).then((r) => r.versions as Array<{ mandate_version_id: string; version: number; definition: Record<string, unknown>; created_at: number }>),
    setActive: (mandate_id: string, active: boolean) =>
      call('mandate.set_active', { mandate_id, active }).then((r) => r.mandate as Mandate),
  },

  activationRules: {
    list: () => call('activation_rule.list').then((r) => r.activation_rules as ActivationRule[]),
    setActive: (activation_rule_id: string, active: boolean) =>
      call('activation_rule.set_active', { activation_rule_id, active }).then((r) => r.activation_rule as ActivationRule),
  },

  brainRecipes: {
    assignments: () => call('brain_recipe.assignments.list') as Promise<BrainRecipeAssignmentsResult>,
    save: (value: { recipe_name: string; old_recipe_name?: string; default: { ip_name: string | null; model: string | null; thinking: string; fallback_policy: 'global' | 'local' | 'null'; recipes: string[] }; assignments: BrainRecipeRule[] }) =>
      call('brain_recipe.assignments.save', value) as Promise<{ ok: boolean; recipe: BrainRecipeAssignmentConfig }>,
    remove: (recipe_name: string) => call('brain_recipe.assignments.delete', { recipe_name }) as Promise<{ ok: boolean }>,
    setGlobalDefault: (recipe_name: string | null) => call('brain_recipe.global_default.set', { recipe_name }) as Promise<{ ok: boolean; global_default_recipe: string | null }>,
    setRole: (role_key: string, recipe_name: string | null) => call('brain_recipe.role.set', { role_key, recipe_name }) as Promise<{ ok: boolean }>,
  },

  blueprints: {
    list: () => call('blueprint.list').then((r) => r.blueprints as Blueprint[]),
    create: (draft: BlueprintDraft) => call('blueprint.create', draft) as Promise<{ ok: boolean; blueprint: Blueprint }>,
    update: (blueprint_id: string, draft: BlueprintDraft) => call('blueprint.update', { blueprint_id, ...draft }) as Promise<{ ok: boolean; blueprint: Blueprint }>,
    remove: (blueprint_id: string) => call('blueprint.delete', { blueprint_id }) as Promise<{ ok: boolean }>,
  },
  entityMetadata: {
    get: (kind: string, entity_id: string, repo_name = 'any') => call('entity.metadata.get', { kind, entity_id, repo_name }) as Promise<EntityMetadataRecord>,
    set: (kind: string, entity_id: string, metadata: Record<string, unknown>, repo_name = 'any') => call('entity.metadata.set', { kind, entity_id, repo_name, metadata }) as Promise<EntityMetadataRecord & { ok: boolean }>,
    patch: (kind: string, entity_id: string, patch: Record<string, unknown>, repo_name = 'any') => call('entity.metadata.patch', { kind, entity_id, repo_name, patch }) as Promise<EntityMetadataRecord & { ok: boolean }>,
  },

  livingTopics: {
    list: () => call('living_topic.list').then((r) => r.living_topics as LivingTopic[]),
    create: (title: string, description: string) =>
      call('living_topic.create', { title, description }) as Promise<{ ok: boolean; living_topic: LivingTopic }>,
    update: (living_topic_id: string, title: string, description: string) =>
      call('living_topic.update', { living_topic_id, title, description }) as Promise<{ ok: boolean; living_topic: LivingTopic }>,
    remove: (living_topic_id: string) =>
      call('living_topic.delete', { living_topic_id }) as Promise<{ ok: boolean }>,
    unlink: (living_topic_id: string, target_kind: string, target_entity_id: string) =>
      call('living_topic.unlink_entity', { living_topic_id, target_kind, target_entity_id }) as Promise<{ ok: boolean; living_topic: LivingTopic }>,
    showEntitySearch: (living_topic_id: string, living_topic_title: string) =>
      callNative('app.showEntitySearchForLivingTopic', { living_topic_id, living_topic_title }) as Promise<{ ok: boolean; error?: string }>,
    startChat: (living_topic_id: string) =>
      call('living_topic.start_chat', { living_topic_id }) as Promise<{ ok: boolean; chat_session_id: string; folder: string }>,
    openChatSession: (session_id: string) =>
      callNative('app.open', { ui: 'elma', query: { session_id } }) as Promise<{ ok: boolean; error?: string }>,
  },

  // Web-session usage/login (native, à la Arco) — per provider + subscription.
  webUsage: {
    fetch: (subscription: string, provider: string) =>
      callNative('webUsage.fetch', { subscription, provider }) as Promise<ClaudeUsageResult>,
    login: (subscription: string, provider: string) =>
      callNative('webUsage.login', { subscription, provider }) as Promise<{ ok: boolean }>,
    logout: (subscription: string) =>
      callNative('webUsage.logout', { subscription }) as Promise<{ ok: boolean }>,
    requests: (subscription: string, provider: string) =>
      callNative('webUsage.requests', { subscription, provider }) as Promise<WebRequestsResult>,
  },
  oauth: {
    open: (subscription: string, provider: string, url: string, redirect_uri: string) =>
      callNative('oauth.open', { subscription, provider, url, redirect_uri }) as Promise<{ ok: boolean; error?: string }>,
  },

  // Persist the last-good usage so it shows instantly next launch (DB cache).
  cacheUsage: (subscription: string, usage: ClaudeUsage | null) =>
    call('subscription.usage.cache', { name: subscription, usage }),

  knowledge: {
    chunks: (corpus = true, summaries = false, code = false, repo = 'Arbol', limit: number | null = null, offset = 0) =>
      call('knowledge.chunks', { corpus, summaries, code, repo, limit, offset }) as Promise<KnChunksView>,
    status: (repo = 'Arbol') => call('knowledge.status', { repo }) as Promise<KnStatus>,
    dashboardStatus: () => call('knowledge.dashboard_status') as Promise<KnDashboardStatus>,
    drifts: (repo = 'Arbol') => call('knowledge.drifts', { repo }).then((r) => r.drifts as KnDrift[]),
    refresh: (repo = 'Arbol') => call('knowledge.refresh', { repo }) as Promise<Record<string, number>>,
    openDrifts: (repo = 'Arbol') => call('knowledge.open_drifts', { repo }) as Promise<{ opened: number }>,
    embedderStatus: (repo?: string) => call('knowledge.embedder_status', { repo }) as Promise<KnEmbedStatus>,
    embedderSetKey: (key: string) => call('knowledge.embedder_set_key', { key }) as Promise<{ ok: boolean }>,
    embedderDeleteKey: () => call('knowledge.embedder_delete_key') as Promise<{ ok: boolean }>,
    embedCorpus: () => call('knowledge.embed_corpus') as Promise<{ started: boolean; running?: boolean }>,
    localEmbedderDownload: () =>
      call('knowledge.local_embedder_download') as Promise<{ started: boolean; running?: boolean }>,
    search: (query: string, k = 10, repo = 'Arbol') =>
      call('knowledge.search', { query, k, repo }).then((r) => r.results as KnSearchResult[]),
    codeSearch: (query: string, k = 12, repo = 'Arbol') =>
      call('knowledge.code_search', { query, k, repo }) as Promise<KnCodeSearch>,
    ingestCode: (repo = 'Arbol') => call('knowledge.ingest_code', { repo }) as Promise<{ files: number; chunks: number; added: number; updated: number; removed: number }>,
    brainRecipes: () => call('knowledge.brain_recipes').then((r) => r.recipes as KnBrainRecipe[]),
    brainRecipeSave: (r: KnBrainRecipe) => call('knowledge.brain_recipe_save', r) as Promise<{ ok: boolean }>,
    secretsStatus: () => call('knowledge.secrets_status') as Promise<{ secrets: Record<string, boolean> }>,
    secretsSet: (name: string, value: string) => call('knowledge.secrets_set', { name, value }) as Promise<{ ok: boolean }>,
    secretsDelete: (name: string) => call('knowledge.secrets_delete', { name }) as Promise<{ ok: boolean }>,
    mirrorsSettings: () => call('knowledge.mirrors_settings') as Promise<Record<string, string>>,
    jiraAuthStatus: () => call('knowledge.jira.auth_status') as Promise<
      { mode: 'bearer' | 'browser'; ready: boolean; url?: string }
    >,
    // Opens a real browser window; resolves once the sign-in completes.
    jiraLogin: () => call('knowledge.jira.login') as Promise<{ logged_in: boolean; account: string; profile: string }>,
    mirrorsSet: (s: Record<string, string>) => call('knowledge.mirrors_set', s) as Promise<{ ok: boolean }>,
    brainRecipeDelete: (name: string) => call('knowledge.brain_recipe_delete', { name }) as Promise<{ ok: boolean }>,
    planBuild: (repo = 'Arbol') => call('knowledge.plan_build', { repo }) as Promise<{ started: boolean; running?: boolean }>,
    planRegen: (repo = 'Arbol') => call('knowledge.plan_regen', { repo }) as Promise<KnRegenPlan>,
    planStatus: () => call('knowledge.plan_status') as Promise<{
      running: boolean; message: string; done: boolean; result: KnBuildPlan | null; error: string | null
    }>,
    buildTree: (recipe: string, repo = 'Arbol') =>
      call('knowledge.build_tree', { recipe, repo }) as Promise<{ started: boolean; running?: boolean }>,
    buildTreeStop: () => call('knowledge.build_tree_stop') as Promise<{ stopping: boolean }>,
    regenSummaries: (recipe: string, repo = 'Arbol') =>
      call('knowledge.regen_summaries', { recipe, repo }) as Promise<{ started: boolean; running?: boolean }>,
    raptorStatus: (repo = 'Arbol') => call('knowledge.raptor_status', { repo }) as Promise<KnRaptorStatus>,
    synchronizationStatus: () => call('knowledge.synchronization_status') as Promise<{
      enabled: boolean; sync_running: boolean; embedding_running: boolean
    }>,
    setSynchronization: (enabled: boolean) => call('knowledge.synchronization_set', { enabled }) as Promise<{
      enabled: boolean; sync_running: boolean; embedding_running: boolean
    }>,
    activity: (limit = 30, repo?: string, kind?: string) =>
      call('knowledge.activity', { limit, repo, kind }).then((r) => r.activity as KnActivity[]),
  },

  artifacts: {
    tree: (repo = 'Arbol') => call('artifacts.tree', { repo }) as Promise<ArtifactTree>,
    read: (path: string, repo = 'Arbol') => call('artifacts.read', { path, repo }) as Promise<ArtifactFile>,
    write: (path: string, content: string, repo = 'Arbol') =>
      call('artifacts.write', { path, content, repo }) as Promise<ArtifactWriteResult>,
    rename: (path: string, name: string, repo = 'Arbol') =>
      call('artifacts.rename', { path, name, repo }) as Promise<{ ok: boolean; old_path: string; path: string }>,
    remove: (path: string, repo = 'Arbol') =>
      call('artifacts.remove', { path, repo }) as Promise<{ ok: boolean; path: string }>,
    reveal: (path: string) =>
      callNative('file.reveal', { path }) as Promise<{ ok: boolean; error?: string }>,
    detach: (path: string, repoName?: string, repoPath?: string, theme?: string) =>
      callNative('repoArtifacts.detach', {
        path, repo_name: repoName, repo_path: repoPath, theme,
      }) as Promise<{ ok: boolean; error?: string }>,
  },
}
