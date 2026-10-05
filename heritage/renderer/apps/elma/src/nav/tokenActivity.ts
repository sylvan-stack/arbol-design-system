export type TokenActivityLevel = 0 | 1 | 2 | 3
export type TokenFlowDirection = 'input' | 'output'

// The provider reports cumulative token totals at irregular intervals. Convert
// each increase to tokens/second, smooth noisy updates, then let stale readings
// fall to zero so the cockpit does not imply that flow is still happening.
export const TOKEN_RATE_SMOOTHING_MS = 1_750
export const TOKEN_RATE_IDLE_GRACE_MS = 500
export const TOKEN_RATE_DECAY_MS = 2_500

// Input commonly arrives in larger batches than generated output, so each flow
// direction intentionally has its own experimental tokens/second bands.
export const TOKEN_RATE_THRESHOLDS = {
  input: { active: 1, busy: 250, veryBusy: 1_000 },
  output: { active: 1, busy: 25, veryBusy: 80 },
} as const

export function smoothTokenRate(
  previousRate: number,
  tokenDelta: number,
  elapsedMs: number,
  smoothingMs = TOKEN_RATE_SMOOTHING_MS,
): number {
  if (!Number.isFinite(tokenDelta) || tokenDelta <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return Math.max(0, Number.isFinite(previousRate) ? previousRate : 0)
  }

  const instantaneousRate = tokenDelta * 1_000 / elapsedMs
  const safePreviousRate = Math.max(0, Number.isFinite(previousRate) ? previousRate : 0)
  const alpha = 1 - Math.exp(-elapsedMs / Math.max(1, smoothingMs))
  return safePreviousRate + alpha * (instantaneousRate - safePreviousRate)
}

export function decayTokenRate(
  rate: number,
  idleMs: number,
  graceMs = TOKEN_RATE_IDLE_GRACE_MS,
  decayMs = TOKEN_RATE_DECAY_MS,
): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0
  if (!Number.isFinite(idleMs) || idleMs <= graceMs) return rate
  const remaining = 1 - (idleMs - graceMs) / Math.max(1, decayMs)
  return remaining > 0 ? rate * remaining : 0
}

/**
 * Keeps sampling bookkeeping outside Svelte's reactive graph.
 *
 * The previous implementation stored the baseline and current rate in `$state`.
 * Its effect therefore subscribed to the values that it also changed and ran a
 * second time immediately after every usage update. That second run replaced the
 * real observation timestamp with a zero-delta sample, so the next provider tick
 * was frequently measured against the wrong baseline and the meter stayed at 0.
 */
export class TokenRateMeter {
  private total: number | null = null
  private sampledAt = 0
  private measuredRate = 0
  private measuredAt = 0

  sample(total: number, now: number): { rate: number; measuredAt: number } {
    const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0
    const safeNow = Number.isFinite(now) ? now : Date.now()

    if (this.total === null) {
      this.total = safeTotal
      this.sampledAt = safeNow
      return { rate: 0, measuredAt: 0 }
    }

    if (safeTotal < this.total) {
      // A different session or a refreshed cumulative snapshot starts a new
      // series. Do not turn the backwards jump into artificial activity.
      this.total = safeTotal
      this.sampledAt = safeNow
      this.measuredRate = 0
      this.measuredAt = 0
      return { rate: 0, measuredAt: 0 }
    }

    if (safeTotal === this.total) {
      // Re-renders and unrelated streaming frames are not samples. In
      // particular, they must not move sampledAt forward.
      return { rate: this.measuredRate, measuredAt: this.measuredAt }
    }

    const elapsedMs = Math.max(1, safeNow - this.sampledAt)
    const livePrevious = this.measuredAt
      ? decayTokenRate(this.measuredRate, safeNow - this.measuredAt)
      : 0
    this.measuredRate = smoothTokenRate(livePrevious, safeTotal - this.total, elapsedMs)
    this.measuredAt = safeNow
    this.total = safeTotal
    this.sampledAt = safeNow
    return { rate: this.measuredRate, measuredAt: this.measuredAt }
  }
}

export function tokenActivityLevel(rate: number, direction: TokenFlowDirection): TokenActivityLevel {
  const thresholds = TOKEN_RATE_THRESHOLDS[direction]
  if (!Number.isFinite(rate) || rate < thresholds.active) return 0
  if (rate < thresholds.busy) return 1
  if (rate < thresholds.veryBusy) return 2
  return 3
}
