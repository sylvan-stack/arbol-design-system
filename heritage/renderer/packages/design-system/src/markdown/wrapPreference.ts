/* Global preference for wrapping long lines in Markdown/code blocks.
 * localStorage keeps the choice across chat sessions and app restarts, while a
 * same-document event updates every block already rendered in the current chat. */

export const CODE_BLOCK_WRAP_STORAGE_KEY = 'arbol:markdown:wrap-lines:v1'
export const CODE_BLOCK_WRAP_CHANGE_EVENT = 'arbol:markdown-wrap-change'

export function loadCodeBlockWrapPreference(storage?: Storage): boolean {
  if (!storage) return false
  try {
    return storage.getItem(CODE_BLOCK_WRAP_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveCodeBlockWrapPreference(storage: Storage | undefined, wrapped: boolean): void {
  if (!storage) return
  try {
    storage.setItem(CODE_BLOCK_WRAP_STORAGE_KEY, String(wrapped))
  } catch {
    // Storage can be disabled or full; the in-memory toggle must still work.
  }
}
