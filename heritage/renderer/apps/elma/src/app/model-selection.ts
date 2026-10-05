export type ModelValue = { value: string }

/**
 * Reconcile Elma's explicit per-turn model after IP reference data changes.
 *
 * `ip.list` and the Chat Session projection refresh independently. During that
 * window the attached IP may be absent even though its name is still known. An
 * unresolved IP is therefore not evidence that the selected model is invalid;
 * only a resolved IP with a concrete allow-list may clear it.
 */
export function modelAfterOptionsRefresh(
  selectedModel: string,
  activeIpResolved: boolean,
  modelOptions: readonly ModelValue[],
): string {
  if (!selectedModel || !activeIpResolved) return selectedModel
  return modelOptions.some((option) => option.value === selectedModel)
    ? selectedModel
    : ''
}

/** Cycle from the model currently shown, including an implicit provider default. */
export function nextModelSelection(
  currentModelForDisplay: string,
  modelOptions: readonly ModelValue[],
): string {
  if (modelOptions.length === 0) return ''
  const currentIndex = modelOptions.findIndex((option) => option.value === currentModelForDisplay)
  return modelOptions[(currentIndex + 1) % modelOptions.length].value
}


export const THINKING_LEVELS = ['none', 'minimum', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export function enabledThinkingLevels(
  settings: Record<string, string[]> | null | undefined,
  model: string | null | undefined,
): ThinkingLevel[] {
  const configured = settings?.[model || '']
  if (!configured) return [...THINKING_LEVELS]
  const valid = configured.filter((level): level is ThinkingLevel => THINKING_LEVELS.includes(level as ThinkingLevel))
  return valid.length ? valid : [...THINKING_LEVELS]
}

export function thinkingAfterModelChange(current: ThinkingLevel, enabled: readonly ThinkingLevel[]): ThinkingLevel {
  return enabled.includes(current) ? current : (enabled[0] || 'high')
}
