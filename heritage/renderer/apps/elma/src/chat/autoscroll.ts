export const AUTOSCROLL_POSITION_TOLERANCE_PX = 1

/** Ignore sub-pixel layout jitter, but stop immediately for a real upward scroll. */
export function scrolledUp(previousTop: number, currentTop: number): boolean {
  return currentTop < previousTop - AUTOSCROLL_POSITION_TOLERANCE_PX
}

/** Treat sub-pixel rounding at the end of the scroll range as the bottom. */
export function scrolledToBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - clientHeight - scrollTop <= AUTOSCROLL_POSITION_TOLERANCE_PX
}

/**
 * A Turn is live only when Core explicitly supplies null. Historic turns and
 * fixtures may omit the timestamp, but they are settled and must use completed-
 * chat opening behavior rather than bottom-follow mode.
 */
export function responseIsCompleted(respondedAt: number | null | undefined): boolean {
  return respondedAt !== null
}

export type OpenedChatScrollTarget = 'bottom' | 'final-answer'

/** Completed chats open at the beginning of the final answer; live chats follow the bottom. */
export function openedChatScrollTarget(
  responseCompleted: boolean,
  hasFinalAnswer: boolean,
): OpenedChatScrollTarget {
  return responseCompleted && hasFinalAnswer ? 'final-answer' : 'bottom'
}

/**
 * Extra trailing space needed for the final-answer separator to reach the top of
 * the viewport. Without it, a short final answer clamps scrollTop at the bottom
 * and leaves the separator partway down the chat area.
 */
export function finalAnswerOpeningSpacer(
  desiredScrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  currentSpacerHeight = 0,
): number {
  const contentHeightWithoutSpacer = Math.max(0, scrollHeight - currentSpacerHeight)
  return Math.max(0, desiredScrollTop + clientHeight - contentHeightWithoutSpacer)
}
