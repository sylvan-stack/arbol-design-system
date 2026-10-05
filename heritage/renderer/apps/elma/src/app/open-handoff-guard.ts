export type SessionOpenIdentity = {
  session_id?: string
  session_open_id?: string
}

type PendingState = 'handling' | 'handled'

/**
 * Guards the renderer against duplicate delivery of one native app.open handoff.
 * Native can notify, activate, and inject the same durable pending payload through
 * several paths before app.consumeOpen clears it. The session_open_id identifies
 * that one physical open; only its first delivery may start attachment work.
 *
 * Unacknowledged identities are never capacity-evicted: doing so could admit a
 * delayed duplicate while the first attachment or consume is still in flight.
 * Only identities whose native consume has completed enter bounded retention.
 */
export class OpenHandoffGuard {
  private readonly pending = new Map<string, PendingState>()
  private readonly acknowledged = new Set<string>()

  constructor(private readonly capacity = 64) {}

  accept(payload: SessionOpenIdentity): boolean {
    const key = this.key(payload)
    // Older callers without native's correlation identity retain their previous
    // behavior. Current app.open always supplies session_open_id.
    if (!key) return true
    if (this.pending.has(key) || this.acknowledged.has(key)) return false
    this.pending.set(key, 'handling')
    return true
  }

  markHandled(payload: SessionOpenIdentity): void {
    const key = this.key(payload)
    if (key && this.pending.has(key)) this.pending.set(key, 'handled')
  }

  isHandled(payload: SessionOpenIdentity): boolean {
    const key = this.key(payload)
    return Boolean(key && this.pending.get(key) === 'handled')
  }

  markAcknowledged(payload: SessionOpenIdentity): void {
    const key = this.key(payload)
    if (!key) return
    this.pending.delete(key)
    this.acknowledged.delete(key)
    this.acknowledged.add(key)
    const capacity = Math.max(0, this.capacity)
    while (this.acknowledged.size > capacity) {
      const oldest = this.acknowledged.values().next().value
      if (typeof oldest !== 'string') break
      this.acknowledged.delete(oldest)
    }
  }

  forget(payload: SessionOpenIdentity): void {
    const key = this.key(payload)
    if (!key) return
    this.pending.delete(key)
    this.acknowledged.delete(key)
  }

  private key(payload: SessionOpenIdentity): string | null {
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
    const openId = typeof payload.session_open_id === 'string' ? payload.session_open_id : ''
    return sessionId && openId ? JSON.stringify([sessionId, openId]) : null
  }
}
