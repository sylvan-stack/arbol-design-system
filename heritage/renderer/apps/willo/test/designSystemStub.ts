// Test stub for '@arbol/design-system' (aliased in run-live-tails.mjs).
// liveTails.ts only needs the bridge trio; the real module assigns window
// hooks at import time and re-exports .svelte components, neither of which
// exists under node's test runner.

export type StreamEvent = {
  kind?: 'event' | 'error'
  sub_id: string
  event: string
  data: any
}

type Handler = (e: StreamEvent) => void

export type StubSub = { stream: string; params: any; handler: Handler; closed: boolean }

export const subs: StubSub[] = []
let reconnectCbs: Array<() => void> = []

export function subscribe(stream: string, params: any, onEvent: Handler): () => void {
  const rec: StubSub = { stream, params, handler: onEvent, closed: false }
  subs.push(rec)
  return () => { rec.closed = true }
}

export function onCoreReconnect(cb: () => void): () => void {
  reconnectCbs.push(cb)
  return () => { reconnectCbs = reconnectCbs.filter((c) => c !== cb) }
}

export function onCoreDisconnect(_cb: () => void): () => void {
  return () => {}
}

/** Test hook: simulate the bridge reconnecting. */
export function fireReconnect(): void {
  for (const cb of [...reconnectCbs]) cb()
}

/** Test hook: forget all subscriptions/callbacks between tests. */
export function reset(): void {
  subs.length = 0
  reconnectCbs = []
  nativeCalls.length = 0
  coreCalls.length = 0
}

export const nativeCalls: Array<{ method: string; params: any }> = []
export const coreCalls: Array<{ method: string; params: any }> = []
export let nativeResult: any = { ok: true }

export function setNativeResult(value: any): void { nativeResult = value }

export async function callNative(method: string, params: any = {}): Promise<any> {
  nativeCalls.push({ method, params })
  return nativeResult
}

export async function call(method: string, params: any = {}): Promise<any> {
  coreCalls.push({ method, params })
  return { ok: true }
}
