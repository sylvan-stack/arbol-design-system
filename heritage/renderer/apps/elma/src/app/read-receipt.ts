// Automatic projection refreshes acknowledge each response once. An explicit
// read must still reach Core: a later completion can have set unread again.
export function createReadReceipt(send: (sessionId: string) => Promise<unknown>) {
  let acknowledged = ''
  const pending = new Map<string, Promise<void>>()
  return (sessionId: string, responseKey: string, explicit = false): Promise<void> => {
    const key = `${sessionId}:${responseKey}`
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    if (!explicit && acknowledged === key) return Promise.resolve()
    const request = Promise.resolve().then(() => send(sessionId)).then(() => {
      acknowledged = key
    }).finally(() => { pending.delete(key) })
    pending.set(key, request)
    return request
  }
}
