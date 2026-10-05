export const QUICK_TEXT_ENTER_TOKEN = '[ENTER]'

export type ExpandedQuickText = {
  text: string
  submit: boolean
}

/**
 * Expand commands embedded in Quick Text content.
 *
 * Newlines remain ordinary composer content. [ENTER] is deliberately different:
 * it is removed from the inserted text and asks the composer to perform its
 * normal Cmd+Enter submission after the draft has been updated.
 */
export function expandQuickText(content: string): ExpandedQuickText {
  const submit = content.includes(QUICK_TEXT_ENTER_TOKEN)
  return {
    text: submit ? content.replaceAll(QUICK_TEXT_ENTER_TOKEN, '') : content,
    submit,
  }
}
