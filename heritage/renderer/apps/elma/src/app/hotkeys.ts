/** Cmd+Backspace is reserved for archiving the Chat Session currently open in Elma. */
export function isArchiveSessionHotkey(event: KeyboardEvent): boolean {
  return event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.shiftKey
    && event.key === 'Backspace'
}
