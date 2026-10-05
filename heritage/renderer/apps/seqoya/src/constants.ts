/* Shared option lists for Intelligence Provider settings. Model catalogs are
 * provider-specific, so Seqoya lets users curate the enabled subset that
 * Elma's Ctrl+M cycles through. */

export type ModelOption = { value: string; label: string }

type ProviderKey = 'claude' | 'codex' | 'zai'

const PROVIDER_DEFAULT: ModelOption = { value: '', label: '(provider default)' }

export const CLAUDE_AVAILABLE_MODELS: ModelOption[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

export const CODEX_AVAILABLE_MODELS: ModelOption[] = [
  // Static fallback only — the live list comes from ip.models.fetch (client_version
  // -gated, so it reflects what this account can actually run). Keep the first
  // entry a currently-valid model (see universe_wire.DEFAULT_MODEL).
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
]

export const ZAI_AVAILABLE_MODELS: ModelOption[] = [
  // Static fallback for the z.ai (GLM Coding Plan) family — the live list comes
  // from ip.models.fetch (api.z.ai/api/paas/v4/models). NEVER put Anthropic or
  // OpenAI model ids here: a z.ai gateway can run only GLM models.
  { value: 'glm-5.3', label: 'GLM 5.3' },
  { value: 'glm-5.3-flash[1m]', label: 'GLM 5.3 Flash (1M)' },
]

export const CLAUDE_MODELS: ModelOption[] = [PROVIDER_DEFAULT, ...CLAUDE_AVAILABLE_MODELS]
export const CODEX_MODELS: ModelOption[] = [PROVIDER_DEFAULT, ...CODEX_AVAILABLE_MODELS]
export const ZAI_MODELS: ModelOption[] = [PROVIDER_DEFAULT, ...ZAI_AVAILABLE_MODELS]

// Back-compat for existing imports/stories: Claude was the original static list.
export const MODELS = CLAUDE_MODELS

export const THINKING_LEVELS = ['none', 'minimum', 'medium', 'high', 'xhigh', 'max', 'ultra']

function providerKey(provider: string | null | undefined): ProviderKey {
  switch ((provider || '').toLowerCase()) {
    case 'codex':
      return 'codex'
    case 'zai':
    case 'z.ai':
    case 'glm':
      return 'zai'
    case 'claude':
    default:
      return 'claude'
  }
}

export function hasModelManager(provider: string | null | undefined): boolean {
  switch (providerKey(provider)) {
    case 'claude':
    case 'codex':
    case 'zai':
      return true
  }
}

export function availableModelOptions(provider: string | null | undefined): ModelOption[] {
  switch (providerKey(provider)) {
    case 'codex':
      return CODEX_AVAILABLE_MODELS
    case 'zai':
      return ZAI_AVAILABLE_MODELS
    case 'claude':
      return CLAUDE_AVAILABLE_MODELS
  }
}

export function modelOptions(provider: string | null | undefined): ModelOption[] {
  switch (providerKey(provider)) {
    case 'codex':
      return CODEX_MODELS
    case 'zai':
      return ZAI_MODELS
    case 'claude':
      return CLAUDE_MODELS
  }
}

function allProviderOptions(): Record<ProviderKey, ModelOption[]> {
  return { claude: CLAUDE_MODELS, codex: CODEX_MODELS, zai: ZAI_MODELS }
}

function modelBelongsToProvider(value: string, provider: string | null | undefined): boolean {
  if (!value) return true
  return modelOptions(provider).some((m) => m.value === value)
}

function isKnownModelForAnotherProvider(value: string, provider: string | null | undefined): boolean {
  if (!value) return false
  const current = providerKey(provider)
  return Object.entries(allProviderOptions()).some(([key, opts]) => key !== current && opts.some((m) => m.value === value))
}

export function normalizeModelForProvider(value: string | null | undefined, provider: string | null | undefined): string {
  const normalized = value || ''
  if (modelBelongsToProvider(normalized, provider)) return normalized
  // Clear stale values created by the old one-size-fits-all dropdown, e.g. a
  // Claude model saved on Codex. Unknown ids are preserved because our static
  // list can lag provider-side model rotations.
  return isKnownModelForAnotherProvider(normalized, provider) ? '' : normalized
}

export function normalizeEnabledModelsForProvider(values: string[] | null | undefined, provider: string | null | undefined, defaultModel?: string | null): string[] {
  const seen = new Set<string>()
  for (const value of values || []) {
    const normalized = normalizeModelForProvider(value, provider)
    if (normalized) seen.add(normalized)
  }
  const def = normalizeModelForProvider(defaultModel, provider)
  if (def) seen.add(def)
  return [...seen]
}

export function defaultEnabledModels(provider: string | null | undefined, defaultModel?: string | null): string[] {
  const def = normalizeModelForProvider(defaultModel, provider)
  if (def) return [def]
  const first = availableModelOptions(provider)[0]?.value
  return first ? [first] : []
}

export function modelDropdownOptions(provider: string | null | undefined, current?: string | null): ModelOption[] {
  const options = modelOptions(provider)
  const normalized = normalizeModelForProvider(current, provider)
  if (!normalized || options.some((m) => m.value === normalized)) return options
  return [...options, { value: normalized, label: normalized }]
}

export function modelLabel(value: string | null | undefined, provider?: string | null): string {
  const normalized = value || ''
  const found = modelOptions(provider).find((m) => m.value === normalized)
  if (found) return found.label
  // If the setting contains a model id newer than our static list, show it
  // rather than incorrectly calling it the provider default.
  return normalized || '(provider default)'
}
