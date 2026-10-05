export const CHAT_NOTE_CLIPBOARD_HEADER = '### Chat Note ###'

/**
 * Extract Chat Note content from the plain-text clipboard interchange format.
 * The marker must be the complete first line; ordinary pasted text is ignored.
 */
export function pastedChatNoteContent(text: string): string | null {
  const firstBreak = text.search(/\r?\n/)
  const firstLine = firstBreak < 0 ? text : text.slice(0, firstBreak)
  if (firstLine !== CHAT_NOTE_CLIPBOARD_HEADER) return null
  if (firstBreak < 0) return ''
  const separatorLength = text[firstBreak] === '\r' && text[firstBreak + 1] === '\n' ? 2 : 1
  return text.slice(firstBreak + separatorLength)
}

export function copyableChatNote(content: string): string {
  return `${CHAT_NOTE_CLIPBOARD_HEADER}\n${content}`
}
