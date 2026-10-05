/* Renderer-local scroll positions for chat sessions.
 *
 * Scroll is UI state, so keeping it in localStorage avoids a Core round trip and
 * lets a session return to the same reading position after either a chat switch
 * or an app/window reopen. Each session gets its own key so one malformed entry
 * cannot invalidate the rest of the cache. */

const SCROLL_POSITION_PREFIX = 'arbol:elma:chat-scroll:v1:'

function scrollPositionKey(sessionId: string): string {
  return `${SCROLL_POSITION_PREFIX}${encodeURIComponent(sessionId)}`
}

export function loadChatScrollPosition(storage: Storage, sessionId: string | null | undefined): number {
  if (!sessionId) return 0
  try {
    const raw = storage.getItem(scrollPositionKey(sessionId))
    if (raw == null) return 0
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

export function saveChatScrollPosition(storage: Storage, sessionId: string | null | undefined, scrollTop: number): void {
  if (!sessionId || !Number.isFinite(scrollTop)) return
  try {
    storage.setItem(scrollPositionKey(sessionId), String(Math.max(0, scrollTop)))
  } catch {
    // Storage can be unavailable or full; scroll persistence must stay harmless.
  }
}
