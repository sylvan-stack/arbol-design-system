import type { ArbolBridge } from './useProjection'

// A local hint fanout from the existing render stream, never canonical evidence.
// Weak bridge identity prevents mixing hosts; listeners own only their session.
const listeners = new WeakMap<ArbolBridge, Map<string, Set<() => void>>>()

export function onRenderInvalidation(bridge: ArbolBridge, session: string, notify: () => void): () => void {
  let sessions = listeners.get(bridge)
  if (!sessions) listeners.set(bridge, sessions = new Map())
  let callbacks = sessions.get(session)
  if (!callbacks) sessions.set(session, callbacks = new Set())
  callbacks.add(notify)
  return () => {
    callbacks!.delete(notify)
    if (!callbacks!.size) sessions!.delete(session)
    if (!sessions!.size) listeners.delete(bridge)
  }
}

export function notifyRenderInvalidation(bridge: ArbolBridge, session: string): void {
  for (const notify of [...(listeners.get(bridge)?.get(session) ?? [])]) {
    // An inspector must not break delivery of the main chat projection.
    try { notify() } catch { /* isolated observer */ }
  }
}
