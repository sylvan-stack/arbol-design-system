import type { SessionTokenUsage } from '../api'

function finite(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

/** Add the active Turn's cumulative usage to the already-recorded session total. */
export function withLiveTokenUsage(
  recorded: SessionTokenUsage | null,
  live: SessionTokenUsage | null | undefined,
): SessionTokenUsage | null {
  if (!live) return recorded
  return {
    model: live.model || recorded?.model,
    tokens_in: finite(recorded?.tokens_in) + finite(live.tokens_in),
    tokens_out: finite(recorded?.tokens_out) + finite(live.tokens_out),
    cost_usd: finite(recorded?.cost_usd) + finite(live.cost_usd),
    ts: recorded?.ts,
  }
}

/**
 * Reconcile an eventually-consistent durable usage read without hiding counts
 * that were already observed on the live stream. The request_log projection can
 * briefly lag behind TURN_COMPLETED, and some unmetered subscriptions never
 * produce a durable row at all.
 */
export function reconcileRecordedTokenUsage(
  visible: SessionTokenUsage | null,
  recorded: SessionTokenUsage | null | undefined,
): SessionTokenUsage | null {
  if (!recorded) return visible
  if (!visible) return recorded
  return {
    model: recorded.model || visible.model,
    tokens_in: Math.max(finite(visible.tokens_in), finite(recorded.tokens_in)),
    tokens_out: Math.max(finite(visible.tokens_out), finite(recorded.tokens_out)),
    cost_usd: Math.max(finite(visible.cost_usd), finite(recorded.cost_usd)),
    ts: Math.max(finite(visible.ts), finite(recorded.ts)) || undefined,
  }
}
