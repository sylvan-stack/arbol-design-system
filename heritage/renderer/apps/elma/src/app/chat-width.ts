/* Renderer-local, persisted reading width for Elma's centered chat column. */
export const ELMA_CHAT_WIDTH_KEY = 'arbol-chat-width:elma'
export const DEFAULT_CHAT_WIDTH = 720
export const MIN_CHAT_WIDTH = 600
export const MAX_CHAT_WIDTH = 1680
export const CHAT_WIDTH_STEP = 120

export function clampChatWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_WIDTH
  return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, Math.round(value)))
}
