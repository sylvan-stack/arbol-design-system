export const LARGE_TEXT_PASTE_THRESHOLD = 10_000

/** Keep ordinary clipboard text inline; only substantial pastes become files. */
export function isLargeTextPaste(text: string): boolean {
  return text.length >= LARGE_TEXT_PASTE_THRESHOLD
}

export function pastedTextFileLink(path: string, characterCount: number): string {
  const count = new Intl.NumberFormat('en-US').format(characterCount)
  return `[Pasted text (${count} characters)](${path})`
}
