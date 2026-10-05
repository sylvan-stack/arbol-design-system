export type RebuildProgress = {
  active?: boolean
  failed?: boolean
  awaitingRestart?: boolean
  message?: string
  phase?: string
  worktreeName?: string
  progress?: number
  expectedRemainingSeconds?: number
  predictionQuality?: 'exact-plan' | 'similar-plan' | 'fallback'
  phaseStartedAt?: number
  startedAt?: number
  finishedAt?: number
  updatedAt?: number
  historySamples?: number
  logPath?: string
}

export function elapsedAt(state: RebuildProgress, at: number): number {
  const end = state.active ? at : (state.finishedAt ?? state.updatedAt ?? at)
  return Math.max(0, end - (state.startedAt ?? end))
}

export function remainingAt(state: RebuildProgress, at: number): number {
  if (!state.active) return 0
  const estimate = Math.max(0, state.expectedRemainingSeconds ?? 0)
  const sinceEstimate = Math.max(0, at - (state.phaseStartedAt ?? at))
  return Math.max(0, estimate - sinceEstimate)
}

export function targetProgress(state: RebuildProgress, at: number): number {
  if (!state.active || state.expectedRemainingSeconds == null) {
    return Math.min(state.active ? 98 : 100, Math.max(0, state.progress ?? 0))
  }
  const elapsed = elapsedAt(state, at)
  const total = elapsed + remainingAt(state, at)
  // The native host may still be the previous app version, whose progress
  // includes a stale milestone floor. Use only the displayed elapsed and ETA.
  return Math.min(98, total > 0 ? elapsed / total * 100 : 0)
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  if (minutes < 10 && remainder > 0) return `${minutes}m ${remainder}s`
  return `${minutes}m`
}

export function timeLeftAt(state: RebuildProgress, at: number): string {
  if (state.expectedRemainingSeconds == null) return 'Estimating…'
  const remaining = Math.ceil(remainingAt(state, at))
  if (remaining <= 0) return 'Taking longer than estimated…'
  if (state.predictionQuality === 'fallback') {
    return remaining < 60
      ? 'less than a minute left'
      : `about ${Math.max(1, Math.round(remaining / 60))}m left`
  }
  return `~${formatDuration(remaining)} left`
}
